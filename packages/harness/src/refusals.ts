/*
 * Reporting the calls a suite's doubles refused.
 *
 * A refusal says the run reached something its double does not model, so
 * whatever the run did next is no evidence about the skill: a failure may be
 * the double's, and a pass was earned past a gap. That is a reading of the
 * result rather than a verdict on it, so the checker's own rules still decide
 * pass or fail, and the refusals ride alongside — counted in `namedScores`,
 * which promptfoo carries into every result, and named in the reason for
 * whoever reads why a run went the way it did.
 *
 * Only a checker whose log is its own test's can report them: a refusal read
 * from a log several tests share cannot be pinned on the one that made it.
 */
import type { RefusedCall } from '@gtbuchanan/cli-doubles/calls';
import type { AssertionResult } from './assert.ts';

/**
 * An assertion result carrying its refusal count.
 */
export interface ReportedResult extends AssertionResult {
  readonly namedScores: { readonly refusals: number };
}

/**
 * `result` with `refusals` reported beside it, its verdict untouched.
 */
export const reportRefusals = (
  result: AssertionResult,
  refusals: readonly RefusedCall[],
): ReportedResult => ({
  ...result,
  namedScores: { refusals: refusals.length },
  reason:
    refusals.length === 0
      ? result.reason
      : `${result.reason}; the doubles refused ${String(refusals.length)} ` +
        `call(s): ${refusals.map(call => `${call.command} (${call.reason})`).join(', ')}`,
});
