// The promptfoo assertion result shape, built from a list of problems.

/**
 * What a promptfoo `javascript` assertion must return.
 */
export interface AssertionResult {
  pass: boolean;
  reason: string;
  score: number;
}

/**
 * An empty problem list is a pass; anything else fails with every reason
 * joined, so one run reports all the ways a skill went wrong rather than the
 * first.
 */
export const fromProblems = (problems: string[]): AssertionResult => ({
  pass: problems.length === 0,
  reason: problems.join('; ') || 'ok',
  score: problems.length === 0 ? 1 : 0,
});
