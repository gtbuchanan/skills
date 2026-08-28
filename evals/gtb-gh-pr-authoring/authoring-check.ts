/*
 * promptfoo javascript assertion for gtb-gh-pr-authoring.
 *
 * The suite's doubles append every `gh` and `git` invocation to
 * artifacts/skill-evals/gtb-gh-pr-authoring.calls.jsonl, `gh` calls carrying the
 * body they were handed on standard input. Almost everything this skill governs
 * shows up there: which flags a merge carried, whether checks were watched,
 * whether all three feedback surfaces were read, which threads were answered.
 *
 * Expectations are declared per test as vars rather than written as code, so a
 * scenario reads as the rule it is defending:
 *
 *   requireCalls   — [[...substrings]] all of which must appear in ONE command
 *   forbidCalls    — the same shape, for calls that must never be made
 *   requireOrder   — { before, after } pairs; before's first match must precede
 *                    after's, which is how "push the fixes, then reply" and
 *                    "retarget dependents, then merge" are checked
 *   requireStdin   — { command, includes }: a call matching `command` must have
 *                    been handed a body containing `includes`
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
import type { AssertionResult } from '#lib/assert.ts';
import { fromProblems } from '#lib/assert.ts';
import { parseJson, readJsonl } from '#lib/calls.ts';
import { skillsRoot, suiteCallLog } from '#lib/paths.ts';
import { resolveRealGit } from '#lib/real-git.ts';
import { probeGit } from '#lib/seed-repo.ts';

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

const VarsSchema = v.object({
  forbidCalls: v.optional(ClauseListSchema, []),
  minCommits: v.optional(v.number(), 0),
  requireCalls: v.optional(ClauseListSchema, []),
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

const checkOrder = (
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

const checkStdin = (
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
  const calls = readJsonl(suiteCallLog(import.meta.url), EntrySchema).map(
    entry => ({ command: entry.argv.join(' '), stdin: entry.stdin }),
  );

  return fromProblems([
    ...checkPresence(calls, vars),
    ...checkOrder(calls, vars),
    ...checkStdin(calls, vars),
    ...checkCommits(vars),
  ]);
}
