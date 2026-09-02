#!/usr/bin/env node
/*
 * Container-free eval runner — the cross-platform peer to run-evals-docker.ts.
 * Docker's only load-bearing guarantee was that real provider CLIs are absent
 * (so an un-stubbed command fails safe rather than hitting production); this
 * reconstructs that with a pure PATH allowlist (scrubbed-path.ts), so evals run
 * natively everywhere — including Termux, where Docker cannot.
 *
 * Like the Docker runner, each skill runs in its OWN isolated context, bounded-
 * parallel: one process per suite, each with its own stub dir (front of a
 * scrubbed PATH), a clean HOME holding only the credentials, a from-scratch env,
 * and its own workspace holding only the skills it declares — the process-level
 * stand-in for one container per skill. A suite that mocks its deps therefore
 * can't clobber the real skills another suite is testing. A fail-safe self-test
 * runs first and aborts if any danger CLI is reachable.
 *
 *   pnpm eval                 # all suites, bounded-parallel
 *   pnpm eval gtb-gh-reviewer-followup-plan  # filter to one skill
 *   pnpm eval --repeat 3      # flags forwarded to promptfoo
 *
 * Auth: reads the local keyless Claude session (~/.claude) or ANTHROPIC_API_KEY,
 * exactly like the container path. Only the credentials reach each suite's clean
 * HOME, linked so a refresh persists, so the developer's personal ~/.claude
 * config never colours the eval agent. A suite's skills (and any mock overlay)
 * live in its workspace, never the repo's own .claude/skills.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import spawn from 'cross-spawn';
import * as v from 'valibot';
import { parse as parseYaml } from 'yaml';
import { beginEphemeralRun } from './ephemeral-run.ts';
import { evalIsolation } from './eval-isolation.ts';
import { buildEvalEnv } from './scrubbed-path.ts';
import { resolveSkillsCli } from '#evals/lib/skills-cli.ts';

const { assertFailSafe, buildScrubbedPath, poisonDangerTools } = evalIsolation;

/**
 * `process.argv` leads with the node binary and this script.
 */
const cliArgsIndex = 2;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* The skills CLI installs into cwd/.claude/skills (no target-dir flag), so each
 * suite's skills are populated by running it with cwd = that suite's workspace. */
const skillsCli = resolveSkillsCli();

/*
 * Minimal ANSI colouring, dependency-free. Only when stdout is a TTY and
 * NO_COLOR is unset (respecting a FORCE_COLOR override), so captured/piped runs
 * stay plain — keeping the failure-dump capture and any log scraping clean.
 */
const isColorEnabled =
  process.env['FORCE_COLOR'] !== undefined ||
  (process.stdout.isTTY && process.env['NO_COLOR'] === undefined);
const paint = (code: string, text: string): string =>
  isColorEnabled ? `[${code}m${text}[0m` : text;
const green = (text: string): string => paint('32', text);
const red = (text: string): string => paint('31', text);
const cyan = (text: string): string => paint('36', text);
const dim = (text: string): string => paint('2', text);
const bold = (text: string): string => paint('1', text);

const args = process.argv.slice(cliArgsIndex);
const firstFlag = args.findIndex(arg => arg.startsWith('-'));
const nameFilters = firstFlag === -1 ? args : args.slice(0, firstFlag);
const passthrough = firstFlag === -1 ? [] : args.slice(firstFlag);

const realCreds = path.join(homedir(), '.claude', '.credentials.json');
const hasCreds = existsSync(realCreds);
if (!hasCreds && process.env['ANTHROPIC_API_KEY'] === undefined) {
  console.error('No auth: log in to Claude Code or set ANTHROPIC_API_KEY.');
  process.exit(1);
}

