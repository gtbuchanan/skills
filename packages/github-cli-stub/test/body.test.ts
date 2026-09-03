/*
 * Tests for gh's stdin-body convention.
 *
 * The skills are told to pass prose on standard input (`--body-file -`), which
 * keeps it off the command line entirely — so a double logging argv alone
 * cannot tell a filled-in template from an empty one, nor a squash message
 * carrying the branch's trailers from one that dropped them. Knowing when a
 * call names stdin is what lets the double read it; reading unconditionally
 * would block on every call that does not.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { hasStdinBody } from '@gtbuchanan/github-cli-stub/body';

test('a call naming no body does not want stdin', ({ expect }) => {
  expect(hasStdinBody(['pr', 'view', '42'])).toBe(false);
});

test('--body-file - wants stdin', ({ expect }) => {
  expect(hasStdinBody(['pr', 'create', '--body-file', '-'])).toBe(true);
});

test('--body-file naming a real file does not want stdin', ({ expect }) => {
  expect(hasStdinBody(['pr', 'create', '--body-file', 'body.md'])).toBe(false);
});

test("gh's -F body=@- form wants stdin", ({ expect }) => {
  expect(hasStdinBody(['api', 'repos/o/r/pulls/1/comments', '-F', 'body=@-'])).toBe(true);
});

test('a -F field reading a named file does not want stdin', ({ expect }) => {
  expect(hasStdinBody(['api', 'repos/o/r/issues', '-F', 'body=@notes.md'])).toBe(false);
});

test('--input - wants stdin', ({ expect }) => {
  expect(hasStdinBody(['api', 'graphql', '--input', '-'])).toBe(true);
});
