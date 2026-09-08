/*
 * Building the pull request records a `gh` double answers a scenario with.
 *
 * `records.ts` says what the fields are called; this says how a world's own
 * pull request, the ones a run opened, and the ones stacked on its branch each
 * become one — including the parts a double gets wrong quietly. A dependent is
 * modelled fully enough to be told apart from the pull request being merged,
 * `pr list` honours the filters it was given, and a field nobody modelled is
 * refused rather than omitted.
 *
 * Refusals are raised as {@link UnmodelledCall} rather than exiting, because a
 * library module gets no entry-point exemption from `unicorn/no-process-exit`
 * — and because `dispatch` already turns that error into the refusal the agent
 * sees, naming the command.
 *
 * Loaded by stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import { unmodelled } from './dispatch.ts';
import type { ReviewCommentEntry, ReviewEntry } from './records.ts';
import type { Scenario } from './scenario-world.ts';
import type { State } from './state.ts';

/**
 * What a record builder needs beyond the world itself.
 */
export interface PrRecordContext {
  /**
   * The branch a call with no pull request number is about. Supplied rather
   * than derived, because deciding it means asking the checkout and this
   * package does not run git.
   */
  readonly head: () => string;
  readonly repoSlug: string;
  readonly scenario: Scenario;
  readonly state: State;
}

/**
 * An inline review comment as the REST endpoint returns it.
 *
 * A thread root is stated there as an explicit null, and a skill keys on
 * exactly that, so the wire shape has to carry it rather than omitting the
 * field.
 */
export const toWireComment = (comment: ReviewCommentEntry): unknown => ({
  ...comment,
  /* eslint-disable-next-line unicorn/no-null --
     null is the value GitHub sends for a thread root; undefined would drop the
     key entirely and stop a suite exercising the rule that reads it. */
  in_reply_to_id: comment.in_reply_to_id ?? null,
});

/**
 * The record builders for one call, bound to the world it is being answered
 * from.
 */
export interface PrRecords {
  /**
   * Every open pull request in the world: the scenario's own, anything stacked
   * on its branch, and anything this run opened.
   */
  readonly all: () => Record<string, unknown>[];
  /**
   * `pr list`, honouring `--base` and `--state` when they are given.
   */
  readonly listing: (argv: readonly string[]) => Record<string, unknown>[];
  /**
   * The pull request this call names, or the one its branch implies.
   */
  readonly named: (number: number | undefined) => Record<string, unknown>;
  /**
   * Everything `repo view` can answer, as one record for `pick` to narrow.
   */
  readonly repository: () => Record<string, unknown>;
  readonly url: (number: number) => string;
}

