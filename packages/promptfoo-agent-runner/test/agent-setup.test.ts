import path from 'node:path';
import type { EvalAgent } from '@gtbuchanan/promptfoo-agent/eval-agent';
import { test } from 'vitest';
import {
  agentAuth,
  agentWorkspaceFiles,
  authProblem,
  credentialsIn,
} from '#src/agent-setup.ts';

/**
 * An agent with distinct names everywhere, so a test can tell which field a
 * value came from.
 */
const fakeAgent = (name: string): EvalAgent => ({
  auth: {
    apiKeyVar: `${name.toUpperCase()}_KEY`,
    credentialsFile: `.${name}/login.json`,
    envVars: [`${name.toUpperCase()}_KEY`],
  },
  displayName: `Fake ${name}`,
  executable: { command: name, envVar: `${name.toUpperCase()}_EXE`, sdkPackage: `${name}-sdk` },
  gitBashVar: `${name.toUpperCase()}_BASH`,
  isOwnCall: () => false,
  name,
  providerId: `${name}:provider`,
  runProviderId: `file://${name}/run-provider.ts`,
  runsProvider: () => false,
  withEnv: config => ({ ...config }),
  workspaceFiles: workspace => ({
    [`.${name}/settings.json`]: `settings for ${workspace}`,
  }),
});

const home = path.join(path.sep, 'home', 'dev');

test('puts the login under the given home', ({ expect }) => {
  expect(credentialsIn(home, fakeAgent('alpha')))
    .toBe(path.join(home, '.alpha', 'login.json'));
});

test('joins a container home with its own separators', ({ expect }) => {
  expect(credentialsIn('/root', fakeAgent('alpha'), path.posix.join))
    .toBe('/root/.alpha/login.json');
});

test('reads the login from where the agent keeps it', ({ expect }) => {
  const login = path.join(home, '.alpha', 'login.json');
  const [auth] = agentAuth([fakeAgent('alpha')], {
    exists: file => file === login,
    hasVar: () => false,
    home,
  });

  expect(auth).toMatchObject({ credentials: login, hasKey: false, isLoggedIn: true });
});

test('reads the key from the agent\'s own variable', ({ expect }) => {
  const [auth] = agentAuth([fakeAgent('alpha')], {
    exists: () => false,
    hasVar: name => name === 'ALPHA_KEY',
    home,
  });

  expect(auth).toMatchObject({ hasKey: true, isLoggedIn: false });
});

test('starts when every agent has a login or a key', ({ expect }) => {
  const auth = agentAuth([fakeAgent('alpha'), fakeAgent('beta')], {
    exists: file => file.includes('.alpha'),
    hasVar: name => name === 'BETA_KEY',
    home,
  });

  expect(authProblem(auth)).toBeUndefined();
});

test('names the agent that has neither', ({ expect }) => {
  const auth = agentAuth([fakeAgent('alpha'), fakeAgent('beta')], {
    exists: file => file.includes('.alpha'),
    hasVar: () => false,
    home,
  });

  expect(authProblem(auth)).toBe('No auth: log in to Fake beta or set BETA_KEY.');
});

test('lays out every agent\'s files inside the workspace', ({ expect }) => {
  const workspace = path.join(path.sep, 'tmp', 'ws');

  expect(agentWorkspaceFiles([fakeAgent('alpha'), fakeAgent('beta')], workspace))
    .toStrictEqual([
      [path.join(workspace, '.alpha', 'settings.json'), `settings for ${workspace}`],
      [path.join(workspace, '.beta', 'settings.json'), `settings for ${workspace}`],
    ]);
});
