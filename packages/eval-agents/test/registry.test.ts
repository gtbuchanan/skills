import { test } from 'vitest';
import { evalAgentForProvider, evalAgentNamed } from '@gtbuchanan/eval-agents/registry';

test('maps the agent SDK provider to Claude Code', ({ expect }) => {
  expect(evalAgentForProvider('anthropic:claude-agent-sdk').name).toBe('claude-code');
});

test('maps a provider id carrying a model suffix', ({ expect }) => {
  expect(evalAgentForProvider('anthropic:claude-agent-sdk:claude-haiku-4-5').name)
    .toBe('claude-code');
});

test('refuses a provider no agent runs', ({ expect }) => {
  expect(() => evalAgentForProvider('openai:gpt-5'))
    .toThrow("no agent runs provider 'openai:gpt-5'");
});

test('refuses a provider given without an id', ({ expect }) => {
  expect(() => evalAgentForProvider(undefined))
    .toThrow("no agent runs provider 'undefined'");
});

test('finds an agent by the name a suite gives it', ({ expect }) => {
  expect(evalAgentNamed('claude-code').displayName).toBe('Claude Code');
});

test('refuses a name no agent has', ({ expect }) => {
  expect(() => evalAgentNamed('codex')).toThrow("no agent named 'codex'");
});
