/*
 * Where github-fake's refusals go: the run log of the call that caused them.
 *
 * The fake answers a call it cannot model with GitHub's own vague error, so the
 * agent never learns its GitHub is fake, and hands the real reason to whoever
 * hosts it. This puts that reason beside the call in the run log, where a suite
 * reports what its doubles refused, the same way a stub's own refusal lands.
 *
 * The spy names the run in the token's context, and the fake hands it back
 * unread. Anything that reaches the fake's port can mint a token, so the run is
 * checked before it names a file.
 */
import { runLogPath } from '@gtbuchanan/cli-doubles/run-log';
import { appendJsonl } from '@gtbuchanan/cli-doubles/stub';
import type { Refusal } from '@gtbuchanan/github-fake/server';

/**
 * What a run id may hold: enough for the UUIDs the runner mints, and no path
 * separator or dot to climb out of the log directory with.
 */
const runId = /^[\w\-]+$/v;

/**
 * Records `refusal` in its caller's run log under `logDir`, `STUB_LOG_DIR`
 * unless given. Records nothing for a call outside a run, as a stub records
 * nothing outside one, nor for a context that is not a run id.
 */
export const logRefusalToRun = (
  refusal: Refusal,
  logDir: string | undefined = process.env['STUB_LOG_DIR'],
): void => {
  const { caller, reason } = refusal;
  const run = caller?.context;
  if (
    logDir === undefined || logDir === '' ||
    caller === undefined || run === undefined || !runId.test(run)
  )
    return;

  appendJsonl(runLogPath(logDir, run), { argv: caller.argv, cmd: 'gh', refusal: reason });
};
