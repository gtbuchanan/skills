/*
 * Which pull request a call is about, and which one the next `pr create`
 * opens.
 *
 * Split from bin/gh-stub.ts for the same reason checks.ts and state.ts were:
 * the stub decides which question was asked, and this decides the identity of
 * the pull request the answer is about. Two facts make that identity, and the
 * double got both from constants until a run opened a second pull request —
 * one number, and one head branch.
 *
 * Neither constant was wrong for a run that opens exactly one. What they cost
 * was the ability to ask how many a run opened at all: the second create
 * overwrote the first in the state file, title and body and all, so the answer
 * was one however the run behaved.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import spawn from 'cross-spawn';
import type { Scenario } from './shapes.ts';
import type { State } from './state.ts';
import { hermeticGitEnv, resolveRealGit } from '#lib/real-git.ts';

/**
 * The first PR number a run hands out. Anything the scenarios do not already
 * use will do; it only has to look like a real URL.
 */
export const firstPrNumber = 101;

/**
 * The number the next `pr create` reports: one past every number this world
 * already knows about, so a run that opens two pull requests gets two.
 */
export const nextPrNumber = (state: State, scenario: Scenario): number =>
  Math.max(
    firstPrNumber - 1,
    ...Object.keys(state.opened).map(Number),
    ...(scenario.pr === undefined ? [] : [scenario.pr.number]),
    ...scenario.dependents.map(dependent => dependent.number),
  ) + 1;

/**
 * The branch a call is about: what `--head` names, or the branch the checkout
 * is standing on.
 *
 * Two open pull requests cannot share a head, so a double that reports the
 * scenario's own branch for every one of them describes a world GitHub would
 * refuse — and makes an agent that branched for its second unit look exactly
 * like one that piled both onto the first branch.
 *
 * Resolved through the real git binary rather than the name on PATH, so asking
 * is not recorded in the call log as though the skill had asked. Falling back
 * to the scenario's branch covers a world with no checkout beneath it, which
 * is what the stub's own tests seed.
 */
export const currentHead = (options: {
  argv: readonly string[];
  dir: string;
  fallback: string;
}): string => {
  const flag = options.argv.indexOf('--head');
  if (flag !== -1) return options.argv[flag + 1] ?? options.fallback;

  const result = spawn.sync(
    resolveRealGit(),
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    { cwd: options.dir, encoding: 'utf8', env: hermeticGitEnv() },
  );
  const branch = result.status === 0 ? result.stdout.trim() : '';
  return branch === '' || branch === 'HEAD' ? options.fallback : branch;
};

/**
 * Whether this world already has an open pull request from `head`.
 *
 * GitHub allows one per head branch and says so rather than opening a second.
 * The refusal is load-bearing rather than decorative: without it, "the run
 * opened two pull requests" passes for a run that opened both from the same
 * branch, which is the very thing the question is asked to detect.
 *
 * Merged records are excluded because the rule is about *open* pull requests —
 * merging releases the branch. Asking whether a record exists instead would
 * refuse a legitimate create with the duplicate error, which is the one
 * refusal indistinguishable from the case this is here to catch.
 */
export const hasOpenPrFrom = (
  state: State,
  scenario: Scenario,
  head: string,
): boolean => {
  const isOpenFromHead = (number: number, headRefName: string): boolean =>
    headRefName === head && !state.merged.includes(number);

  const own = scenario.pr;

  return (
    (own !== undefined && isOpenFromHead(own.number, own.headRefName)) ||
    Object.entries(state.opened).some(([number, opened]) =>
      isOpenFromHead(Number(number), opened.headRefName),
    )
  );
};

/**
 * The pull request a call means when it names no number — gh answers for the
 * branch you are on. That is the scenario's own where it seeds one, and
 * otherwise whichever this run opened from `head`.
 */
export const impliedNumber = (
  state: State,
  scenario: Scenario,
  head: string,
): number => {
  const own = scenario.pr;
  if (own !== undefined) return own.number;

  const entry = Object.entries(state.opened).find(
    ([, opened]) => opened.headRefName === head,
  );
  return entry === undefined ? firstPrNumber : Number(entry[0]);
};
