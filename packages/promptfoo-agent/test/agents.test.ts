import { test } from 'vitest';
import { fakeAgent } from './fake-agent.ts';
import { evalAgentForProvider, isAgentRuntimeCall } from '@gtbuchanan/promptfoo-agent/agents';

const agents = [fakeAgent('alpha'), fakeAgent('beta')];

test('finds the agent that runs a provider', ({ expect }) => {
  expect(evalAgentForProvider(agents, 'beta:model').name).toBe('beta');
});

test('refuses a provider no agent runs', ({ expect }) => {
  expect(() => evalAgentForProvider(agents, 'openai:gpt-5'))
    .toThrow("no agent runs provider 'openai:gpt-5'");
});

test('refuses a provider given without an id', ({ expect }) => {
  expect(() => evalAgentForProvider(agents, undefined))
    .toThrow("no agent runs provider 'undefined'");
});

test('knows a runtime\'s own call without being told which agent runs', ({ expect }) => {
  expect(isAgentRuntimeCall(agents, 'beta', ['--probe'])).toBe(true);
});

test('leaves a call no agent\'s runtime makes', ({ expect }) => {
  expect(isAgentRuntimeCall(agents, 'beta', ['status'])).toBe(false);
});
