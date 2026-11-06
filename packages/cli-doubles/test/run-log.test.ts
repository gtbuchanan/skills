/*
 * Tests for telling a call the agent made from one its runtime made for
 * itself.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { agentCallVar, isAgentCall } from '@gtbuchanan/cli-doubles/run-log';

test('a call carrying the marker the run names is the agent\'s', ({ expect }) => {
  expect(isAgentCall({ [agentCallVar]: 'AGENT_SESSION', AGENT_SESSION: 's-1' })).toBe(true);
});

test('a call without the marker the run names is the runtime\'s own', ({ expect }) => {
  expect(isAgentCall({ [agentCallVar]: 'AGENT_SESSION' })).toBe(false);
});

test('a call in a run naming no marker is the agent\'s', ({ expect }) => {
  // Nothing says how to tell them apart, so the call is kept rather than lost.
  expect(isAgentCall({})).toBe(true);
});
