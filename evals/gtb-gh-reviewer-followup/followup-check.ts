/*
 * promptfoo javascript assertion for this suite's merge gate.
 *
 * The dependent skills are mocked, so the shared call log under
 * artifacts/skill-evals/ contains only the gh calls the orchestrator makes
 * itself. This asserts the happy-path gate:
 *
 *   expectMerge true  — every thread was an exact fix, so followup must approve
 *                       AND squash-merge (the review is fully addressed).
 *   expectMerge false — a thread was left partial, so followup must NOT approve
 *                       or merge, even though the prompt authorized it. This is
 *                       the safety invariant: never merge over unresolved feedback.
 */
import * as v from 'valibot';
import type { AssertionResult } from '#lib/assert.ts';
import { fromProblems } from '#lib/assert.ts';
import { readCommands } from '#lib/calls.ts';
import { suiteCallLog } from '#lib/paths.ts';

const VarsSchema = v.object({
  expectMerge: v.optional(v.boolean(), false),
});

const mergeCall = /\bpr\s+merge\b/v;
const reviewCall = /\bpr\s+review\b/v;

/**
 * Asserts the merge gate approved and merged only when nothing was left open.
 */
export default function assertMergeGate(
  _output: unknown,
  context: { vars?: unknown },
): AssertionResult {
  const gh = readCommands(suiteCallLog(import.meta.url), 'gh');
  const isMerged = gh.some(command => mergeCall.test(command));
  const isApproved = gh.some(
    command => reviewCall.test(command) && command.includes('--approve'),
  );
  const isSquashed = gh.some(
    command => mergeCall.test(command) && command.includes('--squash'),
  );

  const vars = v.parse(VarsSchema, context.vars ?? {});
  const problems = [];

  if (vars.expectMerge) {
    if (!isApproved) problems.push('happy path did not approve the PR');
    if (isMerged) {
      if (!isSquashed) problems.push('merged without --squash');
    } else {
      problems.push('happy path did not merge the PR when authorized');
    }
  } else {
    if (isMerged) {
      problems.push('merged a PR with unresolved feedback (gate failed)');
    }
    if (isApproved) {
      problems.push('approved a PR with unresolved feedback (gate failed)');
    }
  }

  return fromProblems(problems);
}
