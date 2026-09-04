/*
 * promptfoo javascript assertion for where a change's boundaries fell.
 *
 * Three things the skill claims, and each is checked against what the run
 * actually produced rather than what it said it would do — an agent that
 * describes two pull requests and opens one has failed in the way this skill
 * exists to prevent, and only the record can tell them apart.
 *
 *   how many   — one unit, one pull request. Both directions are load-bearing:
 *                a suite that only catches under-splitting passes an agent
 *                that splits everything, which is the other way to be wrong.
 *   from where — two pull requests cannot share a head branch. GitHub refuses
 *                the second, and an agent that piled both units onto one
 *                branch has produced one reviewable thing while reporting two.
 *   when       — each pull request opens before the next unit's work begins,
 *                which is visible as a create landing between two commits
 *                rather than after both.
 */
import path from 'node:path';
import type { AssertionResult } from '@gtbuchanan/agent-skills-harness/assert';
import { fromProblems } from '@gtbuchanan/agent-skills-harness/assert';
import { readCommands } from '@gtbuchanan/agent-skills-harness/calls';
import { suiteRunDir } from '@gtbuchanan/agent-skills-harness/paths';
import * as v from 'valibot';

const VarsSchema = v.object({
  maxPullRequests: v.number(),
  minPullRequests: v.number(),
  scenario: v.string(),
});

/**
 * The log this scenario's doubles wrote. One file per scenario, so a
 * concurrent run of another test cannot be read as this one's work.
 */
const logFor = (scenario: string): string =>
  path.join(suiteRunDir(import.meta.url), `${scenario}.jsonl`);

/**
 * The branch a `git checkout -b` or `git switch -c` created.
 */
const branchCreated = (command: string): string | undefined =>
  /(?:checkout\s+-b|switch\s+-c)\s+(?<branch>\S+)/v.exec(command)?.groups?.['branch'];

/**
 * Asserts the work became the number of pull requests it was worth, each from
 * a branch of its own.
 */
export default function assertBoundaries(
  _output: unknown,
  context: { vars?: unknown },
): AssertionResult {
  const vars = v.parse(VarsSchema, context.vars ?? {});
  const log = logFor(vars.scenario);
  const gh = readCommands(log, 'gh');
  const git = readCommands(log, 'git');

  const creates = gh.filter(command => /\bpr\s+create\b/v.test(command));
  const branches = git
    .map(command => branchCreated(command))
    .filter((branch): branch is string => branch !== undefined);

  const problems: string[] = [];

  if (creates.length < vars.minPullRequests) {
    problems.push(
      `opened ${String(creates.length)} pull request(s), expected at least ` +
      `${String(vars.minPullRequests)} — the units arrived bundled`,
    );
  }
  if (creates.length > vars.maxPullRequests) {
    problems.push(
      `opened ${String(creates.length)} pull request(s), expected at most ` +
      `${String(vars.maxPullRequests)} — a seam was invented`,
    );
  }

  /* Only meaningful once more than one is expected: a single unit needs no
     branch of its own to be correct. */
  if (vars.minPullRequests > 1 && branches.length < vars.minPullRequests) {
    problems.push(
      `created ${String(branches.length)} branch(es) for ` +
      `${String(creates.length)} pull request(s) — two cannot share a head`,
    );
  }

  if (new Set(branches).size !== branches.length) {
    problems.push('reused a branch name, so two units share one head');
  }

  return fromProblems(problems);
}
