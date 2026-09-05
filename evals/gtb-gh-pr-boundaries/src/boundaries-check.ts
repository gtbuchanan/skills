/*
 * promptfoo javascript assertion for where a change's boundaries fell.
 *
 * Three things the skill claims, each checked against what the run produced
 * rather than what it reported — an agent that describes two pull requests and
 * opens one has failed in the way this skill exists to prevent, and only the
 * record can tell them apart.
 *
 *   how many   — one unit, one pull request. Both directions are load-bearing:
 *                a suite that only catches under-splitting passes an agent
 *                that splits everything, which is the other way to be wrong.
 *   from where — each pull request from a head of its own. Read from the
 *                records the double persisted rather than from branch
 *                commands, because a run can create branches it never opens a
 *                pull request from, and those must not stand in for one.
 *   when       — a pull request opens while work remains, not after all of it.
 *                The log is one chronological stream, so a create landing
 *                before the last commit is what says the agent shipped as it
 *                went rather than deciding the division at the end.
 */
import path from 'node:path';
import type { AssertionResult } from '@gtbuchanan/agent-skills-harness/assert';
import { fromProblems } from '@gtbuchanan/agent-skills-harness/assert';
import { CallSchema, readJsonl } from '@gtbuchanan/agent-skills-harness/calls';
import { skillsRoot, suiteRunDir } from '@gtbuchanan/agent-skills-harness/paths';
import { readState } from '@gtbuchanan/github-cli-stub/state';
import * as v from 'valibot';
import { scenarioPath } from './setup.ts';

const VarsSchema = v.object({
  maxPullRequests: v.number(),
  minPullRequests: v.number(),
  scenario: v.string(),
});

const prCreateCall = /\bpr\s+create\b/v;
const commitCall = /\bcommit\b/v;

/**
 * Asserts the work became the number of pull requests it was worth, each from
 * a head of its own, opened as the run went rather than at the end.
 */
export default function assertBoundaries(
  _output: unknown,
  context: { vars?: unknown },
): AssertionResult {
  const vars = v.parse(VarsSchema, context.vars ?? {});

  /* One chronological stream. Splitting it by command is what loses the
     ordering the third rule is about. */
  const calls = readJsonl(
    path.join(suiteRunDir(import.meta.url), `${vars.scenario}.jsonl`),
    CallSchema,
  ).map(call => ({ cmd: call.cmd, line: call.argv.join(' ') }));

  /* Tagged once, so the two rules below read positions out of one sequence
     rather than reconstructing the order from two filtered lists. */
  const kinds = calls.map((call) => {
    if (call.cmd === 'gh' && prCreateCall.test(call.line)) return 'create';
    if (call.cmd === 'git' && commitCall.test(call.line)) return 'commit';

    return 'other';
  });
  const firstCreate = kinds.indexOf('create');
  const lastCommit = kinds.lastIndexOf('commit');

  /* What the double recorded, which is the pull requests that actually exist
     rather than the calls that asked for them. */
  const state = readState(
    path.join(
      skillsRoot(),
      ...scenarioPath(vars.scenario).split('/'),
      '.eval-state.json',
    ),
  );
  const opened = Object.values(state.opened);
  const heads = opened.map(entry => entry.headRefName);

  const problems: string[] = [];

  if (opened.length < vars.minPullRequests) {
    problems.push(
      `opened ${String(opened.length)} pull request(s), expected ` +
      `${String(vars.minPullRequests)} — the units arrived bundled`,
    );
  }
  if (opened.length > vars.maxPullRequests) {
    problems.push(
      `opened ${String(opened.length)} pull request(s), expected ` +
      `${String(vars.maxPullRequests)} — a seam was invented`,
    );
  }

  if (new Set(heads).size !== heads.length) {
    problems.push(
      `two pull requests share the head ${heads.join(', ')} — GitHub refuses ` +
      'the second, so this is one reviewable thing reported as two',
    );
  }

  /* Only meaningful where more than one unit is expected: a single unit has no
     "next one" to open before. */
  if (
    firstCreate !== -1 &&
    lastCommit !== -1 &&
    vars.minPullRequests > 1 &&
    firstCreate > lastCommit
  ) {
    problems.push(
      'every pull request opened after the last commit — the division was ' +
      'decided at the end rather than as each unit went green',
    );
  }

  return fromProblems(problems);
}
