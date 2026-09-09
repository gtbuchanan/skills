/*
 * A promptfoo javascript assertion driven by per-test expectations.
 *
 * A suite's doubles append every invocation to a per-scenario log under the
 * suite's run directory, carrying the body they were handed on standard input.
 * Almost everything a CLI-shaped skill governs shows up there: which flags a
 * merge carried, whether checks were watched, whether every feedback surface
 * was read, which threads were answered.
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
 *   forbidStdin    — the same shape, for wording no such body may contain, where
 *                    what the rule states is an absence
 *
 * Matching is substring-based over the joined argv, and every check is
 * presence, absence or relative order rather than a count — so a shared log
 * stays safe across repeats, which the suite truncates per test anyway.
 *
 * All of it reads the call log and nothing else. An expectation about the
 * world the run left behind — the commits it added, say — is a `checks` entry
 * a suite supplies, which is what keeps this usable by a suite whose scenarios
 * are not repositories.
 */
import path from 'node:path';
import { readJsonl } from '@gtbuchanan/stub-runtime/calls';
import * as v from 'valibot';
import { type AssertionResult, fromProblems } from './assert.ts';
import { suiteRunDir } from './paths.ts';

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
export const CallVarsSchema = v.object({
  forbidCalls: v.optional(ClauseListSchema, []),
  forbidOrder: v.optional(v.array(OrderSchema), []),
  forbidStdin: v.optional(v.array(StdinSchema), []),
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

interface Call {
  readonly command: string;
  readonly stdin: string;
}

const isMatch = (call: Call, clause: readonly string[]): boolean =>
  clause.every(needle => call.command.includes(needle));

const describe = (clause: readonly string[]): string => clause.join(' + ');

const checkPresence = (
  calls: readonly Call[],
  vars: v.InferOutput<typeof CallVarsSchema>,
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
  vars: v.InferOutput<typeof CallVarsSchema>,
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
  vars: v.InferOutput<typeof CallVarsSchema>,
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
  vars: v.InferOutput<typeof CallVarsSchema>,
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
  vars: v.InferOutput<typeof CallVarsSchema>,
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
  vars: v.InferOutput<typeof CallVarsSchema>,
): string[] =>
  vars.forbidStdin.flatMap(({ command, includes }) =>
    calls
      .filter(call => isMatch(call, command))
      .flatMap(hit => includes.filter(needle => hit.stdin.includes(needle)))
      .map(
        needle =>
          `a body handed to ${describe(command)} contains ${needle}, which ` +
          'this scenario rules out',
      ),
  );

/**
 * An expectation a suite adds to the ones every call log supports, given the
 * raw promptfoo vars and returning what went wrong.
 *
 * Raw rather than parsed, because a check that reads a var this engine has
 * never heard of is the whole reason for the seam — `commit-count.ts` is one,
 * and it is the only thing in this package that needs a repository.
 */
export type OutcomeCheck = (rawVars: unknown) => string[];

/**
 * What a suite supplies so the assertion can find its own artifacts.
 */
export interface CallExpectationOptions {
  /**
   * Expectations about the world the run left behind, which this module has no
   * way to read.
   */
  readonly outcomeChecks?: readonly OutcomeCheck[] | undefined;
  /**
   * `import.meta.url` of the suite module calling this, which is what names
   * the suite and therefore its call logs.
   */
  readonly metaUrl: string;
}

/**
 * A promptfoo assertion that the skill made the calls its rules require, in
 * the order they require, and none of the ones they forbid.
 *
 * Returned as a function rather than exported as one, because which suite is
 * asking decides where the logs are — and deriving that from this module's own
 * location would name the harness rather than the suite.
 */
export const callExpectationAssertion = (
  options: CallExpectationOptions,
): ((output: unknown, context: { vars?: unknown }) => AssertionResult) =>
  (_output, context) => {
    const vars = v.parse(CallVarsSchema, context.vars ?? {});
    /* This scenario's own log, not a shared one: the doubles key a file per
       workspace, so a concurrent test's calls are never in here to be
       matched. */
    const logFile = path.join(
      suiteRunDir(options.metaUrl),
      `${vars.scenario}.jsonl`,
    );
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
      ...(options.outcomeChecks ?? []).flatMap(check => check(context.vars)),
    ]);
  };
