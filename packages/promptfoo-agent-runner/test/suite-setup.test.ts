/*
 * Tests for readying a suite to run.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import type { LoadedSuiteConfig } from '#src/suite-config.ts';
import { type SuiteSetupSteps, setUpSuite } from '#src/suite-setup.ts';

const env = { PATH: '/scrubbed' };
const workspace = '/tmp/skills-eval-ws-1';
const suiteConfig: LoadedSuiteConfig = {
  env: [{ env: () => ({ GH_REAL: '/usr/bin/gh' }), reads: [] }],
};

const steps = (overrides: Partial<SuiteSetupSteps> = {}): SuiteSetupSteps => ({
  isolatedEnv: () => ({ env }),
  loadConfig: () => Promise.resolve(suiteConfig),
  mintWorkspace: () => workspace,
  populateWorkspace: () => {
    // Populates without complaint.
  },
  ...overrides,
});

test('a workspace that cannot be populated fails its suite with the error', async ({ expect }) => {
  const setup = await setUpSuite('broken', steps({
    populateWorkspace: () => {
      throw new Error('skills add failed for broken/claude-code');
    },
  }));

  expect(setup).toStrictEqual({
    kind: 'failed',
    out: 'Error: skills add failed for broken/claude-code',
    workspace,
  });
});

test('an eval config that cannot load fails its suite with the error', async ({ expect }) => {
  const setup = await setUpSuite('broken', steps({
    loadConfig: () =>
      Promise.reject(new Error('eval.config.ts does not export a suite config')),
  }));

  expect(setup).toStrictEqual({
    kind: 'failed',
    out: 'Error: eval.config.ts does not export a suite config',
    workspace,
  });
});

test('an env that cannot be built fails its suite with the error', async ({ expect }) => {
  const setup = await setUpSuite('broken', steps({
    isolatedEnv: () => {
      throw new Error('a suite\'s eval config may not set PATH: the runner sets it');
    },
  }));

  expect(setup).toStrictEqual({
    kind: 'failed',
    out: 'Error: a suite\'s eval config may not set PATH: the runner sets it',
    workspace,
  });
});

test('a suite\'s isolated env is built from its eval config', async ({ expect }) => {
  const configs: LoadedSuiteConfig[] = [];

  await setUpSuite('fine', steps({
    isolatedEnv: (suite) => {
      configs.push(suite);
      return { env };
    },
  }));

  expect(configs).toStrictEqual([suiteConfig]);
});

test('a suite is populated in its own workspace under its isolated env', async ({ expect }) => {
  const calls: unknown[] = [];

  await setUpSuite('fine', steps({
    populateWorkspace: (...call) => {
      calls.push(call);
    },
  }));

  expect(calls).toStrictEqual([[workspace, 'fine', env]]);
});

test('a populated suite is ready to run under its isolated env', async ({ expect }) => {
  const setup = await setUpSuite('fine', steps());

  expect(setup).toStrictEqual({ env, kind: 'ready', workspace });
});
