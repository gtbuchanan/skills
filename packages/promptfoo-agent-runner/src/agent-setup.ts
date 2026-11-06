/*
 * What the runners do for each agent before a suite runs: find its login,
 * refuse to start without one, and lay out the files its workspace needs.
 */
import path from 'node:path';
import type { EvalAgent } from '@gtbuchanan/promptfoo-agent/eval-agent';

/**
 * How one agent will authenticate.
 */
export interface AgentAuth {
  readonly agent: EvalAgent;
  /**
   * Where the agent's stored login sits on this host.
   */
  readonly credentials: string;
  readonly isLoggedIn: boolean;
  readonly hasKey: boolean;
}

/**
 * Where `agent` keeps its stored login under `home`. `join` is the path
 * flavour of the host `home` lives on, which for a container is not this one.
 */
export const credentialsIn = (
  home: string,
  agent: EvalAgent,
  join: (...segments: string[]) => string = path.join,
): string => join(home, agent.auth.credentialsFile);

/**
 * Reads each agent's login. `exists` and `hasVar` are the caller's, so a test
 * describes a host rather than inheriting this one.
 */
export const agentAuth = (
  agents: readonly EvalAgent[],
  host: {
    readonly home: string;
    readonly exists: (file: string) => boolean;
    readonly hasVar: (name: string) => boolean;
  },
): AgentAuth[] => agents.map((agent) => {
  const credentials = credentialsIn(host.home, agent);
  return {
    agent,
    credentials,
    hasKey: host.hasVar(agent.auth.apiKeyVar),
    isLoggedIn: host.exists(credentials),
  };
});

/**
 * Why the run cannot start, or `undefined` when every agent can authenticate.
 */
export const authProblem = (auth: readonly AgentAuth[]): string | undefined => {
  const missing = auth.find(({ hasKey, isLoggedIn }) => !isLoggedIn && !hasKey);
  return missing === undefined
    ? undefined
    : `No auth: log in to ${missing.agent.displayName} or set ${missing.agent.auth.apiKeyVar}.`;
};

/**
 * Every file the agents need in `workspace`, as absolute path and content.
 */
export const agentWorkspaceFiles = (
  agents: readonly EvalAgent[],
  workspace: string,
): (readonly [string, string])[] =>
  agents.flatMap(agent =>
    Object.entries(agent.workspaceFiles(workspace))
      .map(([file, content]): readonly [string, string] =>
        [path.join(workspace, file), content]));
