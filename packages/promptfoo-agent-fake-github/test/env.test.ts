/*
 * Tests for what a suite whose GitHub is the fake adds to its eval
 * environment.
 *
 * Finding a tool past the doubles and mise's shims is the runner's, and its
 * own tests cover it; here `realTool` stands in for it.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import path from 'node:path';
import type { EnvContext } from '@gtbuchanan/promptfoo-agent/suite-config';
import { test } from 'vitest';
import { fakeGitHubEnv } from '@gtbuchanan/promptfoo-agent-fake-github/env';

const homeDir = path.join(path.sep, 'tmp', 'eval-home');
const onPath = path.join(path.sep, 'usr', 'bin', 'gh');

const contextWith = (overrides: Partial<EnvContext> = {}): EnvContext => ({
  homeDir,
  realTool: name => (name === 'gh' ? onPath : undefined),
  source: {},
  ...overrides,
});

test('the real gh is the one on the caller\'s PATH', ({ expect }) => {
  expect(fakeGitHubEnv.env(contextWith())['GH_REAL']).toBe(onPath);
});

test('the real gh is the one the caller names', ({ expect }) => {
  // How a host whose PATH gh is not the pinned one names the pinned one.
  const pinned = path.join(path.sep, 'opt', 'pinned', 'gh');

  expect(fakeGitHubEnv.env(contextWith({ source: { GH_REAL: pinned } }))['GH_REAL'])
    .toBe(pinned);
});

test('the caller\'s GH_REAL is asked for', ({ expect }) => {
  // The runner hands a contributor only the variables it reads.
  expect(fakeGitHubEnv.reads).toContain('GH_REAL');
});

test('no real gh is named where the caller has none', ({ expect }) => {
  const noTools: Readonly<Record<string, string>> = {};
  const env = fakeGitHubEnv.env(contextWith({ realTool: name => noTools[name] }));

  expect(env).not.toHaveProperty('GH_REAL');
});

test('the real gh is kept away from the caller\'s login', ({ expect }) => {
  /*
   * An agent can run GH_REAL itself, past the spy. On Windows gh finds the
   * developer's login under APPDATA, which the eval env passes on, so a clean
   * HOME alone would leave it acting as the developer against the real GitHub.
   */
  expect(fakeGitHubEnv.env(contextWith())['GH_CONFIG_DIR'])
    .toBe(path.join(homeDir, '.config', 'gh'));
});
