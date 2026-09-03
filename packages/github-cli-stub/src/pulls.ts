/*
 * Which pull request a call is about, and which one the next `pr create`
 * opens.
 *
 * A dispatch decides which question was asked; this decides the identity of the
 * pull request the answer is about. Two facts make that identity, and a double
 * gets both from constants until a run opens a second one — one number, and one
 * head branch.
 *
 * Neither constant is wrong for a run that opens exactly one. What they cost is
 * the ability to ask how many a run opened at all: the second create overwrites
 * the first in the state file, title and body and all, so the answer is one
 * however the run behaved.
 *
 * Loaded by stubs running under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import type { DependentPr, PullRequest } from './records.ts';
import type { State } from './state.ts';

/**
 * The pull requests a world starts with, before this run opened anything.
 *
 * Only what identity needs. A caller's own scenario type satisfies this by
 * having the fields, so nothing has to be converted at the boundary.
 */
export interface SeededWorld {
  readonly dependents: readonly DependentPr[];
  readonly pr?: PullRequest | undefined;
}

/**
 * The first number a run hands out. Anything the seeded worlds do not already
 * use will do; it only has to look like a real one.
 */
export const firstPrNumber = 101;

/**
 * The number the next `pr create` reports: one past every number this world
 * already knows about, so a run that opens two pull requests gets two.
 */
export const nextPrNumber = (state: State, world: SeededWorld): number =>
  Math.max(
    firstPrNumber - 1,
    ...Object.keys(state.opened).map(Number),
    ...(world.pr === undefined ? [] : [world.pr.number]),
    ...world.dependents.map(dependent => dependent.number),
  ) + 1;

/**
 * The branch a call is about: what `--head` names, or the branch the checkout
 * is standing on.
 *
 * Two open pull requests cannot share a head, so a double that reports one
 * branch for every one of them describes a world GitHub would refuse — and
 * makes an agent that branched for its second unit look exactly like one that
 * piled both onto the first branch.
 *
 * How to ask the checkout is the caller's, because asking means running git and
 * this package does not: a double records what the skill asked for, and a
 * question it asked itself has no business in that log.
 */
export const currentHead = (options: {
  readonly argv: readonly string[];
  readonly checkoutBranch: () => string;
  readonly fallback: string;
}): string => {
  const flag = options.argv.indexOf('--head');
  if (flag !== -1) return options.argv[flag + 1] ?? options.fallback;

  const branch = options.checkoutBranch();
  /* A detached HEAD names no branch, and neither does no checkout at all.
     Answering `HEAD` would put it in a pull request URL. */
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
  world: SeededWorld,
  head: string,
): boolean => {
  const isOpenFromHead = (number: number, headRefName: string): boolean =>
    headRefName === head && !state.merged.includes(number);

  const own = world.pr;

  return (
    (own !== undefined && isOpenFromHead(own.number, own.headRefName)) ||
    Object.entries(state.opened).some(([number, entry]) =>
      isOpenFromHead(Number(number), entry.headRefName),
    )
  );
};

/**
 * The pull request a call means when it names no number — gh answers for the
 * branch you are on, so `head` decides rather than the world.
 *
 * Letting a seeded pull request win regardless of head is harmless only while a
 * run can hold one at a time. Once it can open a second, an unnamed `pr ready`,
 * `pr merge` or `pr view` addresses the seeded one from a branch it has nothing
 * to do with — and the first two of those write state.
 *
 * The seeded pull request is still the last resort, because a world that seeds
 * one and has opened nothing from this branch is better answered with a pull
 * request that exists than with a number that does not.
 */
export const impliedNumber = (
  state: State,
  world: SeededWorld,
  head: string,
): number => {
  const own = world.pr;
  if (own?.headRefName === head) return own.number;

  const entry = Object.entries(state.opened).find(
    ([, opened]) => opened.headRefName === head,
  );
  if (entry !== undefined) return Number(entry[0]);

  return own?.number ?? firstPrNumber;
};
