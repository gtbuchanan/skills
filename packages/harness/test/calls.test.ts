/*
 * Tests for reading the JSONL call logs the stubs write.
 *
 * What a checker can assert is bounded by what the reader hands it, and the
 * expensive failure is silent: a body a stub recorded but the reader drops
 * cannot be asserted on, and the assertion that needed it fails as "the skill
 * never did this" rather than as "the harness cannot see it". So the cases
 * below are about the body surviving the trip, including from a log line
 * written before stdin was ever recorded.
 *
 * The log is a real file because that is the whole interface between the stub
 * and the checker — two processes with nothing else in common.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { readCalls, readCommands } from '@gtbuchanan/agent-skills-harness/calls';

/**
 * A log holding `lines`, each already a JSON object.
 */
const logOf = (...lines: readonly unknown[]): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'calls-'));
  const logPath = path.join(dir, 'calls.jsonl');
  writeFileSync(logPath, lines.map(line => `${JSON.stringify(line)}\n`).join(''));
  return logPath;
};

const replyArgv = ['api', 'repos/o/r/pulls/42/comments/15001/replies', '-F', 'body=@-'];

test('a recorded body comes back with its call', ({ expect }) => {
  const logPath = logOf({ argv: replyArgv, cmd: 'gh', stdin: 'Applied in 2f8665e.\n' });

  expect(readCalls(logPath)).toStrictEqual([
    {
      command: 'api repos/o/r/pulls/42/comments/15001/replies -F body=@-',
      stdin: 'Applied in 2f8665e.\n',
    },
  ]);
});

test('a call that recorded no body reads as an empty one', ({ expect }) => {
  /* Every stub that does not read stdin writes a line without the key, so a
     reader that required it would drop those calls entirely — and a checker
     would then report the skill as never having made them. */
  const logPath = logOf({ argv: ['pr', 'view', '42'], cmd: 'gh' });

  expect(readCalls(logPath)).toStrictEqual([{ command: 'pr view 42', stdin: '' }]);
});

test('the command filter still selects by the tag its stub wrote', ({ expect }) => {
  const logPath = logOf(
    { argv: ['status'], cmd: 'git' },
    { argv: ['pr', 'view', '42'], cmd: 'gh' },
  );

  expect(readCommands(logPath, 'gh')).toStrictEqual(['pr view 42']);
});
