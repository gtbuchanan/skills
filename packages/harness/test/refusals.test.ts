/*
 * Tests for how a checker reports the calls its suite's doubles refused.
 *
 * A refusal says the run met something nobody modelled, so whatever it did
 * next is no evidence about the skill. That is a reading of the result, not a
 * verdict on it: the checker's own rules still decide pass or fail, and the
 * refusals ride alongside for whoever weighs the run.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { reportRefusals } from '@gtbuchanan/agent-skills-harness/refusals';

const passed = { pass: true, reason: 'ok', score: 1 };

const failed = {
  pass: false,
  reason: 'never called: pr create',
  score: 0,
};

const diffRefused = { command: 'pr diff', reason: 'no canned response' };

const viewRefused = { command: 'pr view 42', reason: 'field reviewDecision' };

test('a run the doubles answered throughout reports no refusals', ({ expect }) => {
  expect(reportRefusals(passed, [])).toStrictEqual({
    namedScores: { refusals: 0 },
    pass: true,
    reason: 'ok',
    score: 1,
  });
});

test('a refusal is counted and named without changing the verdict', ({ expect }) => {
  expect(reportRefusals(passed, [diffRefused, viewRefused])).toStrictEqual({
    namedScores: { refusals: 2 },
    pass: true,
    reason:
      'ok; the doubles refused 2 call(s): pr diff (no canned response), ' +
      'pr view 42 (field reviewDecision)',
    score: 1,
  });
});

test('a failing run keeps its problems, with the refusals after them', ({ expect }) => {
  /*
   * The refusal is often why the rule failed — the run never got the answer
   * it needed to go on — so the two belong in one reason, problems first.
   */
  expect(reportRefusals(failed, [diffRefused])).toStrictEqual({
    namedScores: { refusals: 1 },
    pass: false,
    reason:
      'never called: pr create; the doubles refused 1 call(s): pr diff ' +
      '(no canned response)',
    score: 0,
  });
});
