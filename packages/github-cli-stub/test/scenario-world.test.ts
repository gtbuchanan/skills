/*
 * Tests for which checks a scenario has.
 *
 * Most scenarios say nothing about checks and want one that passes. The two
 * that do say something are the ones the rules turn on — a run still in
 * progress, and a list a skill has to tell a code check apart from a
 * reviewer's — so a default that quietly won over either would deny those
 * scenarios the only state they exist to state.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import type { Scenario } from '@gtbuchanan/github-cli-stub/scenario-world';
import { checksFor } from '@gtbuchanan/github-cli-stub/scenario-world';

const base: Scenario = {
  branch: 'fix-cache-key',
  comments: [],
  commits: [],
  deleteBranchOnMerge: true,
  dependents: [],
  key: 'push-watch',
  reviewComments: [],
  reviews: [],
};

test('a scenario with nothing to say about checks gets one passing CI check', ({ expect }) => {
  expect(checksFor(base)).toStrictEqual([
    { bucket: 'pass', description: '', name: 'build', workflow: 'CI' },
  ]);
});

test('a scenario whose task says the checks are running reports them pending', ({ expect }) => {
  /*
   * Without this the double answers "all checks were successful" for a
   * scenario whose prompt says they are still going, and the agent acts on the
   * world rather than on the task.
   */
  expect(checksFor({ ...base, checksPending: true })[0]?.bucket).toBe('pending');
});

test('a stated check list wins over the default', ({ expect }) => {
  /*
   * The scenarios about telling a code check from an automated reviewer's
   * state their whole list. A default merged into it would add a passing
   * `build` nobody described.
   */
  const stated = [
    { bucket: 'pass', description: '', name: 'build', workflow: 'CI' },
    { bucket: 'pending', description: 'Review queued', name: 'qa-bot', workflow: '' },
  ] as const;

  expect(checksFor({ ...base, checks: stated })).toBe(stated);
});
