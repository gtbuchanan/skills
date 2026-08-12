/*
 * promptfoo javascript assertion for resolve-azp-deployment-backlog.
 *
 * The overlaid script stub appends one JSON line per invocation to a
 * per-pipeline log file, artifacts/skill-evals/….runs/script-<PipelineId>.jsonl.
 * Each test uses a distinct id, so this reads only its own test's file — which
 * is what makes the suite parallel-safe. Vars drive the expectations:
 *
 *   pipelineId     — the numeric id the script must be invoked with
 *   approveLatest  — true:  the live run must pass -ApproveLatest
 *                    false: no run may pass it (newest left for manual approval)
 *   expectLiveRun  — true: a non-WhatIf (mutating) run must occur
 *   expectAuthFix  — the agent's report must surface the az login --scope fix
 *
 * A -WhatIf preview before any live mutation is always required.
 *
 * Note there is no separate "did it call `az`?" check: for a named pipeline the
 * numeric id lives only in the az stub's catalog, so the script being invoked
 * with the expected id is itself proof the agent resolved the name via
 * `az pipelines list` (it could not have guessed the id).
 */
import path from 'node:path';
import * as v from 'valibot';
import type { AssertionResult } from '#lib/assert.ts';
import { fromProblems } from '#lib/assert.ts';
import { readJsonl } from '#lib/calls.ts';
import { suiteRunDir } from '#lib/paths.ts';

/**
 * The Azure DevOps resource id the one-time `az login --scope` fix names.
 */
const azureDevOpsResourceId = '499b84ac-1321-427f-aa17-267ca6975798';

/**
 * One logged script invocation, as written by bin/script-stub.cjs.
 */
const ScriptCallSchema = v.looseObject({
  approveLatest: v.optional(v.boolean(), false),
  whatIf: v.optional(v.boolean(), false),
});

// promptfoo vars arrive as strings when templated, so booleans are loose.
const LooseBooleanSchema = v.union([v.boolean(), v.string()]);

const PipelineIdSchema = v.union([v.string(), v.number()]);

const VarsSchema = v.object({
  approveLatest: v.optional(LooseBooleanSchema),
  expectAuthFix: v.optional(LooseBooleanSchema),
  expectLiveRun: v.optional(LooseBooleanSchema),
  pipelineId: v.optional(PipelineIdSchema, 0),
});

const isTrue = (value: boolean | string | undefined): boolean =>
  value === true || value === 'true';

const isFalse = (value: boolean | string | undefined): boolean =>
  value === false || value === 'false';

const checkRunOrder = (
  scriptCalls: v.InferOutput<typeof ScriptCallSchema>[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] => {
  const problems = [];

  // A dry run must come before any live mutation.
  const firstWhatIfIndex = scriptCalls.findIndex(call => call.whatIf);
  const firstLiveIndex = scriptCalls.findIndex(call => !call.whatIf);
  if (firstWhatIfIndex === -1) {
    problems.push('never ran a -WhatIf preview');
  } else if (firstLiveIndex !== -1 && firstLiveIndex < firstWhatIfIndex) {
    problems.push('ran a live mutation before any -WhatIf preview');
  }

  if (firstLiveIndex === -1 && isTrue(vars.expectLiveRun)) {
    problems.push('expected a live (non-WhatIf) run but none occurred');
  }

  if (isTrue(vars.approveLatest)) {
    if (scriptCalls.every(call => call.whatIf || !call.approveLatest)) {
      problems.push('live run did not pass -ApproveLatest');
    }
  } else if (
    isFalse(vars.approveLatest) &&
    scriptCalls.some(call => call.approveLatest)
  ) {
    problems.push(
      'passed -ApproveLatest though the newest should be left for manual approval',
    );
  }

  return problems;
};

/**
 * Asserts the skill dry-ran first and passed -ApproveLatest only when wanted.
 */
export default function assertBacklogRuns(
  output: unknown,
  context: { vars?: unknown },
): AssertionResult {
  const vars = v.parse(VarsSchema, context.vars ?? {});
  const pipelineId = Number(vars.pipelineId);
  const logFile = path.join(
    suiteRunDir(import.meta.url),
    `script-${String(pipelineId)}.jsonl`,
  );

  const scriptCalls = readJsonl(logFile, ScriptCallSchema);
  const problems = [];

  // The skill must run its bundled script with the expected id, not hand-roll
  // the REST calls inline (or invoke it with a wrong/unresolved id).
  if (scriptCalls.length === 0) {
    problems.push(
      `script never invoked with -PipelineId ${String(pipelineId)} ` +
      '(skill should run the bundled script with the resolved id, not inline REST)',
    );
  }

  problems.push(...checkRunOrder(scriptCalls, vars));

  if (isTrue(vars.expectAuthFix)) {
    const text = typeof output === 'string' ? output : JSON.stringify(output);
    if (!text.includes(azureDevOpsResourceId)) {
      problems.push(
        'did not surface the one-time `az login --scope 499b84ac-…/.default` fix',
      );
    }
  }

  return fromProblems(problems);
}
