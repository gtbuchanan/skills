/*
 * Tests for the environment the gh spy hands the real gh.
 *
 * Whatever the caller carries is the developer's, or CI's: a token that works
 * against the real GitHub, a host, a proxy exemption. Any of them reaching gh
 * points it somewhere other than the fake.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import path from 'node:path';
import { callerOf } from '@gtbuchanan/github-fake/caller';
import { test } from 'vitest';
import { realGhEnv } from '@gtbuchanan/github-cli-spy/env';

const realGit = path.join(path.sep, 'opt', 'git', 'bin', 'git');

const envFrom = (sourceEnv: NodeJS.ProcessEnv): Record<string, string> =>
  realGhEnv({
    caller: { argv: ['pr', 'view'], context: 'run-1', world: 'merge-clean' },
    dir: path.join(path.sep, 'tmp', 'gh-call'),
    port: 4000,
    realGit,
    sourceEnv,
  });

test('carries no credential the caller holds', ({ expect }) => {
  const env = envFrom({
    GH_ENTERPRISE_TOKEN: 'ghe_real',
    GITHUB_ENTERPRISE_TOKEN: 'ghe_real',
    GITHUB_TOKEN: 'ghp_real',
  });

  expect(Object.keys(env).filter(name => name.includes('TOKEN'))).toStrictEqual(['GH_TOKEN']);
});

test('answers as the call the token names, whatever token the caller holds', ({ expect }) => {
  const env = envFrom({ GH_TOKEN: 'ghp_real' });

  expect(callerOf(env['GH_TOKEN'] ?? '')).toStrictEqual({
    argv: ['pr', 'view'],
    context: 'run-1',
    world: 'merge-clean',
  });
});

test('points gh at the fake whatever host the caller names', ({ expect }) => {
  expect(envFrom({ GH_HOST: 'github.com' })['GH_HOST']).toBe('github.localhost');
});

test('exempts no host from the proxy the caller exempts', ({ expect }) => {
  const env = envFrom({ NO_PROXY: 'github.com', no_proxy: 'api.github.com' });

  expect([env['NO_PROXY'], env['no_proxy']]).toStrictEqual(['', '']);
});

test('keeps what gh needs to start on Windows', ({ expect }) => {
  const systemRoot = String.raw`C:\Windows`;
  const temp = String.raw`C:\Temp`;
  const env = envFrom({ SystemRoot: systemRoot, TEMP: temp });

  expect([env['SystemRoot'], env['TEMP']]).toStrictEqual([systemRoot, temp]);
});

test('puts the real git first on PATH', ({ expect }) => {
  /* gh runs git to find the repository, and through the recording double
     those calls would be logged as the agent's. */
  const stubs = path.join(path.sep, 'stubs');
  const env = envFrom({ PATH: stubs });

  expect(env['PATH']).toBe([path.dirname(realGit), stubs].join(path.delimiter));
});

test('keeps git from reading the caller\'s config', ({ expect }) => {
  // A credential helper there would let gh's git calls authenticate.
  expect(envFrom({})['GIT_CONFIG_NOSYSTEM']).toBe('1');
});
