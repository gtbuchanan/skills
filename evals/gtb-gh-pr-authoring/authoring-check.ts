/*
 * promptfoo javascript assertion for this suite.
 *
 * The suite's doubles append every `gh` and `git` invocation to a per-scenario
 * log under the suite's run directory, `gh` calls carrying the body they were
 * handed on standard input. Almost everything this skill governs shows up
 * there: which flags a merge carried, whether checks were watched, whether all
 * three feedback surfaces were read, which threads were answered.
 *
 * Expectations are declared per test as vars rather than written as code, so a
 * scenario reads as the rule it is defending:
 *
 *   requireCalls   — [[...substrings]] all of which must appear in ONE command
 *   forbidCalls    — the same shape, for calls that must never be made
 *   requireOneOf   — clauses of which at least one must appear, for a rule the
 *                    skill states as an outcome that several commands reach
 *   forbidOrder    — { before, after } that must NOT occur in that order, for
 *                    the unsafe half of a rule whose safe orders are several
 *   requireOrder   — { before, after } pairs; before's first match must precede
 *                    after's, which is how "push the fixes, then reply" and
 *                    "retarget dependents, then merge" are checked
 *   requireStdin   — { command, includes }: a call matching `command` must have
 *                    been handed a body containing `includes`
 *   forbidStdin    — the same shape, for wording no such body may contain; used
 *                    for the default description, whose rule is an absence
 *   minCommits     — commits the agent added over the seeded baseline tip, for
 *                    the one-finding-one-commit rule
 *
 * Matching is substring-based over the joined argv, and every check is
 * presence, absence or relative order rather than a count — so a shared log
 * stays safe across repeats, which the suite truncates per test anyway.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { baselinesPath } from './setup.ts';
import { scenarioPath } from './world.ts';
import type { AssertionResult } from '@gtbuchanan/agent-skills-harness/assert';
import { fromProblems } from '@gtbuchanan/agent-skills-harness/assert';
import { parseJson, readJsonl } from '@gtbuchanan/agent-skills-harness/calls';
import { skillsRoot, suiteRunDir } from '@gtbuchanan/agent-skills-harness/paths';
import { resolveRealGit } from '@gtbuchanan/agent-skills-harness/real-git';
import { probeGit } from '@gtbuchanan/agent-skills-harness/seed-repo';

const StringListSchema = v.array(v.string());
const ClauseListSchema = v.array(StringListSchema);

const OrderSchema = v.object({
  after: StringListSchema,
  before: StringListSchema,
});

const StdinSchema = v.object({
  command: StringListSchema,
  includes: StringListSchema,
});

/**
 * A scenario's declared expectations, with every optional list defaulted.
 *
 * Exported so a test can build the same fully-defaulted shape the assertion
 * runs on rather than hand-rolling one that drifts from it.
 */
export const VarsSchema = v.object({
  forbidCalls: v.optional(ClauseListSchema, []),
  forbidOrder: v.optional(v.array(OrderSchema), []),
  forbidStdin: v.optional(v.array(StdinSchema), []),
  minCommits: v.optional(v.number(), 0),
  requireCalls: v.optional(ClauseListSchema, []),
  requireOneOf: v.optional(ClauseListSchema, []),
  requireOrder: v.optional(v.array(OrderSchema), []),
  requireStdin: v.optional(v.array(StdinSchema), []),
  scenario: v.string(),
});

/**
 * A logged invocation. `stdin` is present only on the `gh` calls that named it.
 */
const EntrySchema = v.object({
  argv: v.optional(StringListSchema, []),
  cmd: v.optional(v.string(), ''),
  stdin: v.optional(v.string(), ''),
});

const TipsSchema = v.record(v.string(), v.string());

interface Call {
  readonly command: string;
  readonly stdin: string;
}

const isMatch = (call: Call, clause: readonly string[]): boolean =>
  clause.every(needle => call.command.includes(needle));

const describe = (clause: readonly string[]): string => clause.join(' + ');

