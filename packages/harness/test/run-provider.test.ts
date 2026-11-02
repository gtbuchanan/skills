/*
 * Tests for the provider that gives every agent call a run of its own.
 *
 * What a checker depends on is that the id the agent's commands were handed
 * is the id the response carries back, so the cases follow one id from the
 * mint to both ends.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import type { EvalAgent } from '@gtbuchanan/eval-agents/eval-agent';
import type { ApiProvider, CallApiContextParams } from 'promptfoo';
import * as v from 'valibot';
import { test } from 'vitest';
import RunProvider, {
  type RunDeps,
  callAsRun,
} from '@gtbuchanan/agent-skills-harness/run-provider';

/**
 * An agent whose provider takes env under `injected`, so a test sees exactly
 * what reached it.
 */
const agent: EvalAgent = {
  auth: { apiKeyVar: 'FAKE_KEY', credentialsFile: '.fake/login.json', envVars: [] },
  displayName: 'Fake',
  executable: { command: 'fake', envVar: 'FAKE_EXE', sdkPackage: 'fake-sdk' },
  gitBashVar: 'FAKE_BASH',
  name: 'fake',
  providerId: 'fake:provider',
  runsProvider: () => false,
  withEnv: (config, env) => ({ ...config, injected: env }),
  workspaceFiles: () => ({}),
};

const RunMetadataSchema = v.object({ runId: v.string() });

interface Loaded {
  readonly providerId: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly calls: unknown[][];
}

/**
 * Deps minting `ids` in order, whose provider records what it was loaded
 * with and called with and answers with `metadata`.
 */
const fakeDeps = (
  ids: readonly string[],
  metadata?: Record<string, unknown>,
): RunDeps & { readonly loaded: Loaded[] } => {
  const loaded: Loaded[] = [];
  const queue = [...ids];

  return {
    loadProvider: (providerId, config) => {
      const calls: unknown[][] = [];
      loaded.push({ calls, config, providerId });
      const provider: ApiProvider = {
        callApi: (...args) => {
          calls.push(args);
          return Promise.resolve(
            metadata === undefined ? { output: 'done' } : { metadata, output: 'done' },
          );
        },
        id: () => providerId,
      };
      return Promise.resolve(provider);
    },
    loaded,
    mintRunId: () => queue.shift() ?? 'exhausted',
  };
};

const call = (prompt: string, context?: CallApiContextParams): Parameters<typeof callAsRun>[0] => ({
  agent,
  agentConfig: { skills: ['a'] },
  callOptions: undefined,
  context,
  prompt,
});

test('hands the agent\'s commands the run id through its own provider', async ({ expect }) => {
  const deps = fakeDeps(['run-1']);

  await callAsRun(call('go'), deps);

  expect(deps.loaded).toMatchObject([{
    config: { injected: { STUB_RUN: 'run-1' }, skills: ['a'] },
    providerId: 'fake:provider',
  }]);
});

test('returns the run id beside the provider\'s own metadata', async ({ expect }) => {
  const response = await callAsRun(call('go'), fakeDeps(['run-1'], { sessionId: 's' }));

  expect(response).toStrictEqual({
    metadata: { runId: 'run-1', sessionId: 's' },
    output: 'done',
  });
});

test('passes the prompt and context through to the agent', async ({ expect }) => {
  const deps = fakeDeps(['run-1']);
  const context: CallApiContextParams = { prompt: { label: 'p', raw: 'go' }, vars: { name: 'pr' } };

  await callAsRun(call('go', context), deps);

  expect(deps.loaded[0]?.calls).toStrictEqual([['go', context, undefined]]);
});

test('gives every call a run of its own', async ({ expect }) => {
  const deps = fakeDeps(['run-1', 'run-2']);

  const responses = await Promise.all([
    callAsRun(call('one'), deps),
    callAsRun(call('two'), deps),
  ]);

  expect(responses.map(response => v.parse(RunMetadataSchema, response.metadata).runId))
    .toStrictEqual(['run-1', 'run-2']);
});

test('names itself by the suite\'s label', ({ expect }) => {
  const provider = new RunProvider({ config: { agent: 'claude-code' }, label: 'followup' });

  expect(provider.id()).toBe('followup');
});

test('names itself by its agent when the suite gives no label', ({ expect }) => {
  expect(new RunProvider({ config: { agent: 'claude-code' } }).id()).toBe('run:claude-code');
});

test('refuses a config naming no agent it can drive', ({ expect }) => {
  expect(() => new RunProvider({ config: { agent: 'codex' } }))
    .toThrow("no agent named 'codex'");
});
