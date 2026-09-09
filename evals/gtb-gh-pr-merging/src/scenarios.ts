/*
 * The world each of this suite's scenarios runs against.
 *
 * Two halves that have to agree. The git side is a real repository, seeded by
 * `repoScenarioSeeding` against a local bare origin, so `log`, `status` and the
 * range a squash message is built from are true by construction. The GitHub
 * side cannot be reached at all, so it is stated here and served by
 * bin/gh-stub.ts — one module both sides read, which is what stops a scenario
 * describing a pull request whose branch the checkout does not have.
 *
 * Every scenario here starts from a pull request that is already approved.
 * Nothing about the code under review is the measurement: what is being
 * measured is what happens to the branch, the message and whatever is stacked
 * on it once somebody decides to land it.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import type { Scenario } from '@gtbuchanan/github-cli-stub/scenario-world';
import { baseBranch } from './repository.ts';
import {
  limiterAfter,
  limiterBefore,
  parserAfter,
  parserBefore,
  tokenizerBefore,
} from './trees.ts';

export const scenarios: readonly Scenario[] = [
  /*
   * A branch with a pull request stacked on it, and a repository that does not
   * clean up after itself. Both halves of the credit problem are here too: Dana
   * is named by a trailer on a branch commit, Sam only by having authored one.
   */
  {
    branch: 'add-rate-limiter',
    comments: [],
    commits: [
      {
        date: '2026-05-05T09:00:00-05:00',
        key: 'base',
        subject: 'Add the rate limiter',
        tree: { 'src/limiter.ts': limiterBefore },
      },
    ],
    deleteBranchOnMerge: false,
    dependents: [
      {
        headRefName: 'add-limiter-metrics',
        number: 9,
        title: 'Report rate limiter rejections to the metrics sink',
      },
    ],
    extra: {
      /* A teammate's commit, carrying no trailer that names them. The credit is
       * on the commit object alone, so a squash message assembled from the
       * trailers keeps Dana and loses Sam — which is the whole difference
       * between reading the range's trailers and reading its authors. */
      author: { email: 'sam@example.com', name: 'Sam Okafor' },
      push: true,
      subject: 'Count a rejection against the window it was rejected in',
      trailers: ['Co-authored-by: Dana Reyes <dana@example.com>'],
      tree: { 'src/limiter.ts': limiterAfter },
    },
    key: 'merge-stacked',
    pr: {
      baseRefName: baseBranch,
      body: 'Adds the rate limiter and counts rejections per window.',
      headRefName: 'add-rate-limiter',
      isDraft: false,
      number: 7,
      title: 'Add the rate limiter',
    },
    reviewComments: [],
    reviews: [
      {
        author: { login: 'dana' },
        body: 'Looks right to me.',
        state: 'APPROVED',
      },
    ],
  },
  /*
   * A member of a stack `gh stack` knows about, where `gh pr merge` refuses the
   * merge outright and the asynchronous endpoint is the only way in.
   */
  {
    branch: 'split-the-parser',
    comments: [],
    commits: [
      {
        date: '2026-05-09T09:00:00-05:00',
        key: 'base',
        subject: 'Split the parser into a tokenizer and a reader',
        tree: { 'src/tokenize.ts': tokenizerBefore },
      },
    ],
    deleteBranchOnMerge: true,
    dependents: [],
    isStackMember: true,
    key: 'stack-member',
    pr: {
      baseRefName: baseBranch,
      body: 'First of the parser split. Tokenizer only.',
      headRefName: 'split-the-parser',
      isDraft: false,
      number: 14,
      title: 'Split the parser into a tokenizer and a reader',
    },
    reviewComments: [],
    reviews: [
      {
        author: { login: 'dana' },
        body: 'Reads well.',
        state: 'APPROVED',
      },
    ],
  },
  /*
   * Approved with the checks still running, which is the only state in which
   * `--auto` defers rather than merging on the spot.
   */
  {
    branch: 'bump-parser',
    checksPending: true,
    comments: [],
    commits: [
      {
        date: '2026-05-06T09:00:00-05:00',
        key: 'base',
        subject: 'Pin the parser dependency',
        tree: { 'package.json': parserBefore },
      },
      {
        date: '2026-05-07T09:00:00-05:00',
        key: 'bump',
        subject: 'Update the parser to 1.3.0',
        tree: { 'package.json': parserAfter },
      },
    ],
    deleteBranchOnMerge: true,
    dependents: [],
    key: 'auto-merge',
    pr: {
      baseRefName: baseBranch,
      body: 'Routine dependency bump.',
      headRefName: 'bump-parser',
      isDraft: false,
      number: 31,
      title: 'Update the parser to 1.3.0',
    },
    reviewComments: [],
    reviews: [
      {
        author: { login: 'dana' },
        body: 'Fine by me.',
        state: 'APPROVED',
      },
    ],
  },
];
