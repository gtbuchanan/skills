/*
 * Tests for what a stub records about the call it stood in for, and for how it
 * hands back the answer.
 *
 * A stub that read standard input and found nothing records an empty body; one
 * that never looked records no body at all. Collapse the two and a checker gets
 * a confident answer about a body from a stub that never asked.
 *
 * Where a call is recorded matters for the same reason: suites that run
 * concurrently give each world its own log, so a call written to the wrong file
 * — or to a shared one — is evidence against a scenario that never made it.
 *
 * Answering is pinned in a child process, since in-process there is nothing to
 * observe: the writes land on the runner's own streams and the exit never
 * happens. What those cases watch for is a process that ended inside the call.
 * An exit forced there takes any queued write with it, and what it takes first
 * is the answer hardest to earn — a refusal nobody gets to read, a `--json`
 * body the code under test has to parse — so a double that was answering
 * honestly goes back to answering with nothing.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { parseJson } from '@gtbuchanan/stub-runtime/calls';
import type { StubAnswer } from '@gtbuchanan/stub-runtime/dispatch';
import { runLogPath } from '@gtbuchanan/stub-runtime/run-log';
import { markerFile } from '@gtbuchanan/stub-runtime/scenario';
import {
  logCall,
  logCallToRun,
  logCallToScenario,
  recordOutcome,
} from '@gtbuchanan/stub-runtime/stub';

/**
 * A log for one case, pointed at by $STUB_LOG. Disposable because that variable
 * is process-wide, so a failing case would otherwise leave it to the next one.
 */
const stubLog = (): Disposable & {
  readonly entries: () => unknown[];
  readonly path: string;
} => {
  const dir = mkdtempSync(path.join(tmpdir(), 'stub-'));
  const logPath = path.join(dir, 'calls.jsonl');
  const previous = process.env['STUB_LOG'];
  process.env['STUB_LOG'] = logPath;

  return {
    entries: () =>
      readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(parseJson),
    path: logPath,
    [Symbol.dispose]: () => {
      if (previous === undefined) delete process.env['STUB_LOG'];
      else process.env['STUB_LOG'] = previous;
    },
  };
};

test('a stub that never read stdin says nothing about it', ({ expect }) => {
  using log = stubLog();

  logCall('gh');
  const entries = log.entries();

  expect(entries).toHaveLength(1);
  expect(entries[0]).toHaveProperty('cmd', 'gh');
  expect(entries[0]).not.toHaveProperty('stdin');
});

test('a stub that read stdin and found nothing says so', ({ expect }) => {
  using log = stubLog();

  logCall('gh', '');

  expect(log.entries()[0]).toHaveProperty('stdin', '');
});

test('a body the stub was handed is recorded', ({ expect }) => {
  using log = stubLog();

  logCall('gh', 'Applied in 2f8665e.');

  expect(log.entries()[0]).toHaveProperty('stdin', 'Applied in 2f8665e.');
});

test('a caller that set no log has nothing written for it', ({ expect }) => {
  using log = stubLog();
  delete process.env['STUB_LOG'];

  logCall('gh', 'dropped');

  expect(existsSync(log.path)).toBe(false);
});

test('recording a call names the log it went to', ({ expect }) => {
  // Which is where the outcome of that call has to be recorded too.
  using log = stubLog();

  expect(logCall('gh')).toBe(log.path);
});

test('recording a call with no log names none', ({ expect }) => {
  using log = stubLog();
  delete process.env['STUB_LOG'];

  expect(logCall('gh')).toBeUndefined();
  expect(existsSync(log.path)).toBe(false);
});

const refused = {
  call: { argv: ['pr', 'diff'], cmd: 'gh', stdin: '' },
  code: 1,
  kind: 'refused',
  reason: 'no canned response',
  stderr: 'gh-stub: no canned response\n',
  stdout: '',
} as const;

test('a refusal is recorded in the log of the call it refused', ({ expect }) => {
  using log = stubLog();

  recordOutcome(refused, log.path);

  expect(log.entries()).toStrictEqual([
    { argv: ['pr', 'diff'], cmd: 'gh', refusal: 'no canned response' },
  ]);
});

test('an answer adds nothing to the log', ({ expect }) => {
  /* The call itself was recorded when it arrived; an answer says nothing about
     the double that a checker needs to know. */
  using log = stubLog();

  recordOutcome({ code: 0, kind: 'answered', stderr: '', stdout: 'ok' }, log.path);

  expect(existsSync(log.path)).toBe(false);
});

test('a refusal with no log to go to is passed over', ({ expect }) => {
  // On the same terms as an unlogged call: the double still answers.
  expect(() => {
    recordOutcome(refused, undefined);
  }).not.toThrow();
});

/**
 * A seeded workspace, with $STUB_LOG_DIR pointed at a log directory beside it.
 * Disposable for the same reason as {@link stubLog}: the variable is
 * process-wide, so a failing case would otherwise leave it to the next one.
 */
