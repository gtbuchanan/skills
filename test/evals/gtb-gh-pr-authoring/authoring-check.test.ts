/*
 * Tests for the matchers this suite's checker judges a run with.
 *
 * These decide whether a scenario passed, so the expensive error is the lenient
 * one: a matcher that accepts a run it should have failed turns the whole suite
 * green for an agent that broke the rule, and nothing downstream notices. Every
 * case below therefore has a wrong-but-plausible run it must reject, not merely
 * a right one it must accept.
 *
 * Vars are built through the schema rather than as object literals, so a case
 * exercises the same fully-defaulted shape the assertion runs on.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import * as v from 'valibot';
import { test } from 'vitest';
import {
  VarsSchema,
  checkForbiddenOrder,
  checkForbiddenStdin,
  checkOrder,
  checkStdin,
} from '#evals/gtb-gh-pr-authoring/authoring-check.ts';

interface Call {
  readonly command: string;
  readonly stdin: string;
}

const call = (command: string, stdin = ''): Call => ({ command, stdin });

const varsOf = (declared: Record<string, unknown>): v.InferOutput<typeof VarsSchema> =>
  v.parse(VarsSchema, { scenario: 'merge-stacked', ...declared });

const mergeBody = [
  { command: ['pr', 'merge'], includes: ['Co-authored-by:', 'rate limiter'] },
];

test('one body carrying every required string satisfies the rule', ({ expect }) => {
  expect(
    checkStdin(
      [call('pr merge 7 --squash', 'Add the rate limiter\n\nCo-authored-by: Dana\n')],
      varsOf({ requireStdin: mergeBody }),
    ),
  ).toStrictEqual([]);
});

test('two bodies each carrying half of it do not', ({ expect }) => {
  /*
   * The lenient reading — every needle found in some matching call — passes a
   * run whose squash message kept the trailers and whose summary went out on a
   * different call entirely. No single commit message ever had both, which is
   * the only thing the rule is about.
   */
  const problems = checkStdin(
    [
      call('pr merge 7 --squash', 'Co-authored-by: Dana\n'),
      call('pr merge 9 --squash', 'Add the rate limiter\n'),
    ],
    varsOf({ requireStdin: mergeBody }),
  );

  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain('no single body');
});

test('a string no body carries at all is named in the failure', ({ expect }) => {
  /*
   * The diagnostic has to distinguish "spread across two calls" from "never
   * written anywhere", because they are different mistakes by the agent.
   */
  const problems = checkStdin(
    [call('pr merge 7 --squash', 'Add the rate limiter\n')],
    varsOf({ requireStdin: mergeBody }),
  );

  expect(problems[0]).toContain('Co-authored-by:');
});

test('a call that was never made fails before its body is judged', ({ expect }) => {
  expect(
    checkStdin([call('pr view 7')], varsOf({ requireStdin: mergeBody })),
  ).toStrictEqual(['never called: pr + merge']);
});

test('naming no strings asks only that some body arrived', ({ expect }) => {
  /*
   * The rule for every prose payload the skill pipes: that it went in on
   * standard input at all. Pinning wording would fail a correct run for
   * phrasing it differently.
   */
  const vars = varsOf({ requireStdin: [{ command: ['pr', 'create'], includes: [] }] });

  expect(checkStdin([call('pr create --body-file -', 'anything')], vars)).toStrictEqual([]);
  expect(checkStdin([call('pr create --body-file -')], vars)).toStrictEqual([
    'pr + create was handed no body on stdin',
  ]);
});

test('required order accepts before-then-after and rejects the reverse', ({ expect }) => {
  const vars = varsOf({
    requireOrder: [{ after: ['api', 'replies'], before: ['git', 'push'] }],
  });

  expect(checkOrder([call('git push'), call('gh api replies')], vars)).toStrictEqual([]);
  expect(checkOrder([call('gh api replies'), call('git push')], vars)).toHaveLength(1);
});

test('required order fails when either side never happened', ({ expect }) => {
  /*
   * "Push the fixes, then reply" is not satisfied by never replying. An
   * order check that only compares indices when both exist would pass a run
   * that did half the work.
   */
  const vars = varsOf({
    requireOrder: [{ after: ['api', 'replies'], before: ['git', 'push'] }],
  });

  expect(checkOrder([call('git push')], vars)).toStrictEqual(['never called: api + replies']);
  expect(checkOrder([call('gh api replies')], vars)).toStrictEqual(['never called: git + push']);
});

test('a forbidden order is clean when the unsafe first move never happened', ({ expect }) => {
  /*
   * The rule is about deleting a branch while a dependent still points at it.
   * A run that never deleted has not broken it, however the rest went.
   */
  expect(
    checkForbiddenOrder(
      [call('pr edit 9 --base main')],
      varsOf({ forbidOrder: [{ after: ['pr', 'edit'], before: ['push', '--delete'] }] }),
    ),
  ).toStrictEqual([]);
});

test('a forbidden order catches the unsafe move with no repair after it', ({ expect }) => {
  /*
   * Deleting and then never retargeting is the worst case, not an incomplete
   * one — the dependent PR is already closed. It must fail as loudly as
   * deleting and retargeting in the wrong order.
   */
  const vars = varsOf({
    forbidOrder: [{ after: ['pr', 'edit'], before: ['push', '--delete'] }],
  });

  expect(checkForbiddenOrder([call('git push origin --delete x')], vars)).toHaveLength(1);
  expect(
    checkForbiddenOrder([call('git push origin --delete x'), call('pr edit 9')], vars),
  ).toHaveLength(1);
});

const noHeadings = [{ command: ['pr', 'create'], includes: ['## ', 'N/A'] }];

test('a description with no headings satisfies the absence rule', ({ expect }) => {
  expect(
    checkForbiddenStdin(
      [
        call(
          'pr create --draft --body-file -',
          'Compute it from the attempt count.\n\nResolves: #482\n',
        ),
      ],
      varsOf({ forbidStdin: noHeadings }),
    ),
  ).toStrictEqual([]);
});

test('a heading anywhere in the body fails, not just at the start', ({ expect }) => {
  /*
   * The lenient reading — judging only how the body opens — passes a run that
   * led with prose and then appended the section set anyway, which is the shape
   * the default exists to prevent.
   */
  expect(
    checkForbiddenStdin(
      [call('pr create --body-file -', 'Fix the offset.\n\n## Testing\n\nRan the suite.\n')],
      varsOf({ forbidStdin: noHeadings }),
    ),
  ).toHaveLength(1);
});

test('one clean body does not excuse another that carries a heading', ({ expect }) => {
  /*
   * Every matching call is judged, not some of them. Passing on any clean hit
   * would let a second body that reintroduced the sections go unnoticed because
   * the first one was fine.
   */
  expect(
    checkForbiddenStdin(
      [
        call('pr create --body-file -', 'Fix the offset.\n\nResolves: #91\n'),
        call('pr create --body-file -', '## Summary\n\nFix the offset.\n'),
      ],
      varsOf({ forbidStdin: noHeadings }),
    ),
  ).toHaveLength(1);
});

test('a section kept but filled with a placeholder fails too', ({ expect }) => {
  expect(
    checkForbiddenStdin(
      [call('pr create --body-file -', 'Fix the offset.\n\nTesting: N/A\n')],
      varsOf({ forbidStdin: noHeadings }),
    ),
  ).toHaveLength(1);
});
