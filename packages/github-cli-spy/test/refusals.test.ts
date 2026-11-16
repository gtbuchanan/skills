/*
 * Tests for recording github-fake's refusals in the run log of the call that
 * caused them.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { logRefusalToRun } from '@gtbuchanan/github-cli-spy/refusals';

const argv = ['pr', 'view', '7'];
const reason = 'no model for GraphQL field PullRequest.mergeQueueEntry';

/**
 * A disposable directory holding a run-log directory, so a test can see what
 * landed beside the logs as well as in them.
 */
const scratch = (): Disposable & { readonly logDir: string; readonly root: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'refusals-test-'));
  const logDir = path.join(root, 'runs');
  mkdirSync(logDir);

  return {
    logDir,
    root,
    [Symbol.dispose]: () => {
      rmSync(root, { force: true, recursive: true });
    },
  };
};

/**
 * `file`, removed once the test is done with it, so a defect that writes it
 * cannot leave it behind for the next run.
 */
const removedAfter = (file: string): Disposable & { readonly file: string } => ({
  file,
  [Symbol.dispose]: () => {
    rmSync(file, { force: true });
  },
});

test('a refusal lands in its caller\'s run log', ({ expect }) => {
  using dir = scratch();

  logRefusalToRun({ caller: { argv, context: 'run-1', world: 'w' }, reason }, dir.logDir);

  expect(readFileSync(path.join(dir.logDir, 'run-1.jsonl'), 'utf8'))
    .toBe(`${JSON.stringify({ argv, cmd: 'gh', refusal: reason })}\n`);
});

test('a refusal from a call outside a run is recorded nowhere', ({ expect }) => {
  using dir = scratch();

  logRefusalToRun({ caller: { argv, world: 'w' }, reason }, dir.logDir);

  expect(readdirSync(dir.logDir)).toStrictEqual([]);
});

test('a refusal from a request no caller sent is recorded nowhere', ({ expect }) => {
  using dir = scratch();

  logRefusalToRun({ caller: undefined, reason }, dir.logDir);

  expect(readdirSync(dir.logDir)).toStrictEqual([]);
});

test('a context that is not a run id names no file', ({ expect }) => {
  /* Anything that reaches the fake's port can mint a token, so a context
     climbing out of the log directory has to stop there. */
  using dir = scratch();

  logRefusalToRun(
    { caller: { argv, context: `..${path.sep}escaped`, world: 'w' }, reason },
    dir.logDir,
  );

  expect(existsSync(path.join(dir.root, 'escaped.jsonl'))).toBe(false);
});

test('a context that is not a run id is recorded nowhere', ({ expect }) => {
  using dir = scratch();

  logRefusalToRun({ caller: { argv, context: 'run.1', world: 'w' }, reason }, dir.logDir);

  expect(readdirSync(dir.logDir)).toStrictEqual([]);
});

test('with no log directory, a refusal is recorded nowhere', ({ expect }) => {
  // An empty directory would otherwise resolve the log against the working one.
  const context = 'run-with-no-log-dir';
  using stray = removedAfter(path.resolve(`${context}.jsonl`));

  logRefusalToRun({ caller: { argv, context, world: 'w' }, reason }, '');

  expect(existsSync(stray.file)).toBe(false);
});
