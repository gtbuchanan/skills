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
import { checkRecord, checkState, checksAnswer } from '@gtbuchanan/github-cli-stub/checks';

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

test('no two buckets report the same state', ({ expect }) => {
  /*
   * Exhaustiveness is the compiler's job — the table cannot omit a bucket. What
   * it cannot catch is two buckets given the same state by a slipped copy,
   * which would make a cancelled check indistinguishable from a skipped one.
   */
  const buckets: CheckEntry['bucket'][] = [
    'cancel',
    'fail',
    'pass',
    'pending',
    'skipping',
  ];
  const states = buckets.map(bucket => checkState(bucket));

  expect(new Set(states).size).toBe(buckets.length);
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

const answerFor = (
  checks: readonly CheckEntry[],
  argv: readonly string[] = ['pr', 'checks'],
): ReturnType<typeof checksAnswer> => checksAnswer(checks, { argv, branch: 'feature', repoSlug });

test('an empty check list fails as gh fails it, naming the branch', ({ expect }) => {
  /*
   * gh treats "no checks" as an error rather than a pass. `[].every()` is true,
   * so a double that tested for all-passing first would claim success for the
   * one state the skill has a rule about not reading as red.
   */
  expect(answerFor([])).toStrictEqual({
    code: 1,
    stderr: "no checks reported on the 'feature' branch\n",
    stdout: '',
  });
});

test('all checks passing prints rows rather than a summary', ({ expect }) => {
  /*
   * gh prints "All checks were successful" only to a terminal. An agent's shell
   * is not one, so it gets the rows and reads the verdict from them.
   */
  const passing: CheckEntry = { ...entry('pass'), description: 'built' };

  expect(answerFor([passing])).toStrictEqual({
    code: 0,
    stdout: `build\tpass\t0\thttps://github.com/${repoSlug}/runs/1\tbuilt\n`,
  });
});

test('a check still running exits with the status gh documents for it', ({ expect }) => {
  expect(answerFor([entry('pending')]).code).toBe(8);
});

test('a failing check exits 1, ahead of one still running', ({ expect }) => {
  /* gh tests for failures before pending checks, so a list with both reports
     the failure. */
  expect(answerFor([entry('pending'), entry('fail')]).code).toBe(1);
});

test('a cancelled check prints as failed without failing the call', ({ expect }) => {
  /* gh folds `cancel` into `fail` in the status column, but counts it apart
     from failures, so it does not set the exit status. */
  const answer = answerFor([entry('cancel')]);

  expect(answer.code).toBe(0);
  expect(answer.stdout?.split('\t', 2)[1]).toBe('fail');
});

test('--json narrows each check and exits 0 even while checks are pending', ({ expect }) => {
  /* gh writes the export and returns before it looks at the counts, so the
     exit statuses above belong to the table alone. */
  const answer = answerFor([entry('pending')], ['pr', 'checks', '--json', 'name,state']);

  expect(answer).toStrictEqual({
    code: 0,
    stdout: `${JSON.stringify([{ name: 'build', state: 'PENDING' }])}\n`,
  });
});