const suites = readdirSync(path.join(root, 'evals'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .filter(name => nameFilters.length === 0 || nameFilters.includes(name))
  .filter(name =>
    existsSync(path.join(root, 'evals', name, 'promptfooconfig.yaml')),
  );

if (suites.length === 0) {
  console.error('No eval suites found for:', nameFilters.join(', ') || '(all)');
  process.exit(1);
}

const { keep, mintDir } = beginEphemeralRun();

/* Says its piece the first time only, however many suites hit the same fallback.
 * A closure rather than a module-level flag, which a function may not reassign. */
const warnOnce = (message: string): (() => void) => {
  let hasWarned = false;
  return () => {
    if (hasWarned) return;
    hasWarned = true;
    console.error(dim(message));
  };
};
const warnCredentialsCopied = warnOnce(
  'Credentials copied, not linked; a refresh mid-run will not persist.',
);

/**
 * Puts the credentials in a suite's clean HOME.
 *
 * Linked rather than copied, so a token refresh during the run lands on the real
 * file — what the container's read-write bind mount already arranges, and the
 * reason it is mounted that way. Providers rotate refresh tokens, so a refresh
 * confined to a directory about to be deleted can leave the developer's own
 * session holding a dead one.
 *
 * A hard link covers a host that withholds symlink privilege (Windows outside
 * developer mode) and a copy is the last resort, for a temp dir on another
 * volume. Only that case cannot carry a refresh, and it says so.
 */
const placeCredentials = (destination: string): void => {
  try {
    symlinkSync(realCreds, destination);
    return;
  } catch {
    // Fall through: a hard link needs no privilege, only the same volume.
  }
  try {
    linkSync(realCreds, destination);
    return;
  } catch {
    // Fall through: cross-volume temp, or a filesystem without hard links.
  }
  copyFileSync(realCreds, destination);
  warnCredentialsCopied();
};

/**
 * Mints a fresh, isolated environment: its own stub dir (front of a scrubbed
 * PATH) and a clean HOME holding only the credentials, so parallel suites never
 * share STUB_BINDIR, call logs, or the developer's ~/.claude.
 */
const isolatedEnv = (): {
  env: Record<string, string>;
  allow: string[];
  missing: string[];
} => {
  const stubDir = mintDir('skills-eval-bin-');
  const homeDir = mintDir('skills-eval-home-');
  /* Before anything else lands in the dir: a suite's own stub is written over
   * the poison later, so declared doubles still win. */
  poisonDangerTools(stubDir);
  if (hasCreds) {
    mkdirSync(path.join(homeDir, '.claude'), { recursive: true });
    placeCredentials(path.join(homeDir, '.claude', '.credentials.json'));
  }
  const scrubbed = buildScrubbedPath({ stubDir });
  const env = buildEvalEnv({ scrubbedPath: scrubbed.path, stubDir, homeDir });
  if (process.platform === 'win32') {
    const bashDir = scrubbed.allow.find(dir =>
      existsSync(path.join(dir, 'bash.exe')),
    );
    if (bashDir !== undefined)
      env['CLAUDE_CODE_GIT_BASH_PATH'] = path.join(bashDir, 'bash.exe');
  }
  return { env, allow: scrubbed.allow, missing: scrubbed.missing };
};

// Preflight on one isolated env: validate the toolchain + fail-safe once, before
// any suite spawns.
const preflight = isolatedEnv();
if (preflight.missing.length > 0) {
  console.error(
    `PATH allowlist is missing required tools: ${preflight.missing.join(', ')}`,
  );
  process.exit(1);
}
if (
  process.platform === 'win32' &&
  preflight.env['CLAUDE_CODE_GIT_BASH_PATH'] === undefined
) {
  console.error(
    'Git Bash (bash.exe) not found on the allowlisted PATH; install Git for Windows.',
  );
  process.exit(1);
}
const failures = assertFailSafe({
  run: (command, cmdArgs, options) => spawn.sync(command, cmdArgs, options),
  scrubbedPath: preflight.env['PATH'] ?? '',
  stubDir: preflight.env['STUB_BINDIR'] ?? '',
});
if (failures.length > 0) {
  console.error('Fail-safe self-test failed — refusing to run:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `${green('✓')} ${dim(
    `Isolation: ${String(preflight.allow.length)} allowlisted dir(s); ` +
    'gh/az/pwsh unreachable or shadowed.',
  )}`,
);

/**
 * Suites at once; mirrors run-evals-docker.ts — the agent work is the cost.
 */
const concurrency = 4;
/**
 * Exit code stood in for a spawn that never reported one.
 */
const unknownExitCode = 1;
// Lines of the (debug-verbose) capture to show on failure — enough for the
// results table + tally at the tail, without dumping the whole debug log.
const failTailLines = 120;
// promptfoo logs one of these per finished test — but only at debug level in a
// non-TTY run (otherwise it's the TTY bar). We stream just this line so each
// suite reports per-test progress without the rest of the debug noise.
const perTestLog = /Eval #\d+ complete \((?<done>\d+) of (?<total>\d+)\)/v;
const newline = /\r?\n/v;

/* Maps a promptfoo provider id to the `skills` CLI agent target (the `-a` flag,
 * which selects the on-disk layout). Centralised so a suite never repeats it. */
const agentForProvider = (id: string | undefined): string => {
  if (id?.startsWith('anthropic:claude-agent-sdk') === true) return 'claude-code';
  throw new Error(`no agent mapping for provider '${String(id)}'`);
};

/* Just the slice of a promptfoo config the runner needs — each provider's id and
 * declared skills — split into named sub-schemas so the nesting stays readable.
 * Parsed through valibot so a malformed config fails readably rather than
 * deref'ing undefined; unrelated keys are ignored. */
const skillsSchema = v.optional(v.array(v.string()));
const providerConfigSchema = v.optional(v.object({ skills: skillsSchema }));
const providerObjectSchema = v.object({
  id: v.optional(v.string()),
  config: providerConfigSchema,
});
const providerSchema = v.union([v.string(), providerObjectSchema]);
const suiteConfigSchema = v.object({
  providers: v.optional(v.array(providerSchema)),
});

/**
 * Installs the named skills into the workspace under one agent's layout.
 */
const installSkills = (options: {
  workspace: string;
  suiteName: string;
  agent: string;
  names: string[];
  env: Record<string, string>;
}): void => {
  const { workspace, suiteName, agent, names, env } = options;
  const skillArgs = names.flatMap(name => ['-s', name]);
  const result = spawn.sync(
    'node',
    [skillsCli, 'add', root, '-a', agent, '--copy', '-y', ...skillArgs],
    { cwd: workspace, env, encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(
      `skills add failed for ${suiteName}/${agent}: ${result.stdout}${result.stderr}`,
    );
};

// Groups a config's declared skills by their provider's agent target.
const skillsByAgent = (
  config: v.InferOutput<typeof suiteConfigSchema>,
): Map<string, Set<string>> => {
  const byAgent = new Map<string, Set<string>>();
  const providers = config.providers ?? [];
  for (const provider of providers) {
    if (typeof provider === 'string') continue;
    const agent = agentForProvider(provider.id);
    const names = byAgent.get(agent) ?? new Set<string>();
    const declared = provider.config?.skills ?? [];
    for (const name of declared) names.add(name);
    byAgent.set(agent, names);
  }
  return byAgent;
};

/**
 * Populates a suite's workspace with ONLY the skills it declares, per provider,
 * into that provider's agent layout — isolation by default, so the other skills
 * in a large repo can't pollute the run. Reads the declared skills straight from
 * the suite's promptfoo config (the single source of truth).
 */
const populateWorkspace = (
  workspace: string,
  suiteName: string,
  env: Record<string, string>,
): void => {
  writeFileSync(
    path.join(workspace, 'package.json'),
    '{ "name": "eval-workspace", "private": true }\n',
  );
  /* Stage the suite's own fixtures into the workspace so an agent that reads its
   * inputs directly can reach them — the SDK sandboxes it to working_dir, and
   * the fixtures otherwise sit in the repo, outside it. These are test inputs,
   * not the tainting repo config the workspace deliberately withholds. */
  const fixtures = path.join(root, 'evals', suiteName, 'fixtures');
  if (existsSync(fixtures))
    cpSync(fixtures, path.join(workspace, 'evals', suiteName, 'fixtures'), {
      recursive: true,
    });
  const configPath = path.join(root, 'evals', suiteName, 'promptfooconfig.yaml');
  const config = v.parse(suiteConfigSchema, parseYaml(readFileSync(configPath, 'utf8')));
  for (const [agent, names] of skillsByAgent(config))
    if (names.size > 0)
      installSkills({ workspace, suiteName, agent, names: [...names], env });
};

/* Builds a stdout/stderr handler that prints a tagged per-test line as each
 * finishes, buffering partial lines across chunks. */
const perTestStreamer = (name: string): ((chunk: Buffer) => void) => {
  let pending = '';
  return (chunk) => {
    pending += String(chunk);
    const lines = pending.split(newline);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      const groups = perTestLog.exec(stripVTControlCharacters(line))?.groups;
      if (groups !== undefined)
        console.log(
          dim(`    [${name}] ${groups['done'] ?? ''}/${groups['total'] ?? ''}`),
        );
    }
  };
};

interface SuiteResult {
  name: string;
  code: number;
  out: string;
  workspace: string;
}

/**
 * Runs one suite's isolated process, streaming a tagged per-test progress line
 * as each test finishes while capturing the full output for a failure dump.
 */
const runSuite = async (name: string): Promise<SuiteResult> =>
  new Promise<SuiteResult>((resolve) => {
    const { env } = isolatedEnv();
    const workspace = mintDir('skills-eval-ws-');
    try {
      populateWorkspace(workspace, name, env);
    } catch (error) {
      resolve({ name, code: unknownExitCode, out: String(error), workspace });
      return;
    }
    const child = spawn(
      'node',
      [path.join(root, 'scripts', 'run-evals.ts'), name, ...passthrough],
      { cwd: root, env: { ...env, EVAL_WORKSPACE: workspace, LOG_LEVEL: 'debug' } },
    );
    let out = '';
    const stream = perTestStreamer(name);
    const onData = (chunk: Buffer): void => {
      out += String(chunk);
      stream(chunk);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('close', (code) => {
      resolve({ name, code: code ?? unknownExitCode, out, workspace });
    });
  });

// Bounded-parallel: each suite is a fully isolated process; suite-level start/
// done lines are the progress (interleaved per-suite stdio would be unreadable).
console.log(
  bold(
    `Running ${String(suites.length)} suite(s) ` +
    `(concurrency ${String(concurrency)})…`,
  ),
);
const results: SuiteResult[] = [];
const queue = [...suites];
const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    console.log(`  ${cyan('→')} ${name} ${dim('started')}`);
    const result = await runSuite(name);
    console.log(`  ${result.code === 0 ? green('✓') : red('✗')} ${name}`);
    results.push(result);
  }
});
await Promise.all(workers);

const failed = results.filter(result => result.code !== 0);
for (const result of failed) {
  const tail = stripVTControlCharacters(result.out)
    .split(newline)
    .slice(-failTailLines)
    .join('\n');
  console.log(`\n${red(`===== ${result.name} output (tail) =====`)}\n${tail}`);
  /* Held back from the sweep: what the runner installed into a failed suite's
   * workspace is usually the evidence for why it failed. */
  keep(result.workspace);
  console.log(dim(`  workspace kept at ${result.workspace}`));
}
const passed = results.length - failed.length;
const tally = `${String(passed)}/${String(results.length)} suite(s) passed`;
console.log(`\n${bold(failed.length > 0 ? red(tally) : green(tally))}`);
process.exit(failed.length > 0 ? 1 : 0);
