/*
 * Tests for the caller a token names.
 *
 * Anything that reaches the fake's port can mint a token, so a token naming a
 * path would let it choose which file the fake appends a refusal to.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { callerOf, callerToken } from '@gtbuchanan/github-api-fake/caller';

const tokenFor = (payload: unknown): string =>
  Buffer.from(JSON.stringify(payload)).toString('base64url');

test('a token round-trips its caller', ({ expect }) => {
  const caller = { argv: ['pr', 'view'], run: 'a1b2-c3', world: 'merge-stacked' };

  expect(callerOf(callerToken(caller))).toStrictEqual(caller);
});

test('a run id holding a path names no caller', ({ expect }) => {
  const token = tokenFor({ argv: [], run: '../../etc/passwd', world: 'merge-stacked' });

  expect(callerOf(token)).toBeUndefined();
});

test('a token that is not an encoded caller names no caller', ({ expect }) => {
  expect(callerOf('merge-stacked')).toBeUndefined();
});
