/*
 * Tests for what the fake gh records about a call.
 *
 * The double's log is the only evidence this suite has that the skill did
 * anything, and a reply body never appears in argv — gh's `-F body=@-` takes it
 * on standard input, which is exactly the spelling that keeps backticks and
 * fenced blocks intact. A double logging argv alone therefore hands the checker
 * a reply it cannot read, and the suite fails a run that was correct.
 *
 * What the stub records is all these cases can reach. Whether it read at all is
 * settled in github-cli-stub's body tests, which can fail the reader for
 * running; a child process reaches EOF either way.
 *
 * Driven as a subprocess rather than by importing the module, because the log
 * line is written by a process reading its own file descriptor — there is no
 * standard input to hand an in-memory call.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseJson } from '@gtbuchanan/stub-runtime/calls';
import { markerFile, scenarioPath } from '@gtbuchanan/stub-runtime/scenario';
import { test } from 'vitest';

const stub = path.join(import.meta.dirname, '..', 'bin', 'gh-stub.ts');

/**
 * A fresh eval workspace holding one seeded scenario, and a log directory
 * beside it — so a case reads exactly what it provoked rather than whatever a
 * neighbour appended first.
 */
const seeded = (key: string): { readonly logDir: string; readonly root: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'gh-stub-'));
  const workspace = path.join(root, ...scenarioPath(key).split('/'));
  mkdirSync(workspace, { recursive: true });
  writeFileSync(path.join(workspace, markerFile), `${key}\n`);

  return { logDir: path.join(root, 'logs'), root };
};

/**
 * Runs the stub from `cwd` and reports how it exited.
 */
const run = (
  cwd: string,
  logDir: string,
  args: readonly string[],
  input = '',
): number | null =>
  spawnSync(process.execPath, [stub, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, STUB_LOG_DIR: logDir },
    input,
  }).status;

/**
 * The lines one call made from inside the `mixed` scenario left in that
 * scenario's log, parsed.
 */
const logged = (args: readonly string[], input = ''): unknown[] => {
  const { logDir, root } = seeded('mixed');
  run(path.join(root, ...scenarioPath('mixed').split('/')), logDir, args, input);

  return readFileSync(path.join(logDir, 'mixed.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(parseJson);
};

test('a call is recorded in the log of the scenario it was made in', ({ expect }) => {
  /*
   * One log per scenario is what lets the tests run at once: a call lands in
   * the log of the test that made it, and nowhere else.
   */
  const { logDir, root } = seeded('ack');
  const workspace = path.join(root, ...scenarioPath('ack').split('/'));
  mkdirSync(path.join(workspace, 'nested'));

  run(path.join(workspace, 'nested'), logDir, ['api', 'user']);

  expect(readdirSync(logDir)).toStrictEqual(['ack.jsonl']);
});

test('a call made outside every scenario is refused, and kept', ({ expect }) => {
  /*
   * No test's log can take it, but a withheld thread acted on from there still
   * has to be seen, so it is recorded where the checker looks for exactly that.
   */
  const { logDir, root } = seeded('ack');

  expect(run(root, logDir, ['api', 'user'])).not.toBe(0);
  expect(readdirSync(logDir)).toStrictEqual(['unattributed.jsonl']);
  expect(
    readFileSync(path.join(logDir, 'unattributed.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(parseJson),
  ).toStrictEqual([
    { argv: ['api', 'user'], cmd: 'gh', stdin: '' },
    { argv: ['api', 'user'], cmd: 'gh', refusal: 'called outside every scenario' },
  ]);
});

const replies = 'repos/acme/widgets/pulls/42/comments/15001/replies';

const body = '`amount` still is not validated before the charge at L44.';

test('a body piped in on standard input is recorded', ({ expect }) => {
  expect(logged(['api', replies, '-F', 'body=@-'], body)).toStrictEqual([
    { argv: ['api', replies, '-F', 'body=@-'], cmd: 'gh', stdin: body },
  ]);
});

test('a call naming no body records an empty one', ({ expect }) => {
  /*
   * Only that the stub looked and recorded the result. It cannot show that the
   * read was skipped: spawnSync closes the child's stdin after writing its
   * input, so an unconditional read would reach EOF and return '' too. That
   * guarantee is pinned in github-cli-stub's body tests, where the reader
   * itself fails the case if it runs.
   */
  expect(logged(['api', 'user'])).toStrictEqual([
    { argv: ['api', 'user'], cmd: 'gh', stdin: '' },
  ]);
});
