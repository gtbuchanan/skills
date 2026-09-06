/*
 * Tests for gh's stdin-body convention.
 *
 * The skills are told to pass prose on standard input (`--body-file -`,
 * `-F body=@-`), which keeps it off the command line entirely — so a double
 * logging argv alone cannot tell a filled-in template from an empty one, nor a
 * squash message carrying the branch's trailers from one that dropped them.
 *
 * Every case is a spelling gh gives that convention, and each is checked twice
 * over: that a call naming stdin comes back with what was piped, and that a
 * call naming none never reaches the reader at all. The second half is the one
 * worth the trouble — reading standard input on a call that piped nothing
 * blocks, and a suite reports that as a timeout rather than as a wrong answer,
 * so a reader that merely returned the wrong string would be the milder bug.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { stdinBody } from '@gtbuchanan/github-cli-stub/body';

/**
 * What the piped-in case has waiting on standard input.
 */
const piped = 'Applied in 2f8665e.';

/**
 * The body this call comes back with, standing in for a real pipe.
 */
const bodyOf = (argv: readonly string[]): string => stdinBody(argv, () => piped);

/**
 * The same, where reading standard input at all fails the case — which is how
 * "it did not read" gets asserted rather than assumed from an empty result.
 */
const bodyWithoutReading = (argv: readonly string[]): string =>
  stdinBody(argv, () => {
    throw new Error('read standard input on a call that named none');
  });

test('a call naming no body is never read from', ({ expect }) => {
  expect(bodyWithoutReading(['pr', 'view', '42'])).toBe('');
});

test('--body-file - is handed what was piped in', ({ expect }) => {
  expect(bodyOf(['pr', 'create', '--body-file', '-'])).toBe(piped);
});

test('--body-file naming a real file is not', ({ expect }) => {
  expect(bodyWithoutReading(['pr', 'create', '--body-file', 'body.md'])).toBe('');
});

test("gh's -F body=@- form is handed what was piped in", ({ expect }) => {
  expect(
    bodyOf(['api', 'repos/o/r/pulls/1/comments/2/replies', '-F', 'body=@-']),
  ).toBe(piped);
});

test('a -F field reading a named file is not', ({ expect }) => {
  expect(bodyWithoutReading(['api', 'repos/o/r/issues', '-F', 'body=@notes.md'])).toBe('');
});

test('--input - is handed what was piped in', ({ expect }) => {
  expect(bodyOf(['api', 'graphql', '--input', '-'])).toBe(piped);
});

test('a raw field is a literal string, not a stdin request', ({ expect }) => {
  /* `-f` takes its value verbatim, so the `-` is the character. Reading stdin
     here would block on a call that never intended to send any. */
  expect(bodyWithoutReading(['api', 'repos/o/r/issues', '-f', 'body=-'])).toBe('');
});
