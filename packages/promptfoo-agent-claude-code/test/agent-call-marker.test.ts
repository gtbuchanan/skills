/*
 * Tests that Claude Code's runtime still marks the agent's calls the way
 * `agentCallMarker` says.
 *
 * The marker is undocumented runtime behavior, so this runs the real runtime:
 * a git double at the front of PATH records, for every call, whether it
 * carried the marker, and the agent is asked to run one git command the
 * runtime never would. An upgrade that moves the marker fails here rather
 * than mixing the runtime's calls into every suite's log.
 *
 * It needs a login and spends a short model call, so it runs with the slow
 * tests and only where Claude Code is signed in or ANTHROPIC_API_KEY is set.
 *
 * @module-tag slow
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import * as v from 'valibot';
import { test } from 'vitest';
import { claudeCode } from '@gtbuchanan/promptfoo-agent-claude-code/agent';

const isWindows = process.platform === 'win32';
const credentials = path.join(homedir(), claudeCode.auth.credentialsFile);
const canSignIn = existsSync(credentials) || process.env[claudeCode.auth.apiKeyVar] !== undefined;

/**
 * The command the agent is asked to run, which the runtime never makes.
 */
const probe = ['config', '--get', 'agentcallmarker.probe'];

const CallSchema = v.object({ argv: v.array(v.string()), marked: v.boolean() });

/**
 * The SDK's native runtime for this host.
 */
const nativeRuntime = (): string => {
  const sdk = claudeCode.executable.sdkPackage;
  const fromSdk = createRequire(createRequire(import.meta.url).resolve(sdk));
  const manifest = fromSdk.resolve(`${sdk}-${process.platform}-${process.arch}/package.json`);
  return path.join(path.dirname(manifest), isWindows ? 'claude.exe' : 'claude');
};

/**
 * The first directory on PATH holding `file`.
 */
const onPath = (file: string): string | undefined =>
  (process.env['PATH'] ?? '').split(path.delimiter).find(dir => existsSync(path.join(dir, file)));

/**
 * A git double in `dir` that records each call, and whether it carried the
 * marker, to `log`, then runs the real git.
 */
const plantDouble = (dir: string, log: string, realGit: string): void => {
  const recorder = path.join(dir, 'record.mjs');
  writeFileSync(recorder, String.raw`import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(log)}, JSON.stringify({
  argv: process.argv.slice(2),
  marked: process.env[${JSON.stringify(claudeCode.agentCallMarker)}] !== undefined,
}) + '\n');
`);
  const toPosix = (file: string): string => (isWindows
    ? `/${file.slice(0, 1).toLowerCase()}${file.slice(2).replaceAll('\\', '/')}`
    : file);
  writeFileSync(path.join(dir, 'git'), [
    '#!/bin/sh',
    `'${toPosix(process.execPath)}' '${toPosix(recorder)}' "$@"`,
    `exec '${toPosix(realGit)}' "$@"`,
    '',
  ].join('\n'), { mode: 0o755 });
  if (isWindows)
    writeFileSync(path.join(dir, 'git.cmd'),
      `@"${process.execPath}" "${recorder}" %*\r\n@"${realGit}" %*\r\n`);
};

/**
 * A home holding only the login, linked so a refresh lands on the real file.
 */
const homeWithLogin = (home: string): void => {
  if (!existsSync(credentials)) return;
  const destination = path.join(home, claudeCode.auth.credentialsFile);
  mkdirSync(path.dirname(destination), { recursive: true });
  try {
    symlinkSync(credentials, destination);
  } catch {
    linkSync(credentials, destination);
  }
};

/**
 * Where a run of the runtime keeps its double, home and workspace.
 */
interface Sandbox {
  readonly doubles: string;
  readonly home: string;
  readonly log: string;
  readonly workspace: string;
}

/**
 * A fresh sandbox under the temp dir.
 */
const sandbox = (): Sandbox => {
  const root = mkdtempSync(path.join(tmpdir(), 'agent-call-marker-'));
  const box = {
    doubles: path.join(root, 'bin'),
    home: path.join(root, 'home'),
    log: path.join(root, 'calls.jsonl'),
    workspace: path.join(root, 'ws'),
  };
  for (const dir of [box.doubles, box.home, box.workspace]) mkdirSync(dir);
  writeFileSync(box.log, '');
  return box;
};

/**
 * The environment the runtime gets: built from scratch, as the runner builds
 * it, so nothing of the session running the tests reaches it.
 *
 * Git for Windows' bin/bash.exe rebuilds PATH for a login shell, putting its
 * own git first; usr/bin/bash.exe keeps the PATH it is given, as the runner
 * relies on.
 */
const runtimeEnv = (box: Sandbox, gitDir: string): Record<string, string> => {
  const bashDir = path.join(path.dirname(gitDir), 'usr', 'bin');
  const passed = ['SystemRoot', 'ComSpec', 'TEMP', 'TMP', claudeCode.auth.apiKeyVar]
    .flatMap((name): [string, string][] => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    });
  const shared: Record<string, string> = { ...Object.fromEntries(passed), HOME: box.home };
  return isWindows
    ? {
        ...shared,
        PATH: [box.doubles, gitDir, bashDir].join(path.delimiter),
        USERPROFILE: box.home,
        [claudeCode.gitBashVar]: path.join(bashDir, 'bash.exe'),
      }
    : { ...shared, PATH: [box.doubles, gitDir, '/usr/bin', '/bin'].join(path.delimiter) };
};

/**
 * Has the runtime run the probe through its Bash tool, and returns every git
 * call the double saw, with whether each carried the marker.
 */
const runProbe = (): {
  readonly calls: v.InferOutput<typeof CallSchema>[];
  readonly exit: number | null;
} => {
  const box = sandbox();
  const gitDir = onPath(isWindows ? 'git.exe' : 'git') ?? '';
  const realGit = path.join(gitDir, isWindows ? 'git.exe' : 'git');
  plantDouble(box.doubles, box.log, realGit);
  homeWithLogin(box.home);
  spawnSync(realGit, ['init', '-q', box.workspace]);

  const result = spawnSync(nativeRuntime(), [
    '-p', `Run this with the Bash tool and nothing else, then reply "done": git ${probe.join(' ')}`,
    '--model', 'haiku',
    '--allowedTools', 'Bash',
  ], { cwd: box.workspace, encoding: 'utf8', env: runtimeEnv(box, gitDir) });
  const calls = readFileSync(box.log, 'utf8').split('\n').filter(Boolean)
    .map(line => v.parse(CallSchema, JSON.parse(line)));
  return { calls, exit: result.status };
};

/**
 * Whether `argv` is the probe, after any overrides the shell put ahead of it.
 */
const isProbe = (argv: readonly string[]): boolean => argv.join(' ').endsWith(probe.join(' '));

test.skipIf(!canSignIn)('the marker separates the agent\'s call from the runtime\'s own', {
  timeout: 180_000,
}, ({ expect }) => {
  const { calls, exit } = runProbe();
  // The model may run the probe more than once; each run of it must be marked.
  const probes = calls.filter(call => isProbe(call.argv));

  expect(exit).toBe(0);
  expect(probes.length).toBeGreaterThan(0);
  expect(probes.filter(call => !call.marked)).toStrictEqual([]);
  expect(calls.filter(call => !isProbe(call.argv) && call.marked)).toStrictEqual([]);
  expect(calls.length).toBeGreaterThan(1);
});
