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
 *   expectRunNames — run names (build numbers) the report must quote back
 *   expectPipelineName — the pipeline name the report must call the target
 *   expectRunUrl   — the portal link the report must carry through
 *
 * Those last three hold the report to the handles the portal shows, and the
 * skill promises all three: the pipeline by name, each run by build number, and
 * a link to the run that shipped. Asserting only the build number would still
 * pass a report that called the target "definition 900001" and dropped the URL,
 * leaving the reader to go look up what was just done to their deployments.
 *
 * How much each one proves varies, and it is worth knowing which is load
 * bearing. The stub's build numbers bear no relation to its build ids, so
 * expectRunNames cannot be satisfied by an agent summarizing in ids. The URL
 * likewise only exists in the script's output. expectPipelineName is the weak
 * one: for the two tests whose prompt already names the pipeline, the agent
 * could echo the name without ever reading the output — it genuinely
 * discriminates only on the explicit-id test, whose name appears nowhere but
 * the stub.
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

const splitNames = (value: string): string[] =>
  value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

/*
 * promptfoo renders a var through its template layer before the checker sees
 * it, which collapses a YAML list into a plain string — so accept the
 * comma-separated form alongside a real array, the same way booleans are loose.
 */
const NameListSchema = v.array(v.string());
const CsvNamesSchema = v.pipe(v.string(), v.transform(splitNames));
const RunNamesSchema = v.union([NameListSchema, CsvNamesSchema]);

/*
 * Split out because checkReport reads only these — narrowing its parameter
 * keeps the function honest about what it depends on, and lets a test state an
 * expectation without also inventing a pipeline id it never looks at.
 */
const ReportVarsSchema = v.object({
  expectAuthFix: v.optional(LooseBooleanSchema),
  expectPipelineName: v.optional(v.string(), ''),
  expectRunNames: v.optional(RunNamesSchema, []),
  expectRunUrl: v.optional(v.string(), ''),
});

const VarsSchema = v.object({
  ...ReportVarsSchema.entries,
  approveLatest: v.optional(LooseBooleanSchema),
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
 * Escapes the regex metacharacters in a literal so it matches verbatim.
 */
const escapeRegExp = (value: string): string =>
  value.replaceAll(/[$*+.?^\(\)\[\\\]\{\|\}]/gv, String.raw`\$&`);

/*
 * A plain `includes` cannot tell `2026.5.99` from `2026.5.990`, nor
 * `web-frontend` from `web-frontend-canary`, so a report naming the wrong thing
 * would still pass. Require the match to end where the expected value ends.
 *
 * The period is the awkward one, because it plays both roles: it separates
 * segments inside a name (`2026.5.99.1`, `web-frontend.canary` — different
 * things entirely) and it ends a sentence. Banning it outright would reject
 * `Approved run 2026.5.99.`, a perfectly good report, and an assertion that
 * cries wolf gets deleted. So reject a period only when something name-like
 * follows it, which is what distinguishes a continuation from punctuation.
 */
const nameChar = String.raw`[\p{L}\p{N}_\-]`;

const hasMention = (text: string, value: string): boolean =>
  new RegExp(
    String.raw`${escapeRegExp(value)}(?!${nameChar}|\.${nameChar})`,
    'v',
  ).test(text);

/**
 * Checks the agent's own prose report, which is what the user actually reads —
 * the script printing a run name counts for nothing if the summary collapses it
 * back to an id.
 */
export const checkReport = (
  text: string,
  vars: v.InferOutput<typeof ReportVarsSchema>,
): string[] => {
  const problems = [];

  if (isTrue(vars.expectAuthFix) && !text.includes(azureDevOpsResourceId)) {
    problems.push(
      'did not surface the one-time `az login --scope 499b84ac-…/.default` fix',
    );
  }

  const unnamed = vars.expectRunNames.filter(name => !hasMention(text, name));
  if (unnamed.length > 0) {
    problems.push(
      `reported runs by id alone — never named ${unnamed.join(', ')}, ` +
      'so the reader cannot tell which runs these were without opening the portal',
    );
  }

  if (vars.expectPipelineName && !hasMention(text, vars.expectPipelineName)) {
    problems.push(
      `never called the pipeline "${vars.expectPipelineName}" — naming it by ` +
      'definition id alone makes the reader look up which pipeline was touched',
    );
  }

  if (vars.expectRunUrl && !hasMention(text, vars.expectRunUrl)) {
    problems.push(
      'dropped the portal link the script echoes, leaving the reader to ' +
      'rebuild a URL from the build id',
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

  /*
   * JSON.stringify returns undefined — not a string — for undefined, which
   * would turn a failed assertion into a TypeError on the first .includes.
   * Guard the input rather than the result: TypeScript types stringify as
   * always returning string, so a ?? on its result reads as dead code, while
   * `output` is genuinely unknown here. An absent report then reads as "said
   * nothing", which is a plain failure rather than a crash.
   */
  const text =
    typeof output === 'string' ? output : JSON.stringify(output ?? '');
  problems.push(...checkReport(text, vars));

  return fromProblems(problems);
}
