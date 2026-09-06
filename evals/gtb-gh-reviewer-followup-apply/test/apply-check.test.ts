/*
 * Tests for the matcher this suite judges a posted reply with.
 *
 * A reply body is prose, and gh takes prose two ways: as an inline field
 * argument, where a shell parses it on the way past, and on standard input,
 * where nothing does. The skill prescribes the second, so the suite has to
 * observe both — a matcher blind to the argument form would pass the run that
 * used it, which is the one the rule exists to catch.
 *
 * That leaves three ways a reply can be wrong, and they have to stay distinct
 * in the report or none of them can be acted on: nothing posted at all, the
 * right thread with the wrong words, and the right words sent the fragile way.
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

test('a body passed as an inline field argument is refused', ({ expect }) => {
  /*
   * The words are right and the thread is right, so this is not a reply that
   * went missing — it is the fragile spelling, where a shell gets between the
   * approved body and GitHub. The report has to say which, or the reader goes
   * looking for a reply that was in fact posted.
   */
  const problems = checkReplies([call(`${endpoint} -f body=${body}`)], vars);

  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain('standard input');
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
