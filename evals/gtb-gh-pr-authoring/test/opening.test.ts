/*
 * Tests for the pull request identity the gh double answers with.
 *
 * Imported rather than driven as a subprocess, unlike gh-stub.test.ts. These
 * are pure functions, and one of them cannot be reached through the stub at
 * all: `currentHead` falls back to the scenario's branch when no checkout sits
 * beneath it, which is exactly what those temp-dir worlds seed — so a case
 * about standing on a *different* branch has no way to arrange itself there.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { emptyState } from '@gtbuchanan/github-cli-stub/state';
import { test } from 'vitest';
import { impliedNumber } from '#src/opening.ts';
import { scenarioByKey } from '#src/world.ts';

/**
 * A scenario that seeds a pull request: #12, from `fix-cache-key`.
 */
const seeded = scenarioByKey('push-watch');

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
  const opened = {
    ...emptyState,
    opened: {
      102: {
        baseRefName: 'main',
        body: 'The second unit.',
        headRefName: 'add-cache-metrics',
        title: 'Report cache hit rate',
      },
    },
  };

  expect(impliedNumber(opened, seeded, 'add-cache-metrics')).toBe(102);
});
