/*
 * Tests for the caller a token names.
 *
 * Anything that reaches the fake's port can mint a token, so the context it
 * carries is the host's to check before acting on it; the fake hands it back
 * as it arrived.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { callerOf, callerToken } from '@gtbuchanan/github-fake/caller';

test('a token names the caller it was minted for', ({ expect }) => {
  const caller = { argv: ['pr', 'view', '7'], context: 'a1b2-c3', world: 'merge-stacked' };

  expect(callerOf(callerToken(caller))).toStrictEqual(caller);
});

test('a token minted with no context names a caller without one', ({ expect }) => {
  const caller = { argv: ['pr', 'view', '7'], world: 'merge-stacked' };

  expect(callerOf(callerToken(caller))).toStrictEqual(caller);
});

test('a context is carried as the host gave it', ({ expect }) => {
  // The fake never reads it, so nothing about its shape is the fake's to refuse.
  const caller = { argv: [], context: '../../etc/passwd', world: 'merge-stacked' };

  expect(callerOf(callerToken(caller))?.context).toBe('../../etc/passwd');
});

test('a long argument is cut short in the token', ({ expect }) => {
  /* The token travels in a request header, and an argv only labels a
     refusal, so a long `--body` must not make the header outgrow the server's
     limit. */
  const caller = { argv: ['pr', 'create', '--body', 'x'.repeat(10_000)], world: 'merge-stacked' };

  expect(callerOf(callerToken(caller))?.argv).toStrictEqual([
    'pr',
    'create',
    '--body',
    `${'x'.repeat(200)}…`,
  ]);
});

test('a token that is not an encoded caller names no caller', ({ expect }) => {
  expect(callerOf('merge-stacked')).toBeUndefined();
});
