/*
 * Where one agent run's calls are recorded, shared by the doubles that write
 * the log and the checkers that read it.
 *
 * A run is one call to the agent. Whoever starts it mints an id and hands it
 * to the agent's commands as $STUB_RUN, so every double the run reaches logs
 * to the same file however many runs are in flight at once.
 */
import path from 'node:path';

/**
 * The variable naming the run a double's call belongs to.
 */
export const runVar = 'STUB_RUN';

/**
 * The log of run `runId` under `logDir`.
 */
export const runLogPath = (logDir: string, runId: string): string =>
  path.join(logDir, `${runId}.jsonl`);

/**
 * The variable naming the variable that marks a call the agent made.
 *
 * An agent's runtime makes calls of its own, such as asking git about the
 * repository at startup, and they reach the same doubles as the agent's. No
 * argument tells them apart: the runtime can make the very call the agent was
 * asked to. What does is the environment the runtime gives the commands a tool
 * runs for the agent, so whoever starts a run names the variable that marks
 * them, and a double reads it here without knowing which agent is running.
 */
export const agentCallVar = 'STUB_AGENT_CALL_VAR';

/**
 * Whether the call made with `env` is the agent's, rather than one its runtime
 * made for itself. With no marker named, every call is the agent's: a call
 * kept that should not have been shows in the log, where one dropped would not.
 */
export const isAgentCall = (env: NodeJS.ProcessEnv = process.env): boolean => {
  const marker = env[agentCallVar];
  return marker === undefined || marker === '' || env[marker] !== undefined;
};
