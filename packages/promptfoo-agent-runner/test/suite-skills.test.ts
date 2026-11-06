/*
 * Tests for which skills the runner installs, and for which agent.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { agentsUsedBy, readSuiteConfigs, skillsByAgent } from '#src/suite-skills.ts';

const sdkProvider = 'anthropic:claude-agent-sdk';
const runProvider = 'file://node_modules/@gtbuchanan/eval-agents/src/run-provider.ts';
const foreignRunProvider = 'file://node_modules/@acme/codex/src/run-provider.ts';

test('installs an agent provider\'s skills for the agent it runs', ({ expect }) => {
  const config = { providers: [{ config: { skills: ['a', 'b'] }, id: sdkProvider }] };

  expect(skillsByAgent(config)).toStrictEqual(new Map([['claude-code', new Set(['a', 'b'])]]));
});

test('installs a run provider\'s skills for the agent it runs', ({ expect }) => {
  const config = {
    providers: [
      { config: { agentConfig: { skills: ['a'] } }, id: runProvider },
    ],
  };

  expect(skillsByAgent(config)).toStrictEqual(new Map([['claude-code', new Set(['a'])]]));
});

test('merges what several providers declare for one agent', ({ expect }) => {
  const config = {
    providers: [
      { config: { skills: ['a'] }, id: sdkProvider },
      { config: { agentConfig: { skills: ['b'] } }, id: runProvider },
    ],
  };

  expect(skillsByAgent(config)).toStrictEqual(new Map([['claude-code', new Set(['a', 'b'])]]));
});

test('reads an agent provider\'s own agent option as that agent\'s, not a run', ({
  expect,
}) => {
  // The Claude provider takes `agent` too, naming the subagent to run as.
  const config = {
    providers: [{ config: { agent: 'reviewer', skills: ['a'] }, id: sdkProvider }],
  };

  expect(skillsByAgent(config)).toStrictEqual(new Map([['claude-code', new Set(['a'])]]));
});

test('refuses a run provider no agent it can drive exports', ({ expect }) => {
  const config = {
    providers: [{ config: { agentConfig: { skills: ['a'] } }, id: foreignRunProvider }],
  };

  expect(() => skillsByAgent(config)).toThrow(`no agent runs provider '${foreignRunProvider}'`);
});

test('refuses skills declared for a provider no agent runs', ({ expect }) => {
  const config = { providers: [{ config: { skills: ['a'] }, id: 'openai:gpt-5' }] };

  expect(() => skillsByAgent(config)).toThrow("no agent runs provider 'openai:gpt-5'");
});

test('passes over a provider given as a bare id', ({ expect }) => {
  // A bare id declares no skills, and may name a grader rather than an agent.
  expect(skillsByAgent({ providers: ['openai:gpt-5'] })).toStrictEqual(new Map());
});

/**
 * The names of the agents `configs` need signed in.
 */
const agentNames = (...configs: readonly unknown[]): string[] =>
  agentsUsedBy(configs).map(agent => agent.name);

test('a suite driving no agent needs none signed in', ({ expect }) => {
  // A bare id such as a grader's is no agent this runner drives.
  expect(agentNames({ providers: ['openai:gpt-5'] })).toStrictEqual([]);
});

test('a suite needs the agent its own provider runs', ({ expect }) => {
  expect(agentNames({ providers: [{ config: {}, id: sdkProvider }] }))
    .toStrictEqual(['claude-code']);
});

test('a suite needs the agent its run provider runs', ({ expect }) => {
  expect(agentNames({ providers: [{ config: {}, id: runProvider }] }))
    .toStrictEqual(['claude-code']);
});

test('a suite needs the agent a bare provider id is run by', ({ expect }) => {
  expect(agentNames({ providers: [sdkProvider] })).toStrictEqual(['claude-code']);
});

test('an agent several suites share is needed once', ({ expect }) => {
  const config = { providers: [sdkProvider] };

  expect(agentNames(config, config)).toStrictEqual(['claude-code']);
});

test('a config that cannot be read adds no agent and stops no other suite', ({ expect }) => {
  /* That suite fails on its own when it runs; the sign-in check is no place
     to fail every other suite for it. */
  expect(agentNames({ providers: 'not-a-list' }, { providers: [sdkProvider] }))
    .toStrictEqual(['claude-code']);
});

test('a run provider no agent this runner drives exports adds none', ({ expect }) => {
  expect(agentNames({ providers: [{ config: {}, id: foreignRunProvider }] }))
    .toStrictEqual([]);
});

test('a suite needs the agent its default grader runs on', ({ expect }) => {
  // The suite's own provider is no agent's; its grader is Claude Code's.
  const config = {
    defaultTest: { options: { provider: { config: {}, id: sdkProvider } } },
    providers: ['openai:gpt-5'],
  };

  expect(agentNames(config)).toStrictEqual(['claude-code']);
});

test('a suite needs the agent one test\'s grader runs on', ({ expect }) => {
  const config = {
    providers: ['openai:gpt-5'],
    tests: [{ options: { provider: sdkProvider } }],
  };

  expect(agentNames(config)).toStrictEqual(['claude-code']);
});

test('a suite whose config does not parse is passed over, not thrown on', ({ expect }) => {
  const root = mkdtempSync(path.join(tmpdir(), 'suites-'));
  const bodies = { broken: 'providers: [unclosed', fine: 'providers: []' };
  for (const [name, body] of Object.entries(bodies)) {
    mkdirSync(path.join(root, 'evals', name), { recursive: true });
    writeFileSync(path.join(root, 'evals', name, 'promptfooconfig.yaml'), body);
  }

  expect(readSuiteConfigs(root, ['broken', 'fine'])).toStrictEqual([{ providers: [] }]);
});
