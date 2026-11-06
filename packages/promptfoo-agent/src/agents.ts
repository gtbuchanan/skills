/*
 * Lookups over the agents a caller drives. The caller passes the list, so this
 * package knows no agent: each agent lives in a package of its own, and the
 * runner and the doubles name the ones they use.
 */
import type { EvalAgent } from './eval-agent.ts';

/**
 * The agent among `agents` that a promptfoo provider runs, so a suite never
 * names one twice.
 */
export const evalAgentForProvider = (
  agents: readonly EvalAgent[],
  providerId: string | undefined,
): EvalAgent => {
  const agent = providerId === undefined
    ? undefined
    : agents.find(candidate => candidate.runsProvider(providerId));
  if (agent === undefined)
    throw new Error(`no agent runs provider '${String(providerId)}'`);
  return agent;
};

/**
 * Whether a call to `cmd` with `argv` is one the runtime of an agent among
 * `agents` makes for itself (see {@link EvalAgent.isOwnCall}), for a double
 * that does not know which agent is running.
 */
export const isAgentRuntimeCall = (
  agents: readonly EvalAgent[],
  cmd: string,
  argv: readonly string[],
): boolean =>
  agents.some(agent => agent.isOwnCall(cmd, argv));
