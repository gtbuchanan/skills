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
