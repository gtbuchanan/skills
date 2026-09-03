/*
 * Containerized eval runner — the fully-sealed alternative to `pnpm eval`
 * (run-evals-process.ts) for hosts that prefer a Linux container over the
 * native PATH allowlist.
 *
 * Each skill runs in its OWN container, in parallel (bounded), on the
 * skills-eval-net network. In the container the stub is installed into
 * /usr/local/bin and the real CLIs are never installed, so interception is
 * deterministic and mocked services can't be reached. Each container does
 * `promptfoo eval --share`, uploading results to the self-hosted server
 * (docker-compose.yml) — browse them at http://localhost:3000.
 *
 *   docker compose up -d               # once: start the results server
 *   pnpm eval:docker                   # all suites, in parallel
 *   pnpm eval:docker gtb-gh-reviewer-followup-apply   # filter to one skill
 *   pnpm eval:docker --repeat 3        # flags forwarded to promptfoo
 *
 * Auth: mounts the local keyless Claude session (~/.claude/.credentials.json,
 * RW for refresh) if present; otherwise forwards ANTHROPIC_API_KEY.
 * Behind a TLS-inspection proxy, drop the proxy root CA at
 * artifacts/ca-bundle.pem and it's trusted automatically.
 */
import type { SpawnOptions } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { repoRoot as root } from '@gtbuchanan/agent-skills-harness/paths';
import spawn from 'cross-spawn';

/**
 * `process.argv` leads with the node binary and this script.
 */
const cliArgsIndex = 2;

/**
 * Docker wants forward slashes in volume paths, including on Windows.
 */
const toHostPath = (target: string): string => target.replaceAll('\\', '/');

const args = process.argv.slice(cliArgsIndex);
const firstFlag = args.findIndex(arg => arg.startsWith('-'));
const nameFilters = firstFlag === -1 ? args : args.slice(0, firstFlag);
const passthrough = firstFlag === -1 ? [] : args.slice(firstFlag);

const skills = readdirSync(path.join(root, 'evals'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .filter(name => nameFilters.length === 0 || nameFilters.includes(name))
  .filter(name =>
    existsSync(path.join(root, 'evals', name, 'promptfooconfig.yaml')),
  );

if (skills.length === 0) {
  console.error('No eval suites found for:', nameFilters.join(', ') || '(all)');
  process.exit(1);
}

/**
 * Exit code stood in for a spawn that never reported one.
 */
const unknownExitCode = 1;

const image = 'agent-skills-eval';

/**
 * Runs a command to completion. Output is captured unless the caller asked for
 * inherited stdio, in which case it streams and `out` stays empty.
 */
const sh = async (
  command: string,
  commandArgs: string[],
  options: SpawnOptions = {},
): Promise<{ code: number; out: string }> =>
  new Promise((resolve) => {
    const child = spawn(command, commandArgs, options);
    let out = '';
    if (!options.stdio) {
      child.stdout?.on('data', (chunk: Buffer) => (out += String(chunk)));
      child.stderr?.on('data', (chunk: Buffer) => (out += String(chunk)));
    }
    child.on('close', (code) => {
      resolve({ code: code ?? unknownExitCode, out });
    });
  });

// Build the image and ensure the results server + network are up.
const build = await sh(
  'docker',
  ['build', '-t', image, '-f', path.join(root, 'Dockerfile'), root],
  { stdio: 'inherit' },
);
if (build.code !== 0) process.exit(1);

const compose = await sh('docker', ['compose', 'up', '-d'], {
  cwd: root,
  stdio: 'inherit',
});
if (compose.code !== 0) process.exit(1);

mkdirSync(path.join(root, 'artifacts', 'skill-evals'), { recursive: true });

const creds = path.join(homedir(), '.claude', '.credentials.json');
const hasCreds = existsSync(creds);
const hasKey = Boolean(process.env['ANTHROPIC_API_KEY']);
if (!hasCreds && !hasKey) {
  console.error('No auth: log in to Claude Code or set ANTHROPIC_API_KEY.');
  process.exit(1);
}

/**
 * Containers to run at once — the agent work, not the server, is the cost.
 */
const concurrency = 4;
const network = 'skills-eval-net';

const commonMounts = [
  /* skills/ is the sync source; evals/ carries the suites. packages/ carries
     the harness they import and this runner's own in-container half — mounted
     rather than left to the image, so the container runs the source on disk.
     Their manifests are baked in at build time (see the Dockerfile) because
     pnpm has to link the workspace packages before any of this is mounted.
     scripts/ is down to sync-skills.mjs, which the entrypoint runs as
     `pnpm skills:sync`; it stays at the root with the skills/ tree it
     deploys. */
  ['skills', '/work/skills'],
  ['evals', '/work/evals'],
  ['packages', '/work/packages'],
  ['scripts', '/work/scripts'],
  ['artifacts', '/work/artifacts'],
].flatMap(([source, destination]) => [
  '-v',
  `${toHostPath(path.join(root, String(source)))}:${String(destination)}`,
]);
if (hasCreds) {
  commonMounts.push(
    '-v',
    `${toHostPath(creds)}:/root/.claude/.credentials.json`,
  );
}

const env = [
  '-e',
  'PROMPTFOO_REMOTE_API_BASE_URL=http://promptfoo-server:3000',
  '-e',
  'PROMPTFOO_REMOTE_APP_BASE_URL=http://localhost:3000',
  // The container is the workspace: skills sync here and working_dir resolves to
  // it. Each container is already one isolated skill tree, so no per-suite copy.
  '-e',
  'EVAL_WORKSPACE=/work',
];
if (existsSync(path.join(root, 'artifacts', 'ca-bundle.pem'))) {
  env.push('-e', 'NODE_EXTRA_CA_CERTS=/work/artifacts/ca-bundle.pem');
}
if (hasKey) env.push('-e', 'ANTHROPIC_API_KEY');

const runSkill = async (
  name: string,
): Promise<{ name: string; code: number; out: string }> => {
  const result = await sh('docker', [
    'run',
    '--rm',
    '--network',
    network,
    ...commonMounts,
    ...env,
    image,
    'sh',
    '/work/packages/eval-runner/bin/docker-entrypoint.sh',
    name,
    '--share',
    ...passthrough,
  ]);
  return { name, ...result };
};

// Bounded-parallel: the expensive agent work runs concurrently; the server
// serializes result ingestion internally.
console.log(
  `Running ${String(skills.length)} suite(s) in containers ` +
  `(concurrency ${String(concurrency)})…`,
);
const results: { name: string; code: number; out: string }[] = [];
const queue = [...skills];
const workers = Array.from(
  { length: Math.min(concurrency, queue.length) },
  async () => {
    while (queue.length > 0) {
      const name = queue.shift();
      if (name === undefined) return;
      console.log(`  → ${name} started`);
      const result = await runSkill(name);
      console.log(`  ${result.code === 0 ? '✓' : '✗'} ${name}`);
      results.push(result);
    }
  },
);
await Promise.all(workers);

const failed = results.filter(result => result.code !== 0);
for (const result of failed) {
  const plain = stripVTControlCharacters(result.out);
  console.log(`\n===== ${result.name} output =====\n${plain}`);
}
const passed = results.length - failed.length;
console.log(
  `\n${String(passed)}/${String(results.length)} suite(s) passed · ` +
  'view: http://localhost:3000',
);
process.exit(failed.length > 0 ? 1 : 0);
