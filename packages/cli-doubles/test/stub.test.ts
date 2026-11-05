/*
 * Tests for what a stub records about the call it stood in for, and for how it
 * hands back the answer.
 *
 * A stub that read standard input and found nothing records an empty body; one
 * that never looked records no body at all. Collapse the two and a checker gets
 * a confident answer about a body from a stub that never asked.
 *
 * Where a call is recorded matters for the same reason: suites that run
 * concurrently give each run its own log, so a call written to the wrong file
 * — or to a shared one — is evidence against a test that never made it.
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
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { parseJson } from '@gtbuchanan/cli-doubles/calls';
import type { StubAnswer } from '@gtbuchanan/cli-doubles/dispatch';
import { runLogPath } from '@gtbuchanan/cli-doubles/run-log';
import {
  logCallToRun,
  recordOutcome,
  runLogInFlight,
} from '@gtbuchanan/cli-doubles/stub';

/**
 * A run in flight: $STUB_LOG_DIR and $STUB_RUN set as the run provider sets
 * them for the agent's commands. Disposable because both variables are
 * process-wide, so a failing case would otherwise leave them to the next one.
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

/**
 * The lines in the log at `logPath`, parsed.
 */
const entriesOf = (logPath: string): unknown[] =>
  readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(parseJson);

test('a stub that never read stdin says nothing about it', ({ expect }) => {
  using run = activeRun('run-1');

  logCallToRun('gh');
  const entries = entriesOf(runLogPath(run.logDir, 'run-1'));

  expect(entries).toHaveLength(1);
  expect(entries[0]).toHaveProperty('cmd', 'gh');
  expect(entries[0]).not.toHaveProperty('stdin');
});

test('a stub that read stdin and found nothing says so', ({ expect }) => {
  using run = activeRun('run-1');

  logCallToRun('gh', '');

  expect(entriesOf(runLogPath(run.logDir, 'run-1'))[0]).toHaveProperty('stdin', '');
});

const refused = {
  call: { argv: ['pr', 'diff'], cmd: 'gh', stdin: '' },
  code: 1,
  kind: 'refused',
  reason: 'no canned response',
  stderr: 'gh-stub: no canned response\n',
  stdout: '',
} as const;

/**
 * A path for a log that does not exist yet.
 */
const freshLog = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'stub-'));
  return path.join(dir, 'run-1.jsonl');
};

test('a refusal is recorded in the log of the call it refused', ({ expect }) => {
  const logPath = freshLog();

  recordOutcome(refused, logPath);

  expect(entriesOf(logPath)).toStrictEqual([
    { argv: ['pr', 'diff'], cmd: 'gh', refusal: 'no canned response' },
  ]);
});

test('an answer adds nothing to the log', ({ expect }) => {
  /* The call itself was recorded when it arrived; an answer says nothing about
     the double that a checker needs to know. */
  const logPath = freshLog();

  recordOutcome({ code: 0, kind: 'answered', stderr: '', stdout: 'ok' }, logPath);

  expect(existsSync(logPath)).toBe(false);
});

test('a refusal with no log to go to is passed over', ({ expect }) => {
  // On the same terms as an unlogged call: the double still answers.
  expect(() => {
    recordOutcome(refused, undefined);
  }).not.toThrow();
});

test('a call is recorded in the log of the run it was made in', ({ expect }) => {
  using run = activeRun('run-1');
  const logPath = runLogPath(run.logDir, 'run-1');

  expect(logCallToRun('gh', 'body')).toBe(logPath);
  expect(readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(parseJson))
    .toStrictEqual([{ argv: [], cmd: 'gh', stdin: 'body' }]);
});

test('the log of the run in flight is named without recording anything', ({ expect }) => {
  /* For a double that records a call its own way, such as a refusal alone,
     where recording it as a call would count it as done. */
  using run = activeRun('run-1');

  expect(runLogInFlight()).toBe(runLogPath(run.logDir, 'run-1'));
  expect(existsSync(run.logDir)).toBe(false);
});

test('no run in flight names no log', ({ expect }) => {
  using run = activeRun(undefined);

  expect(runLogInFlight()).toBeUndefined();
  expect(existsSync(run.logDir)).toBe(false);
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