export const prRecords = (context: PrRecordContext): PrRecords => {
  const { head, repoSlug, scenario, state } = context;

  const url = (number: number): string =>
    `https://github.com/${repoSlug}/pull/${String(number)}`;

  const isMerged = (number: number): boolean => state.merged.includes(number);

  const baseOf = (number: number, fallback: string): string =>
    state.retargeted[String(number)] ?? fallback;

  /**
   * The mergeability fields a skill checks before merging. Constant because no
   * scenario turns on them — but modelled rather than refused, since a pull
   * request the suite says is approved and green should answer that question
   * when asked.
   */
  const readiness = (
    reviews: readonly ReviewEntry[],
  ): Record<string, unknown> => ({
    /* eslint-disable-next-line unicorn/no-null --
       JSON.stringify drops a key whose value is undefined, so an agent asking
       for this one would read an absent field as an absent answer. gh states
       it as an explicit null, and the difference is the whole point of
       asking. */
    autoMergeRequest: null,
    mergeable: 'MERGEABLE',
    mergeStateStatus: scenario.checksPending === true ? 'BLOCKED' : 'CLEAN',
    reviewDecision: reviews.some(review => review.state === 'APPROVED')
      ? 'APPROVED'
      : 'REVIEW_REQUIRED',
    statusCheckRollup: scenario.checksPending === true
      /* eslint-disable-next-line unicorn/no-null --
         Same again: a check still running reports its conclusion as null, and
         the key has to survive serialisation to say so. */
      ? [{ conclusion: null, name: 'build', status: 'IN_PROGRESS' }]
      : [{ conclusion: 'SUCCESS', name: 'build', status: 'COMPLETED' }],
  });

  const ownRecord = (): Record<string, unknown> => {
    const own = scenario.pr;
    if (own === undefined) throw unmodelled('no pull request named');

    return {
      ...own,
      ...readiness(scenario.reviews),
      baseRefName: baseOf(own.number, own.baseRefName),
      comments: scenario.comments,
      isDraft: own.isDraft && !state.ready.includes(own.number),
      reviews: scenario.reviews,
      state: isMerged(own.number) ? 'MERGED' : 'OPEN',
      url: url(own.number),
    };
  };

  const openedRecord = (number: number): Record<string, unknown> => {
    const opened = state.opened[String(number)];
    if (opened === undefined)
      throw unmodelled(`no pull request ${String(number)}`);

    return {
      ...opened,
      ...readiness([]),
      baseRefName: baseOf(number, opened.baseRefName),
      comments: [],
      isDraft: !state.ready.includes(number),
      number,
      reviews: [],
      state: isMerged(number) ? 'MERGED' : 'OPEN',
      url: url(number),
    };
  };

  const dependentRecord = (number: number): Record<string, unknown> => {
    const dependent = scenario.dependents.find(other => other.number === number);
    if (dependent === undefined)
      throw unmodelled(`no pull request ${String(number)}`);

    return {
      ...readiness([]),
      baseRefName: baseOf(dependent.number, scenario.branch),
      body: '',
      comments: [],
      headRefName: dependent.headRefName,
      isDraft: false,
      number: dependent.number,
      reviews: [],
      state: isMerged(dependent.number) ? 'MERGED' : 'OPEN',
      title: dependent.title,
      url: url(dependent.number),
    };
  };

  const named = (number: number | undefined): Record<string, unknown> => {
    const own = scenario.pr;
    if (own !== undefined && number === own.number) return ownRecord();
    if (number === undefined) {
      /* Naming no number is not the same as naming nothing: gh answers for the
         branch you are on, so the head decides which one — the scenario's own
         only while standing on it. In a scenario that seeds no pull request it
         is whichever this run opened, and refusing here would fail a run for
         doing the ordinary thing: creating one and reading it back. */
      const branch = head();
      if (own?.headRefName === branch) return ownRecord();

      const entry = Object.entries(state.opened).find(
        ([, pr]) => pr.headRefName === branch,
      );
      if (entry === undefined) throw unmodelled('no pull request named');

      return openedRecord(Number(entry[0]));
    }

    return state.opened[String(number)] === undefined
      ? dependentRecord(number)
      : openedRecord(number);
  };

  const all = (): Record<string, unknown>[] => [
    ...(scenario.pr === undefined ? [] : [named(scenario.pr.number)]),
    ...scenario.dependents.map(dependent => named(dependent.number)),
    ...Object.keys(state.opened).map(number => named(Number(number))),
  ];

  const listing = (argv: readonly string[]): Record<string, unknown>[] => {
    const flag = argv.indexOf('--base');
    const base = flag === -1 ? undefined : argv[flag + 1];
    /* `pr list` shows open pull requests unless told otherwise, so a merged one
       has no business appearing in the answer a dependent check reads. */
    const wanted = argv.includes('--state')
      ? argv[argv.indexOf('--state') + 1]
      : 'open';

    return all().filter(
      record =>
        (base === undefined || record['baseRefName'] === base) &&
        (wanted === 'all' || record['state'] === wanted?.toUpperCase()),
    );
  };

  const repository = (): Record<string, unknown> => ({
    deleteBranchOnMerge: scenario.deleteBranchOnMerge,
    mergeCommitAllowed: true,
    nameWithOwner: repoSlug,
    pullRequestTemplates: scenario.template === undefined
      ? []
      : [{ body: scenario.template, filename: 'pull_request_template.md' }],
    rebaseMergeAllowed: true,
    squashMergeAllowed: true,
  });

  return { all, listing, named, repository, url };
};
