/*
 * Tests for readying a suite to run.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { type SuiteSetupSteps, setUpSuite } from '#src/suite-setup.ts';

const env = { PATH: '/scrubbed' };
const workspace = '/tmp/skills-eval-ws-1';

const steps = (populateWorkspace: SuiteSetupSteps['populateWorkspace']): SuiteSetupSteps => ({
  isolatedEnv: () => ({ env }),
  mintWorkspace: () => workspace,
  populateWorkspace,
});

test('a suite whose workspace cannot be populated fails with the error as output', ({ expect }) => {
  const setup = setUpSuite('broken', steps(() => {
    throw new Error('skills add failed for broken/claude-code');
  }));

  expect(setup).toStrictEqual({
    kind: 'failed',
    out: 'Error: skills add failed for broken/claude-code',
    workspace,
  });
});

test('a suite is populated in its own workspace under its isolated env', ({ expect }) => {
  const calls: unknown[] = [];

  setUpSuite('fine', steps((...call) => {
    calls.push(call);
  }));

  expect(calls).toStrictEqual([[workspace, 'fine', env]]);
});

test('a populated suite is ready to run under its isolated env', ({ expect }) => {
  const setup = setUpSuite('fine', steps(() => {
    // Populates without complaint.
  }));

  expect(setup).toStrictEqual({ env, kind: 'ready', workspace });
});