const checkPresence = (
  calls: readonly Call[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] => [
  ...vars.requireCalls
    .filter(clause => calls.every(call => !isMatch(call, clause)))
    .map(clause => `never called: ${describe(clause)}`),
  ...vars.forbidCalls
    .filter(clause => calls.some(call => isMatch(call, clause)))
    .map(clause => `called what it must not: ${describe(clause)}`),
];

/**
 * A rule satisfied more than one way: some listed clause has to appear.
 *
 * For an invariant the skill states as an outcome rather than a command — the
 * branch ends up deleted, however it got there — where insisting on one
 * spelling would fail a run that reached the same place by another route.
 */
const checkOneOf = (
  calls: readonly Call[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] => {
  if (vars.requireOneOf.length === 0) return [];
  const isHit = vars.requireOneOf.some(clause =>
    calls.some(call => isMatch(call, clause)),
  );

  return isHit
    ? []
    : [
        'did none of: ' +
        vars.requireOneOf.map(clause => describe(clause)).join(' / '),
      ];
};

/**
 * An ordering that must not happen — the unsafe half of a rule whose safe
 * orders are several.
 */
export const checkForbiddenOrder = (
  calls: readonly Call[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] =>
  vars.forbidOrder.flatMap(({ after, before }) => {
    const beforeIndex = calls.findIndex(call => isMatch(call, before));
    if (beforeIndex === -1) return [];
    const afterIndex = calls.findIndex(call => isMatch(call, after));
    return afterIndex === -1 || afterIndex > beforeIndex
      ? [`${describe(before)} happened before ${describe(after)}`]
      : [];
  });

/**
 * Pairs whose `before` must have been called, and called first.
 */
export const checkOrder = (
  calls: readonly Call[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] =>
  vars.requireOrder.flatMap(({ after, before }) => {
    const beforeIndex = calls.findIndex(call => isMatch(call, before));
    const afterIndex = calls.findIndex(call => isMatch(call, after));
    if (afterIndex === -1) return [`never called: ${describe(after)}`];
    if (beforeIndex === -1) return [`never called: ${describe(before)}`];
    return beforeIndex < afterIndex
      ? []
      : [`${describe(before)} came after ${describe(after)}, not before`];
  });

/**
 * That a call was handed the prose it was supposed to pipe.
 */
export const checkStdin = (
  calls: readonly Call[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] =>
  vars.requireStdin.flatMap(({ command, includes }) => {
    const hits = calls.filter(call => isMatch(call, command));
    if (hits.length === 0) return [`never called: ${describe(command)}`];

    /* No wording named: the assertion is only that a body arrived on standard
       input, which is the rule for every prose payload the skill sends. Pinning
       words as well would fail a correct run for writing them differently. */
    if (includes.length === 0) {
      return hits.some(hit => hit.stdin !== '')
        ? []
        : [`${describe(command)} was handed no body on stdin`];
    }

    /* One body has to carry all of them. Checking each needle against any hit
       would let two separate calls satisfy a requirement neither one meets —
       a squash message with the trailers and a PR body with the summary would
       pass for a merge body that has only one of them. */
    if (hits.some(hit => includes.every(needle => hit.stdin.includes(needle))))
      return [];

    const missing = includes.filter(
      needle => hits.every(hit => !hit.stdin.includes(needle)),
    );
    return [
      `no single body handed to ${describe(command)} carries all of ` +
      describe(includes) +
      (missing.length > 0 ? ` (never seen at all: ${describe(missing)})` : '') +
      (hits.every(hit => hit.stdin === '')
        ? ' — nothing was piped to it at all'
        : ''),
    ];
  });

/*
 * Wording that must appear in no body at all, which is how a rule stated as an
 * absence gets checked. Every hit is examined rather than one of them: a
 * description that grew a heading is still wrong when some other call's body
 * was clean.
 */
export const checkForbiddenStdin = (
  calls: readonly Call[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] =>
  vars.forbidStdin.flatMap(({ command, includes }) =>
    calls
      .filter(call => isMatch(call, command))
      .flatMap(hit => includes.filter(needle => hit.stdin.includes(needle)))
      .map(
        needle =>
          `a body handed to ${describe(command)} contains ${needle}, which ` +
          'the default description rules out',
      ),
  );

/**
 * Commits the agent added on top of the seeded tip.
 *
 * A count rather than an inspection: what the messages say is
 * gtb-git-commit-conventions' business, exercised by its own suite. What
 * belongs here is that review feedback was not collapsed into one commit.
 */
const checkCommits = (vars: v.InferOutput<typeof VarsSchema>): string[] => {
  if (vars.minCommits === 0) return [];

  const recorded = parseJson(fs.readFileSync(baselinesPath(), 'utf8')) ?? {};
  const baselines = v.parse(TipsSchema, recorded);
  const tip = baselines[vars.scenario];
  if (tip === undefined) return [`no recorded baseline for ${vars.scenario}`];

  const cwd = path.join(
    skillsRoot(),
    ...scenarioPath(vars.scenario).split('/'),
  );
  const result = probeGit({ cwd, git: resolveRealGit() }, [
    'rev-list',
    '--count',
    `${tip}..HEAD`,
  ]);
  if (result.status !== 0)
    return [`could not count commits in ${vars.scenario}: ${result.stderr.trim()}`];

  const added = Number(result.stdout.trim());
  return added >= vars.minCommits
    ? []
    : [
        `added ${String(added)} commit(s) over the baseline, expected at least ` +
        `${String(vars.minCommits)} — one per finding, not one for all of them`,
      ];
};

/**
 * Asserts the skill made the calls its rules require, in the order they
 * require, and none of the ones they forbid.
 */
export default function assertAuthoringCalls(
  _output: unknown,
  context: { vars?: unknown },
): AssertionResult {
  const vars = v.parse(VarsSchema, context.vars ?? {});
  /* This scenario's own log, not a shared one: the stubs key a file per
     checkout, so a concurrent test's calls are never in here to be matched. */
  const logFile = path.join(suiteRunDir(import.meta.url), `${vars.scenario}.jsonl`);
  const calls = readJsonl(logFile, EntrySchema).map(
    entry => ({ command: entry.argv.join(' '), stdin: entry.stdin }),
  );

  return fromProblems([
    ...checkPresence(calls, vars),
    ...checkOneOf(calls, vars),
    ...checkOrder(calls, vars),
    ...checkForbiddenOrder(calls, vars),
    ...checkStdin(calls, vars),
    ...checkForbiddenStdin(calls, vars),
    ...checkCommits(vars),
  ]);
}
