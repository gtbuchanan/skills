/*
 * A promptfoo provider that gives every call to the agent a run of its own.
 *
 * A suite names it as its provider and nests the agent's own config under it:
 *
 *   providers:
 *     - id: file://node_modules/@gtbuchanan/agent-skills-harness/src/run-provider.ts
 *       config:
 *         agent: claude-code
 *         agentConfig: { ... }
 *
 * Each call mints a run id, hands it to the agent's commands as $STUB_RUN so
 * the doubles they reach log to that run's file (see stub-runtime's run-log),
 * and returns it in the response metadata, where a checker reads it back as
 * `context.metadata` (see run-log.ts here). Concurrent tests then never share
 * a log, whichever world or command their calls came from.
 */
import { randomUUID } from 'node:crypto';
import type { EvalAgent } from '@gtbuchanan/eval-agents/eval-agent';
import { evalAgentNamed } from '@gtbuchanan/eval-agents/registry';
import { runVar } from '@gtbuchanan/stub-runtime/run-log';
import {
  type ApiProvider,
  type CallApiContextParams,
  type CallApiOptionsParams,
  type ProviderOptions,
  type ProviderResponse,
  loadApiProvider,
} from 'promptfoo';
import * as v from 'valibot';

const AgentConfigSchema = v.record(v.string(), v.unknown());
const RunConfigSchema = v.object({
  agent: v.string(),
  agentConfig: v.optional(AgentConfigSchema, {}),
});

/**
 * What one run needs from outside: the agent's own provider, and a fresh id.
 */
export interface RunDeps {
  readonly loadProvider: (
    providerId: string,
    config: Readonly<Record<string, unknown>>,
  ) => Promise<ApiProvider>;
  readonly mintRunId: () => string;
}

/**
 * Calls `agent` through its own provider as one run.
 */
export const callAsRun = async (
  call: {
    readonly agent: EvalAgent;
    readonly agentConfig: Readonly<Record<string, unknown>>;
    readonly prompt: string;
    readonly context: CallApiContextParams | undefined;
    readonly callOptions: CallApiOptionsParams | undefined;
  },
  deps: RunDeps,
): Promise<ProviderResponse> => {
  const runId = deps.mintRunId();
  const provider = await deps.loadProvider(
    call.agent.providerId,
    call.agent.withEnv(call.agentConfig, { [runVar]: runId }),
  );
  const response = await provider.callApi(call.prompt, call.context, call.callOptions);
  return { ...response, metadata: { ...response.metadata, runId } };
};

const defaultDeps: RunDeps = {
  loadProvider: async (providerId, config) =>
    loadApiProvider(providerId, { options: { config } }),
  mintRunId: randomUUID,
};

export default class RunProvider implements ApiProvider {
  private readonly agent: EvalAgent;
  private readonly providerLabel: string | undefined;
  public readonly config: v.InferOutput<typeof RunConfigSchema>;

  public constructor(options: ProviderOptions) {
    this.config = v.parse(RunConfigSchema, options.config);
    this.agent = evalAgentNamed(this.config.agent);
    this.providerLabel = options.label;
  }

  public id(): string {
    return this.providerLabel ?? `run:${this.agent.name}`;
  }

  public async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    return callAsRun({
      agent: this.agent,
      agentConfig: this.config.agentConfig,
      callOptions,
      context,
      prompt,
    }, defaultDeps);
  }
}
