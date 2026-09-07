/*
 * Tests for the matcher this suite judges a posted reply with.
 *
 * A reply body is prose, and gh takes prose two ways: as an inline field
 * argument, where it lands in argv, and on standard input, where it lands
 * nowhere argv can see. A matcher reading only the command line therefore
 * reports the second form as a reply that was never posted — a failure the
 * agent did not earn, on the run that chose the sturdier spelling.
 *
 * So both forms are checked here, and so is the case they must stay distinct
 * from: a reply that reached the right thread carrying the wrong words is a
 * different mistake from one that was never sent, and the two have to be told
 * apart in the report or neither can be acted on.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import * as v from 'valibot';
import { test } from 'vitest';
import { VarsSchema, checkReplies } from '#src/apply-check.ts';

interface Call {
  readonly command: string;
  readonly stdin: string;
}

const call = (command: string, stdin = ''): Call => ({ command, stdin });

const varsOf = (declared: Record<string, unknown>): v.InferOutput<typeof VarsSchema> =>
  v.parse(VarsSchema, declared);

/**
 * The partial-fix reply from the `mixed` fixture, whose body names the call
 * site the fix missed.
 */
const vars = varsOf({ expectReply: [{ bodyIncludes: 'notify_batch', id: 11_002 }] });

const endpoint = 'api repos/acme/widgets/pulls/42/comments/11002/replies';

const body = 'Thanks — the single fetch is covered, but notify_batch still derefs a null user.';

test('a body piped in on standard input is seen', ({ expect }) => {
  expect(checkReplies([call(`${endpoint} -F body=@-`, body)], vars)).toStrictEqual([]);
});

test('a body passed as an inline field argument is seen too', ({ expect }) => {
  /*
   * The suite has no business failing a run over which spelling it picked —
   * that is what the skill is for. Whether the argv form is the one to
   * prescribe is a separate question from whether the checker can see it.
   */
  expect(
    checkReplies([call(`${endpoint} -f body=${body}`)], vars),
  ).toStrictEqual([]);
});

test('a reply carrying the wrong words is not', ({ expect }) => {
  const problems = checkReplies(
    [call(`${endpoint} -F body=@-`, 'Thanks — fixed, closing this out.')],
    vars,
  );

  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain('notify_batch');
});

test('a reply that was never posted fails as its own thing', ({ expect }) => {
  /*
   * Distinct from the wording failure above: nothing reached the thread, so
   * there is no body to have got wrong, and telling the human otherwise sends
   * them looking at wording that does not exist.
   */
  expect(checkReplies([call('api graphql -f query=resolveReviewThread')], vars))
    .toStrictEqual(['missing reply to 11002']);
});

test('a reply to a different thread is not the one asked for', ({ expect }) => {
  /*
   * The endpoint carries the root comment id, so a matcher that looked only for
   * "some reply happened" would pass a run that answered the wrong thread —
   * publicly, on someone else's conversation.
   */
  const problems = checkReplies(
    [call('api repos/acme/widgets/pulls/42/comments/11003/replies -F body=@-', body)],
    vars,
  );

  expect(problems).toStrictEqual(['missing reply to 11002']);
});
