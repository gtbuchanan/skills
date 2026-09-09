/*
 * Tests for what a stub records about the call it stood in for.
 *
 * A stub that read standard input and found nothing records an empty body; one
 * that never looked records no body at all. Collapse the two and a checker gets
 * a confident answer about a body from a stub that never asked.
 *
 * Where a call is recorded matters for the same reason: suites that run
 * concurrently give each world its own log, so a call written to the wrong file
 * — or to a shared one — is evidence against a scenario that never made it.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
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
import { markerFile } from '@gtbuchanan/stub-runtime/scenario';
import { logCall, logCallToScenario } from '@gtbuchanan/stub-runtime/stub';

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
