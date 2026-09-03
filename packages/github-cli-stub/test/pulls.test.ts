/*
 * Tests for which pull request a call is about, and which one the next
 * `pr create` opens.
 *
 * Two facts make that identity — one number and one head branch — and a double
 * got both from constants until a run opened a second pull request. Neither
 * constant was wrong for a run that opens exactly one. What they cost was the
 * ability to ask how many a run opened at all, because the second create
 * overwrote the first and the answer was one however the run behaved.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import type { SeededWorld } from '@gtbuchanan/github-cli-stub/pulls';
import {
  currentHead,
  firstPrNumber,
  hasOpenPrFrom,
  impliedNumber,
  nextPrNumber,
} from '@gtbuchanan/github-cli-stub/pulls';
import type { State } from '@gtbuchanan/github-cli-stub/state';
import { emptyState } from '@gtbuchanan/github-cli-stub/state';

/**
 * A world that already has pull request #12, from `fix-cache-key`.
 */
const seeded: SeededWorld = {
  dependents: [],
  pr: {
    baseRefName: 'main',
    body: 'The cache collided across methods.',
    headRefName: 'fix-cache-key',
    isDraft: false,
    number: 12,
    title: 'Key the cache by method',
  },
};

const empty: SeededWorld = { dependents: [] };

/**
 * State in which this run opened `number` from `headRefName`.
 */
const opened = (number: number, headRefName: string): State => ({
  ...emptyState,
  opened: {
    [String(number)]: {
      baseRefName: 'main',
      body: 'The second unit.',
      headRefName,
      title: 'Report cache hit rate',
    },
  },
});

test('the first pull request of a run gets the starting number', ({ expect }) => {
  expect(nextPrNumber(emptyState, empty)).toBe(firstPrNumber);
});

test('the next number clears everything the world already knows', ({ expect }) => {
  /* Seeded, stacked and already-opened all count. Handing out a number one of
     them holds would make two pull requests indistinguishable. */
  const stacked: SeededWorld = {
    dependents: [{ headRefName: 'add-metrics', number: 300, title: 'Metrics' }],
    pr: seeded.pr,
  };

  expect(nextPrNumber(opened(150, 'other'), stacked)).toBe(301);
});

test('a run that opened one gets a different number for the next', ({ expect }) => {
  const first = nextPrNumber(emptyState, empty);

  expect(nextPrNumber(opened(first, 'fix-one'), empty)).toBe(first + 1);
});

test('a branch with a seeded pull request already has one open', ({ expect }) => {
  expect(hasOpenPrFrom(emptyState, seeded, 'fix-cache-key')).toBe(true);
});

test('a branch this run opened from already has one open', ({ expect }) => {
  expect(hasOpenPrFrom(opened(101, 'add-metrics'), empty, 'add-metrics')).toBe(true);
});

test('a branch nothing was opened from has none', ({ expect }) => {
  expect(hasOpenPrFrom(emptyState, seeded, 'untouched')).toBe(false);
});

test('merging releases the branch for another pull request', ({ expect }) => {
  /* GitHub allows one *open* pull request per head. Asking whether a record
     exists instead would refuse a legitimate create with the duplicate error,
     which is the one refusal indistinguishable from the case this catches. */
  const merged: State = { ...emptyState, merged: [12] };

  expect(hasOpenPrFrom(merged, seeded, 'fix-cache-key')).toBe(false);
});

test('an unnamed call on the seeded branch means the seeded pull request', ({ expect }) => {
  expect(impliedNumber(emptyState, seeded, 'fix-cache-key')).toBe(12);
});

test('an unnamed call on another branch means the one opened there', ({ expect }) => {
  /*
   * gh answers for the branch you are on. Letting a seeded pull request win
   * regardless of head was harmless only while a run could hold one at a time;
   * once it can open a second, unnamed `pr ready`, `pr merge` and `pr view`
   * silently address the wrong one — and every one of those writes state.
   */
  expect(impliedNumber(opened(102, 'add-cache-metrics'), seeded, 'add-cache-metrics')).toBe(102);
});

test('--head names the branch, whatever the checkout says', ({ expect }) => {
  const head = currentHead({
    argv: ['pr', 'view', '--head', 'named-branch'],
    checkoutBranch: () => 'checked-out-branch',
    fallback: 'fallback-branch',
  });

  expect(head).toBe('named-branch');
});

test('without --head the checkout decides', ({ expect }) => {
  const head = currentHead({
    argv: ['pr', 'view'],
    checkoutBranch: () => 'checked-out-branch',
    fallback: 'fallback-branch',
  });

  expect(head).toBe('checked-out-branch');
});

test('a checkout that cannot say falls back', ({ expect }) => {
  /* No checkout beneath the call, or a detached HEAD: neither names a branch,
     and answering `HEAD` would put that in a pull request URL. */
  const detached = currentHead({
    argv: ['pr', 'view'],
    checkoutBranch: () => 'HEAD',
    fallback: 'fallback-branch',
  });

  expect(detached).toBe('fallback-branch');
  expect(
    currentHead({ argv: [], checkoutBranch: () => '', fallback: 'fallback-branch' }),
  ).toBe('fallback-branch');
});
