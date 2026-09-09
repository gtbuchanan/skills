/*
 * Tests for the pull request records a double answers a scenario with.
 *
 * A double is worth exactly what its answers are worth, and the expensive
 * failure here is the plausible wrong answer rather than the obvious one: a
 * dependent that looks like the pull request being merged, a `--base` filter
 * quietly ignored, a merged pull request still listed as open. Each of those
 * passes every assertion about what the agent *called* while handing it a world
 * that does not exist — so the cases below are the ones where being wrong looks
 * like being right.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { UnmodelledCall } from '@gtbuchanan/stub-runtime/dispatch';
import { test } from 'vitest';
import { prRecords, toWireComment } from '@gtbuchanan/github-cli-stub/pr-records';
import type { Scenario } from '@gtbuchanan/github-cli-stub/scenario-world';
import type { State } from '@gtbuchanan/github-cli-stub/state';
import { emptyState } from '@gtbuchanan/github-cli-stub/state';

const repoSlug = 'acme/widgets';

/**
 * The pull request the world is about, kept beside the scenario so a case that
 * varies one field of it does not have to assert the whole thing is there.
 */
const own = {
  baseRefName: 'main',
  body: 'Adds the rate limiter.',
  headRefName: 'add-rate-limiter',
  isDraft: false,
  number: 7,
  title: 'Add the rate limiter',
};

/**
 * A world with its own pull request #7 and one stacked on its branch — the
 * shape every merge rule is about.
 */
const scenario: Scenario = {
  branch: 'add-rate-limiter',
  comments: [],
  commits: [],
  deleteBranchOnMerge: false,
  dependents: [
    {
      headRefName: 'add-limiter-metrics',
      number: 9,
      title: 'Report rate limiter rejections',
    },
  ],
  key: 'merge-stacked',
  pr: own,
  reviewComments: [],
  reviews: [{ author: { login: 'dana' }, body: 'Looks right.', state: 'APPROVED' }],
};

const recordsFor = (
  state: State = emptyState,
  head = scenario.branch,
  world: Scenario = scenario,
): ReturnType<typeof prRecords> =>
  prRecords({ head: () => head, repoSlug, scenario: world, state });

test('a dependent answers as itself, not as the pull request being merged', ({ expect }) => {
  /*
   * The whole point of looking before a merge is to find what is stacked on the
   * branch. A double that answered every number with the scenario's own record
   * would report #9 as #7 — so the merge rules would see no dependent, delete
   * the branch, and the suite would call that correct.
   */
  const dependent = recordsFor().named(9);

  expect(dependent['number']).toBe(9);
  expect(dependent['headRefName']).toBe('add-limiter-metrics');
  /* Its base is the branch about to disappear, which is what makes it a
     dependent rather than an unrelated pull request. */
  expect(dependent['baseRefName']).toBe('add-rate-limiter');
});

test('a number the world does not have is refused rather than answered', ({ expect }) => {
  /*
   * Returning an empty record would read as "that pull request exists and has
   * nothing in it", and an agent acts on that. The refusal is what turns an
   * unmodelled call into a visible failure.
   */
  expect(() => recordsFor().named(404)).toThrow(UnmodelledCall);
});

test('an unnamed call answers for the branch the caller is standing on', ({ expect }) => {
  /*
   * gh resolves a bare `pr view` from the checkout. Letting the seeded pull
   * request win regardless of head would address #7 from a branch it has
   * nothing to do with — and `pr merge` and `pr ready` take the same path.
   */
  const opened = {
    baseRefName: 'main',
    body: '',
    headRefName: 'other-work',
    title: 'Something else',
  };
  const state: State = { ...emptyState, opened: { 101: opened } };

  expect(recordsFor(state, 'other-work').named(undefined)['number']).toBe(101);
  expect(recordsFor(state, scenario.branch).named(undefined)['number']).toBe(7);
});

