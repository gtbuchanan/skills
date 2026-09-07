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
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseJson } from '@gtbuchanan/agent-skills-harness/calls';
import { test } from 'vitest';

const stub = path.join(import.meta.dirname, '..', 'bin', 'gh-stub.ts');

/**
 * The lines this call left in a log of its own, parsed.
 *
 * A fresh log per call, so a case reads exactly what it provoked rather than
 * whatever a neighbour appended first.
 */
const logged = (args: readonly string[], input = ''): unknown[] => {
  const logDir = mkdtempSync(path.join(tmpdir(), 'gh-stub-'));
  const logPath = path.join(logDir, 'calls.jsonl');
  spawnSync(process.execPath, [stub, ...args], {
    encoding: 'utf8',
    env: { ...process.env, STUB_LOG: logPath },
    input,
  });

  return readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(parseJson);
};

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
