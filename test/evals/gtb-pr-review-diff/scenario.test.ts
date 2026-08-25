/*
 * Tests for the gtb-pr-review-diff suite's canned GitHub side.
 *
 * The git side is a real repository (see seed.test.ts), so what these keep
 * honest is the join between the two: the reviews fixture names commits by plan
 * key, and those keys are resolved against the object names seeding produced. A
 * key no commit answers to would leave the fake gh serving a baseline the
 * repository has never heard of.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { resolveShas, selectLastOwnReview } from '#evals/gtb-pr-review-diff/scenario.ts';
import { commitPlan } from '#evals/gtb-pr-review-diff/seed.ts';
import { repoRoot } from '#evals/lib/paths.ts';

const reviewsTemplate = readFileSync(
  path.join(repoRoot, 'evals', 'gtb-pr-review-diff', 'fixtures', 'scenario', 'reviews.json'),
  'utf8',
);

/**
 * Every plan key mapped to a stand-in object name, so a resolution can be
 * checked without seeding a repository.
 */
const stubShas = Object.fromEntries(
  commitPlan.map((commit, index) => [commit.key, `sha-${String(index)}`]),
);

test('the last own review is the viewer\'s latest submitted one', ({ expect }) => {
  const reviews = [
    { commit_id: 'newest', submitted_at: '2026-02-20T12:00:00Z', user: { login: 'reviewer' } },
    { commit_id: 'oldest', submitted_at: '2026-01-10T12:00:00Z', user: { login: 'reviewer' } },
    { commit_id: 'theirs', submitted_at: '2026-03-05T12:00:00Z', user: { login: 'someone-else' } },
  ];

  expect(selectLastOwnReview(reviews, 'reviewer')?.commit_id).toBe('newest');
});

test('a review that was never submitted is not a baseline', ({ expect }) => {
  const reviews = [
    { commit_id: 'submitted', submitted_at: '2026-01-10T12:00:00Z', user: { login: 'reviewer' } },
    { commit_id: 'pending', user: { login: 'reviewer' } },
  ];

  expect(selectLastOwnReview(reviews, 'reviewer')?.commit_id).toBe('submitted');
});

test('a viewer who never reviewed has no baseline', ({ expect }) => {
  const reviews = [
    { commit_id: 'theirs', submitted_at: '2026-03-05T12:00:00Z', user: { login: 'someone-else' } },
  ];

  expect(selectLastOwnReview(reviews, 'reviewer')).toBeUndefined();
});

test('resolveShas substitutes a commit named by plan key', ({ expect }) => {
  expect(resolveShas('at {{ sha:baseline }}.', { baseline: 'abc123' })).toBe(
    'at abc123.',
  );
});

test('resolveShas leaves the rest of the fixture alone', ({ expect }) => {
  expect(resolveShas('{"state": "APPROVED"}', { baseline: 'abc123' })).toBe(
    '{"state": "APPROVED"}',
  );
});

test('resolveShas refuses a key no commit answers to', ({ expect }) => {
  /*
   * Substituting an empty string here would hand the fake gh a baseline that
   * resolves to nothing, and the failure would surface as a skill regression
   * several steps later instead of as the fixture error it is.
   */
  expect(() => resolveShas('{{ sha:typo }}', { baseline: 'abc123' })).toThrow(
    /typo/v,
  );
});

test('the reviews fixture only names commits the plan seeds', ({ expect }) => {
  expect(() => resolveShas(reviewsTemplate, stubShas)).not.toThrow();
});

test('the reviews fixture leaves no placeholder behind', ({ expect }) => {
  expect(resolveShas(reviewsTemplate, stubShas)).not.toMatch(/\{\{/v);
});

test('the review baseline is neither the tip nor the fork point', ({ expect }) => {
  /*
   * The tip would leave nothing to diff; the fork point would make a run that
   * fell back to the whole-PR diff indistinguishable from one that scoped to
   * the baseline.
   */
  const reviews: unknown = JSON.parse(resolveShas(reviewsTemplate, stubShas));
  const baseline = selectLastOwnReview(
    Array.isArray(reviews) ? reviews : [],
    'reviewer',
  )?.commit_id;

  expect(baseline).toBe(stubShas['baseline']);
  expect(baseline).not.toBe(stubShas[commitPlan.at(-1)?.key ?? '']);
  expect(baseline).not.toBe(stubShas[commitPlan[0]?.key ?? '']);
});