const seededWorkspace = (key: string): Disposable & {
  readonly dir: string;
  readonly entries: (fileName: string) => unknown[];
  readonly logDir: string;
} => {
  const root = mkdtempSync(path.join(tmpdir(), 'scenario-'));
  const dir = path.join(root, 'checkout');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, markerFile), key);
  const logDir = path.join(root, 'logs');
  const previous = process.env['STUB_LOG_DIR'];
  process.env['STUB_LOG_DIR'] = logDir;

  return {
    dir,
    entries: fileName =>
      readFileSync(path.join(logDir, fileName), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(parseJson),
    logDir,
    [Symbol.dispose]: () => {
      if (previous === undefined) delete process.env['STUB_LOG_DIR'];
      else process.env['STUB_LOG_DIR'] = previous;
    },
  };
};

const scenarios = [{ key: 'ready-to-merge' }];

test('a call is recorded under the world it was made in', ({ expect }) => {
  using workspace = seededWorkspace('ready-to-merge');

  /* From below the marker rather than beside it: the code under test moves
     around inside its checkout, and the log it lands in must not. */
  logCallToScenario('git', scenarios, path.join(workspace.dir, 'nested'));

  expect(workspace.entries('ready-to-merge.jsonl')).toHaveLength(1);
  expect(workspace.entries('ready-to-merge.jsonl')[0]).toHaveProperty('cmd', 'git');
});

test('a call nothing can attribute is passed over, not failed', ({ expect }) => {
  using workspace = seededWorkspace('ready-to-merge');
  const outside = mkdtempSync(path.join(tmpdir(), 'outside-'));

  /* `git --version` from outside every seeded workspace is a legitimate call,
     and a recorder that threw here would fail the call it stands in for. */
  logCallToScenario('git', scenarios, outside);

  expect(existsSync(workspace.logDir)).toBe(false);
});

/**
 * A run in flight: $STUB_LOG_DIR and $STUB_RUN set as the run provider sets
 * them for the agent's commands. Disposable for the same reason as
 * {@link stubLog}.
 */
const activeRun = (runId: string | undefined): Disposable & { readonly logDir: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'run-'));
  const logDir = path.join(root, 'runs');
  const previous = { dir: process.env['STUB_LOG_DIR'], run: process.env['STUB_RUN'] };
  process.env['STUB_LOG_DIR'] = logDir;
  if (runId === undefined) delete process.env['STUB_RUN'];
  else process.env['STUB_RUN'] = runId;

  return {
    logDir,
    [Symbol.dispose]: () => {
      if (previous.dir === undefined) delete process.env['STUB_LOG_DIR'];
      else process.env['STUB_LOG_DIR'] = previous.dir;
      if (previous.run === undefined) delete process.env['STUB_RUN'];
      else process.env['STUB_RUN'] = previous.run;
    },
  };
};

test('a call is recorded in the log of the run it was made in', ({ expect }) => {
  using run = activeRun('run-1');
  const logPath = runLogPath(run.logDir, 'run-1');

  expect(logCallToRun('gh', 'body')).toBe(logPath);
  expect(readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(parseJson))
    .toStrictEqual([{ argv: [], cmd: 'gh', stdin: 'body' }]);
});

test('a call made outside any run is passed over', ({ expect }) => {
  using run = activeRun(undefined);

  expect(logCallToRun('gh')).toBeUndefined();
  expect(existsSync(run.logDir)).toBe(false);
});

/**
 * The module the child imports `emit` from, by URL rather than by package
 * specifier: a bare specifier in an eval'd script resolves against whatever
 * directory the runner happens to be in.
 */
const stubModule = new URL('../src/stub.ts', import.meta.url).href;

/**
 * What the child writes once `emit` has returned.
 *
 * A process forced to exit inside the call never reaches it, which is the
 * evidence of a forced exit that holds on every platform. The truncation such
 * an exit causes is not: Node writes to a pipe synchronously on Windows and
 * Linux and asynchronously on macOS, so a lost body would only ever show up on
 * some of the machines this runs on.
 */
const trailer = '<still here>';

/**
 * Emits `outcome` from a child process and reports what reached the pipes.
 */
const emitted = (
  outcome: StubAnswer,
): { status: number | null; stderr: string; stdout: string } =>
  spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { emit } from ${JSON.stringify(stubModule)};` +
      `emit(${JSON.stringify(outcome)}, undefined);` +
      `process.stdout.write(${JSON.stringify(trailer)});`,
    ],
    { encoding: 'utf8' },
  );

test('both streams and the status reach whoever called the double', {
  tags: ['slow'],
}, ({ expect }) => {
  const result = emitted({ code: 2, kind: 'answered', stderr: 'refused\n', stdout: '{"ok":true}' });

  expect(result.stdout.startsWith('{"ok":true}')).toBe(true);
  expect(result.stderr).toBe('refused\n');
  expect(result.status).toBe(2);
});

test('answering does not end the process that answered', { tags: ['slow'] }, ({
  expect,
}) => {
  const result = emitted({ code: 1, kind: 'answered', stderr: 'refused\n', stdout: '' });

  expect(result.stdout).toBe(trailer);
});
