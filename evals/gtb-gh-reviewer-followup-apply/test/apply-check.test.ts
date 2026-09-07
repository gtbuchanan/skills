/*
 * Tests for the matcher this suite judges a posted reply with.
 *
 * The skill prescribes `-F body=@-`, so the matcher has to observe the argument
 * form too — blind to it, it would pass the very run the rule exists to catch.
 * Each case is one of the three ways a reply goes wrong, which the report keeps
 * apart: nothing posted, the wrong words, or the right words sent inline.
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
  /* Right thread, right words — so the report must name the spelling rather
     than send the reader after a reply that was in fact posted. */
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
  // Nothing reached the thread, so there is no wording to have got wrong.
  expect(checkReplies([call('api graphql -f query=resolveReviewThread')], vars))
    .toStrictEqual(['missing reply to 11002']);
});

test('a reply to a different thread is not the one asked for', ({ expect }) => {
  /* A matcher keying on "some reply happened" would pass a run that answered
     someone else's conversation, publicly. */
  const problems = checkReplies(
    [call('api repos/acme/widgets/pulls/42/comments/11003/replies -F body=@-', body)],
    vars,
  );

  expect(problems).toStrictEqual(['missing reply to 11002']);
});
