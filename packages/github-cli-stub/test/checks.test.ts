/*
 * Tests for what `gh pr checks` reports.
 *
 * The values come from a live pull request rather than from invention. The one
 * that matters is the agreement: gh states `state` beside `bucket`, an agent
 * may ask for either, and `pending` in one with `SUCCESS` in the other is a
 * world no repository produces — so a double that lets them disagree hands the
 * agent a contradiction and then measures what it does with it.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import type { CheckEntry } from '@gtbuchanan/github-cli-stub/checks';
import { checkRecord, checkState } from '@gtbuchanan/github-cli-stub/checks';

const repoSlug = 'acme/widgets';

const entry = (bucket: CheckEntry['bucket'], workflow = 'CI'): CheckEntry => ({
  bucket,
  description: '',
  name: 'build',
  workflow,
});

test('a passing check reports the state gh reports', ({ expect }) => {
  expect(checkState('pass')).toBe('SUCCESS');
});

test('a failing check reports the state gh reports', ({ expect }) => {
  expect(checkState('fail')).toBe('FAILURE');
});

test('an unfinished check reports pending rather than a verdict', ({ expect }) => {
  expect(checkState('pending')).toBe('PENDING');
});

test('a skipped check is distinguishable from a cancelled one', ({ expect }) => {
  /* Both are "did not run", and an agent that treats either as red or green
     has been told something the repository did not say. */
  expect(checkState('skipping')).toBe('SKIPPED');
  expect(checkState('cancel')).toBe('CANCELLED');
});

test('a record states a state that agrees with its bucket', ({ expect }) => {
  const record = checkRecord(entry('pending'), { repoSlug });

  expect(record).toMatchObject({ bucket: 'pending', state: 'PENDING' });
});

test('a record links into the repository it belongs to', ({ expect }) => {
  const record = checkRecord(entry('pass'), { repoSlug });

  expect(record['link']).toContain(repoSlug);
});

test('a reviewer entry states an empty workflow rather than dropping it', ({ expect }) => {
  /*
   * `workflow` is how an agent tells a check that ran in CI from one an
   * automated reviewer posted. Absent and blank are different answers, and gh
   * sends the second.
   */
  const record = checkRecord(entry('pass', ''), { repoSlug });

  expect(Object.keys(record)).toContain('workflow');
  expect(record['workflow']).toBe('');
});
