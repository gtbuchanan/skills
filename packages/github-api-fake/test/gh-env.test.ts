/*
 * Tests for the environment that points the real gh at a fake GitHub.
 *
 * Each variable here is one that, left to the caller's environment, lets gh
 * reach somewhere other than the fake, read what an earlier run left behind,
 * or stop to ask a question nobody is there to answer. So each case is the
 * variable that closes one of those doors.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import path from 'node:path';
import { test } from 'vitest';
import { callerOf } from '@gtbuchanan/github-api-fake/caller';
import { fakeGhEnv } from '@gtbuchanan/github-api-fake/gh-env';

const dir = path.join('runs', 'run-1');
const caller = { argv: ['pr', 'view', '7'], run: 'run-1', world: 'merge-stacked' };
const env = fakeGhEnv({ caller, dir, port: 8766 });

test('gh is pointed at the local GitHub host', ({ expect }) => {
  /* gh speaks plain HTTP to github.localhost, which is what lets the fake
     serve it without a certificate. */
  expect(env['GH_HOST']).toBe('github.localhost');
});

test('every proxy variable names the fake', ({ expect }) => {
  /* Go reads either spelling, upper case first, so leaving one unset lets an
     inherited value of the other through. */
  const proxy = 'http://127.0.0.1:8766';

  expect([
    env['HTTP_PROXY'],
    env['HTTPS_PROXY'],
    env['http_proxy'],
    env['https_proxy'],
  ]).toStrictEqual([proxy, proxy, proxy, proxy]);
});

test('no host is exempt from the proxy', ({ expect }) => {
  /* An inherited exemption would let that host past the fake, and an empty
     upper-case value falls through to the lower-case one, so both are set. */
  expect([env['NO_PROXY'], env['no_proxy']]).toStrictEqual(['', '']);
});

test('the token names the caller', ({ expect }) => {
  expect(callerOf(env['GH_TOKEN'] ?? '')).toStrictEqual(caller);
});

test("gh's config, cache, state and data are the call's own", ({ expect }) => {
  /* gh caches API answers for a day outside its config directory, and on
     Windows shares that cache with the developer's own gh unless told. */
  expect([
    env['GH_CONFIG_DIR'],
    env['XDG_CACHE_HOME'],
    env['XDG_DATA_HOME'],
    env['XDG_STATE_HOME'],
  ]).toStrictEqual([
    path.join(dir, 'config'),
    path.join(dir, 'cache'),
    path.join(dir, 'data'),
    path.join(dir, 'state'),
  ]);
});

test('gh never prompts', ({ expect }) => {
  // A prompt would wait on a terminal the agent does not have.
  expect(env['GH_PROMPT_DISABLED']).toBe('1');
});

test('gh never checks for its own updates', ({ expect }) => {
  // Each check is a request to github.com, which the fake refuses.
  expect([env['GH_NO_UPDATE_NOTIFIER'], env['GH_NO_EXTENSION_UPDATE_NOTIFIER']])
    .toStrictEqual(['1', '1']);
});
