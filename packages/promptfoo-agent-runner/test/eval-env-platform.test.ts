/*
 * Tests for what the eval env carries on each platform.
 *
 * Each case names its platform, so both sides run on every host rather than
 * only on the one CI happens to use.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { buildEvalEnv } from '#src/eval-env.ts';

const homeDir = String.raw`C:\Temp\skills-eval-home-1`;
const sourceEnv = {
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
  SystemRoot: String.raw`C:\Windows`,
};

const evalEnvOn = (platform: NodeJS.Platform): Record<string, string> =>
  buildEvalEnv({
    agents: [],
    homeDir,
    platform,
    scrubbedPath: '/scrubbed',
    sourceEnv,
    stubDir: '/stubs',
  });

test('on Windows, the clean HOME is also the user profile', ({ expect }) => {
  expect(evalEnvOn('win32')['USERPROFILE']).toBe(homeDir);
});

test('on Windows, the clean HOME is split into drive and path', ({ expect }) => {
  const env = evalEnvOn('win32');

  expect([env['HOMEDRIVE'], env['HOMEPATH']])
    .toStrictEqual(['C:', String.raw`\Temp\skills-eval-home-1`]);
});

test('on Windows, the system root is forwarded', ({ expect }) => {
  expect(evalEnvOn('win32')['SystemRoot']).toBe(String.raw`C:\Windows`);
});

test('on Windows, locale categories stay behind', ({ expect }) => {
  expect(evalEnvOn('win32')['LC_ALL']).toBeUndefined();
});

test('elsewhere, locale categories are forwarded', ({ expect }) => {
  expect(evalEnvOn('linux')['LC_ALL']).toBe('en_US.UTF-8');
});

test('elsewhere, the language is forwarded', ({ expect }) => {
  expect(evalEnvOn('linux')['LANG']).toBe('en_US.UTF-8');
});

test('elsewhere, the system root stays behind', ({ expect }) => {
  expect(evalEnvOn('linux')['SystemRoot']).toBeUndefined();
});

test('elsewhere, no Windows home variables are set', ({ expect }) => {
  const env = evalEnvOn('linux');

  expect([env['USERPROFILE'], env['HOMEDRIVE'], env['HOMEPATH']])
    .toStrictEqual([undefined, undefined, undefined]);
});
