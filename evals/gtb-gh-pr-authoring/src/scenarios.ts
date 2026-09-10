/*
 * The world each of this suite's scenarios runs against.
 *
 * Two halves that have to agree. The git side is a real repository (setup.ts
 * seeds it against a local bare origin), so `log`, `status`, `diff` and even
 * `push` are true by construction and the recording `git` only has to note what
 * was asked. The GitHub side cannot be reached at all, so it is stated here and
 * served by bin/gh-stub.ts — one module both sides read, which is what stops a
 * scenario from describing a PR whose branch the checkout does not have.
 *
 * A scenario is identified by a marker file the seed drops in its checkout
 * rather than by an environment variable, because the stub is a fresh process
 * per call and the agent may run it from anywhere inside the tree. Walking up
 * from the working directory finds the world the agent is actually standing in.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import type { Scenario } from '@gtbuchanan/github-cli-stub/scenario-world';
import { baseBranch, viewer } from './repository.ts';
import {
  cacheAfter,
  cacheBefore,
  headerAfter,
  headerBefore,
  localeBefore,
  poolBefore,
  schedulerAfter,
  schedulerBefore,
  slugBefore,
  template,
  tokenBefore,
} from './trees.ts';

/**
 * Every scenario, keyed by the name its checkout is seeded under.
 */
export const scenarios: readonly Scenario[] = [
  {
    branch: 'fix-retry-backoff',
    comments: [],
    commits: [
      {
        date: '2026-05-01T09:00:00-05:00',
        key: 'base',
        subject: 'Add the scheduler retry helper',
        tree: { 'src/scheduler.ts': schedulerBefore },
      },
      {
        date: '2026-05-02T09:00:00-05:00',
        key: 'fix',
        subject: 'Back the scheduler retry off exponentially',
        tree: { 'src/scheduler.ts': schedulerAfter },
      },
    ],
    deleteBranchOnMerge: true,
    dependents: [],
    key: 'open-draft',
    reviewComments: [],
    reviews: [],
    template,
  },
  /*
   * The same opening, minus the template — `pullRequestTemplates` comes back
   * empty and the description has to come from the skill's own default. Kept
   * as its own scenario rather than a variant of open-draft because both run
   * to a real `gh pr create`, and one checkout cannot be opened twice.
   */
  {
    branch: 'fix-header-offset',
    comments: [],
    commits: [
      {
        date: '2026-05-06T09:00:00-05:00',
        key: 'base',
        subject: 'Add the header offset helper',
        tree: { 'src/header.ts': headerBefore },
      },
      {
        date: '2026-05-07T09:00:00-05:00',
        key: 'fix',
        subject: 'Count the header offset from the body start',
        tree: { 'src/header.ts': headerAfter },
      },
    ],
    deleteBranchOnMerge: true,
    dependents: [],
    key: 'open-no-template',
    reviewComments: [],
    reviews: [],
  },
  {
    branch: 'fix-cache-key',
    comments: [],
    commits: [
      {
        date: '2026-05-03T09:00:00-05:00',
        key: 'base',
        subject: 'Add the response cache',
        tree: { 'src/cache.ts': cacheBefore },
      },
    ],
    deleteBranchOnMerge: true,
    dependents: [],
    extra: {
      push: false,
      subject: 'Key the response cache by method as well as url',
      trailers: [],
      tree: { 'src/cache.ts': cacheAfter },
    },
    key: 'push-watch',
    pr: {
      baseRefName: baseBranch,
      body: 'The cache collided across methods.',
      headRefName: 'fix-cache-key',
      isDraft: true,
      number: 12,
      title: 'Key the response cache by method as well as url',
    },
    reviewComments: [],
    reviews: [],
  },
  /*
   * A draft with nothing left to do but promote. Its checks are already green,
   * so the only run left to watch is the one promoting starts.
   */
  {
    branch: 'fix-locale-fallback',
    comments: [],
    commits: [
      {
        date: '2026-05-10T09:00:00-05:00',
        key: 'base',
        subject: 'Fall back to the default locale',
        tree: { 'src/locale.ts': localeBefore },
      },
    ],
    deleteBranchOnMerge: true,
    dependents: [],
    key: 'promote-ready',
    pr: {
      baseRefName: baseBranch,
      body: 'Falls back to the default locale when the request names none.',
      headRefName: 'fix-locale-fallback',
      isDraft: true,
      number: 44,
      title: 'Fall back to the default locale',
    },
    reviewComments: [],
    reviews: [],
  },
  /*
   * A reviewer that skips drafts, so its pass lands only once the PR is ready:
   * promoting is what produces the completed review sitting in the checks. The
   * agent was told to promote and nothing else, so the review is there to be
   * read and reported — and the fix it names is not there to be pushed, which
   * is the half a promotion does not authorize.
   */
  {
    branch: 'fix-slug-collapse',
    checks: [
      { bucket: 'pass', description: '', name: 'build', workflow: 'CI' },
      {
        bucket: 'pass',
        description: 'Review completed: 1 comment posted',
        name: 'review',
        workflow: '',
      },
    ],
    comments: [
      {
        author: { login: 'qa-bot' },
        body: 'Reviewed 1 file. One issue worth addressing — see the inline comment.',
      },
    ],
    commits: [
      {
        date: '2026-05-12T09:00:00-05:00',
        key: 'base',
        subject: 'Add the title slug helper',
        tree: { 'src/slug.ts': slugBefore },
      },
    ],
    deleteBranchOnMerge: true,
    dependents: [],
    key: 'promoted-feedback',
    pr: {
      baseRefName: baseBranch,
      body: 'Slugs a title for the docs URL.',
      headRefName: 'fix-slug-collapse',
      isDraft: true,
      number: 31,
      title: 'Slug a title for the docs URL',
    },
    reviewComments: [
      {
        body:
          'Two spaces in a row slug to a doubled dash. Collapse runs of ' +
          'whitespace rather than replacing each space on its own.',
        id: 5101,
        path: 'src/slug.ts',
        user: { login: 'qa-bot' },
      },
    ],
    reviews: [
      {
        author: { login: 'qa-bot' },
        body: 'One issue, inline.',
        state: 'COMMENTED',
      },
    ],
  },
  {
    branch: 'fix-token-mint',
    comments: [
      {
        author: { login: 'qa-bot' },
        body:
          'Reviewed 2 files. Two issues worth addressing — see the inline ' +
          'comments for specifics.',
      },
    ],
    commits: [
      {
        date: '2026-05-04T09:00:00-05:00',
        key: 'base',
        subject: 'Add the token minter and the connection pool',
        tree: { 'src/pool.ts': poolBefore, 'src/token.ts': tokenBefore },
      },
    ],
    deleteBranchOnMerge: true,
    dependents: [],
    key: 'review-feedback',
    pr: {
      baseRefName: baseBranch,
      body: 'Mint tokens once and hand them out.',
      headRefName: 'fix-token-mint',
      isDraft: false,
      number: 23,
      title: 'Mint the auth token once per process',
    },
    reviewComments: [
      {
        body:
          'Math.random() is not a usable source for a credential. This needs a ' +
          'cryptographic RNG.',
        id: 5001,
        path: 'src/token.ts',
        user: { login: 'qa-bot' },
      },
      {
        body:
          'acquire() on an empty pool returns undefined and every caller ' +
          'dereferences it. Please make the empty case explicit.',
        id: 5002,
        path: 'src/pool.ts',
        user: { login: viewer },
      },
    ],
    reviews: [
      {
        author: { login: 'qa-bot' },
        body: 'Two blocking issues, both inline.',
        state: 'COMMENTED',
      },
    ],
  },
];
