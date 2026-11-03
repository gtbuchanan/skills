import { claudeCode } from './claude-code.ts';
import type { EvalAgent } from './eval-agent.ts';

/**
 * Every agent the runners can drive.
 */
export const evalAgents: readonly EvalAgent[] = [claudeCode];

/**
 * The agent a promptfoo provider runs, so a suite never names one twice.
 */
export const evalAgentForProvider = (providerId: string | undefined): EvalAgent => {
  const agent = providerId === undefined
    ? undefined
    : evalAgents.find(candidate => candidate.runsProvider(providerId));
  if (agent === undefined)
    throw new Error(`no agent runs provider '${String(providerId)}'`);
  return agent;
};

/**
 * The agent a suite names in its run provider's config.
 */
export const evalAgentNamed = (name: string): EvalAgent => {
  const agent = evalAgents.find(candidate => candidate.name === name);
  if (agent === undefined) throw new Error(`no agent named '${name}'`);
  return agent;
};

/**
 * Whether a call to `cmd` with `argv` is one an agent's runtime makes for
 * itself (see {@link EvalAgent.isOwnCall}), for a double that does not know
 * which agent is running.
 */
export const isAgentRuntimeCall = (cmd: string, argv: readonly string[]): boolean =>
  evalAgents.some(agent => agent.isOwnCall(cmd, argv));