test('pr list honours --base rather than answering identically for every branch', ({ expect }) => {
  /*
   * A filter the double ignores makes a stacked pull request indistinguishable
   * from an unrelated one, which is exactly the confusion the merge rules exist
   * to prevent.
   */
  const stacked = recordsFor().listing(['pr', 'list', '--base', 'add-rate-limiter']);

  expect(stacked.map(record => record['number'])).toStrictEqual([9]);

  const none = recordsFor().listing(['pr', 'list', '--base', 'no-such-branch']);

  expect(none).toStrictEqual([]);
});

test('a merged pull request leaves the default listing but not --state all', ({ expect }) => {
  /*
   * `pr list` shows open pull requests unless told otherwise. A merged one
   * still appearing would make a dependent check find work that has already
   * landed and refuse to delete a branch nothing points at.
   */
  const state: State = { ...emptyState, merged: [9] };

  const open = recordsFor(state).listing(['pr', 'list']);

  expect(open.map(record => record['number'])).toStrictEqual([7]);
  expect(
    recordsFor(state).listing(['pr', 'list', '--state', 'all']).map(record => record['number']),
  ).toStrictEqual([7, 9]);
});

test('a retarget recorded by an earlier call survives into the next answer', ({ expect }) => {
  /*
   * `pr edit --base` is how a dependent is moved off a branch before it goes.
   * A double that forgot it would report the old base, and the merge rules
   * would read the retarget as never having happened.
   */
  const state: State = { ...emptyState, retargeted: { 9: 'main' } };

  expect(recordsFor(state).named(9)['baseRefName']).toBe('main');
});

test('promoting and merging are reflected rather than reported from the seed', ({ expect }) => {
  const draft: Scenario = { ...scenario, pr: { ...own, isDraft: true } };

  expect(recordsFor(emptyState, scenario.branch, draft).named(7)['isDraft']).toBe(true);
  expect(
    recordsFor({ ...emptyState, ready: [7] }, scenario.branch, draft).named(7)['isDraft'],
  ).toBe(false);
  expect(
    recordsFor({ ...emptyState, merged: [7] }).named(7)['state'],
  ).toBe('MERGED');
});

test('review state decides reviewDecision rather than a constant', ({ expect }) => {
  expect(recordsFor().named(7)['reviewDecision']).toBe('APPROVED');

  const unreviewed: Scenario = { ...scenario, reviews: [] };

  expect(
    recordsFor(emptyState, scenario.branch, unreviewed).named(7)['reviewDecision'],
  ).toBe('REVIEW_REQUIRED');
});

test('a scenario whose checks are still running does not report itself mergeable', ({ expect }) => {
  /*
   * A scenario whose task says the checks are pending has to say so here too,
   * or the agent reads a world that contradicts the task it was given.
   */
  const pending: Scenario = { ...scenario, checksPending: true };
  const record = recordsFor(emptyState, scenario.branch, pending).named(7);

  expect(record['mergeStateStatus']).toBe('BLOCKED');
});

test('repo view reports no template as an empty list, not a missing key', ({ expect }) => {
  /*
   * A dropped key reads as "this repository has no opinion"; an empty list is
   * the answer gh actually gives, and the default-description rule turns on
   * telling those apart.
   */
  expect(recordsFor().repository()['pullRequestTemplates']).toStrictEqual([]);

  const templated: Scenario = { ...scenario, template: '### Description' };

  expect(
    recordsFor(emptyState, scenario.branch, templated).repository()['pullRequestTemplates'],
  ).toStrictEqual([{ body: '### Description', filename: 'pull_request_template.md' }]);
});

test('a thread root survives serialisation as an explicit null', ({ expect }) => {
  /*
   * The skill finds a thread root by `in_reply_to_id` being null. Leaving the
   * key undefined drops it from the JSON entirely, which is a different claim
   * and one the rule cannot act on.
   */
  const root = toWireComment({
    body: 'Needs a cryptographic RNG.',
    id: 5001,
    path: 'src/token.ts',
    user: { login: 'qa-bot' },
  });

  expect(JSON.stringify(root)).toContain('"in_reply_to_id":null');
});
