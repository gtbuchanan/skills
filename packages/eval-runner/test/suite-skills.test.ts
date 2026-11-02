/*
 * Tests for which skills the runner installs, and for which agent.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { skillsByAgent } from '#src/suite-skills.ts';

const sdkProvider = 'anthropic:claude-agent-sdk';
const runProvider = 'file://node_modules/@gtbuchanan/agent-skills-harness/src/run-provider.ts';

test('installs an agent provider\'s skills for the agent it runs', ({ expect }) => {
  const config = { providers: [{ config: { skills: ['a', 'b'] }, id: sdkProvider }] };

  expect(skillsByAgent(config)).toStrictEqual(new Map([['claude-code', new Set(['a', 'b'])]]));
});

test('installs a run provider\'s skills for the agent it names', ({ expect }) => {
  const config = {
    providers: [
      { config: { agent: 'claude-code', agentConfig: { skills: ['a'] } }, id: runProvider },
    ],
  };

  expect(skillsByAgent(config)).toStrictEqual(new Map([['claude-code', new Set(['a'])]]));
});

test('merges what several providers declare for one agent', ({ expect }) => {
  const config = {
    providers: [
      { config: { skills: ['a'] }, id: sdkProvider },
      { config: { agent: 'claude-code', agentConfig: { skills: ['b'] } }, id: runProvider },
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

test('refuses a run provider naming no agent it can drive', ({ expect }) => {
  const config = { providers: [{ config: { agent: 'codex' }, id: runProvider }] };

  expect(() => skillsByAgent(config)).toThrow("no agent named 'codex'");
});

test('refuses skills declared for a provider no agent runs', ({ expect }) => {
  const config = { providers: [{ config: { skills: ['a'] }, id: 'openai:gpt-5' }] };

  expect(() => skillsByAgent(config)).toThrow("no agent runs provider 'openai:gpt-5'");
});

test('passes over a provider given as a bare id', ({ expect }) => {
  // A bare id declares no skills, and may name a grader rather than an agent.
  expect(skillsByAgent({ providers: ['openai:gpt-5'] })).toStrictEqual(new Map());
});
