import { test } from 'vitest';
import {
  evalAgentForProvider,
  evalAgentNamed,
  evalAgents,
  isAgentRuntimeCall,
} from '@gtbuchanan/eval-agents/registry';

test('maps the agent SDK provider to Claude Code', ({ expect }) => {
  expect(evalAgentForProvider(evalAgents, 'anthropic:claude-agent-sdk').name).toBe('claude-code');
});

test('maps a provider id carrying a model suffix', ({ expect }) => {
  expect(evalAgentForProvider(evalAgents, 'anthropic:claude-agent-sdk:claude-haiku-4-5').name)
    .toBe('claude-code');
});

test('refuses a provider no agent runs', ({ expect }) => {
  expect(() => evalAgentForProvider(evalAgents, 'openai:gpt-5'))
    .toThrow("no agent runs provider 'openai:gpt-5'");
});

test('refuses a provider given without an id', ({ expect }) => {
  expect(() => evalAgentForProvider(evalAgents, undefined))
    .toThrow("no agent runs provider 'undefined'");
});

test('finds an agent by the name a suite gives it', ({ expect }) => {
  expect(evalAgentNamed(evalAgents, 'claude-code').displayName).toBe('Claude Code');
});

test('refuses a name no agent has', ({ expect }) => {
  expect(() => evalAgentNamed(evalAgents, 'codex')).toThrow("no agent named 'codex'");
});

test('knows a runtime\'s own call without being told which agent runs', ({ expect }) => {
  expect(isAgentRuntimeCall(evalAgents, 'git', ['--exec-path'])).toBe(true);
});

test('leaves a call no agent\'s runtime makes', ({ expect }) => {
  expect(isAgentRuntimeCall(evalAgents, 'git', ['status'])).toBe(false);
});
