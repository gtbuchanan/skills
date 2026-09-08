/*
 * Tests for what a stub records about the call it stood in for.
 *
 * A stub that read standard input and found nothing records an empty body; one
 * that never looked records no body at all. Collapse the two and a checker gets
 * a confident answer about a body from a stub that never asked.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { parseJson } from '@gtbuchanan/stub-runtime/calls';
import { logCall } from '@gtbuchanan/stub-runtime/stub';

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
