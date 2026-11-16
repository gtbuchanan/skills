/*
 * Tests for how the fake GitHub answers from a world.
 *
 * Each case sends the request gh would send straight to the fake, and checks
 * what it answered and what it handed its host. What gh makes of an answer is
 * gh's, and the slow tier runs gh itself.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { answered, askedArgv, errorsOf, githubBug, graphql, restUrl } from './fixtures.ts';

/**
 * A query for pull request 7 of acme/widgets, selecting `fields`.
 */
const pullRequest = (fields: string): string => graphql(
  `{ repository(owner: "acme", name: "widgets") { pullRequest(number: 7) { ${fields} } } }`,
);

const unmodelled = pullRequest('files(first: 1) { nodes { path } }');

test('a field the world models is answered', async ({ expect }) => {
  const answer = await answered({ body: pullRequest('title') });

  expect(answer.body).toStrictEqual({
    data: { repository: { pullRequest: { title: 'Add the rate limiter' } } },
  });
});

test('a field the world models as undefined is answered as null', async ({ expect }) => {
  /* GitHub sends explicit nulls, and a world states one without breaking the
     no-null rule. */
  const answer = await answered({ body: pullRequest('milestone { title }') });

  expect(answer.body).toStrictEqual({
    // eslint-disable-next-line unicorn/no-null -- GitHub's answer carries a null
    data: { repository: { pullRequest: { milestone: null } } },
  });
});

test('a query selecting one field typed differently by union members is answered', async ({
  expect,
}) => {
  /* gh selects `name` from both User (String) and Team (String!) when it
     reads review requests. graphql-js refuses that by default, and GitHub
     answers it. */
  const answer = await answered({
    body: pullRequest(
      'reviewRequests(first: 10) { nodes { requestedReviewer { ' +
      '... on User { name } ... on Team { name } } } }',
    ),
  });

  expect(answer.body).toStrictEqual({
    data: {
      repository: {
        pullRequest: {
          reviewRequests: {
            nodes: [
              { requestedReviewer: { name: 'Dana Reyes' } },
              { requestedReviewer: { name: 'Platform' } },
            ],
          },
        },
      },
    },
  });
});

test('the token chooses which world answers', async ({ expect }) => {
  const answer = await answered({ body: pullRequest('title'), world: 'tokenizer' });

  expect(answer.body).toStrictEqual({
    data: { repository: { pullRequest: { title: 'Split the tokenizer' } } },
  });
});

test('a token naming no world is refused as bad credentials', async ({ expect }) => {
  const answer = await answered({ body: pullRequest('title'), world: 'no-such-world' });

  expect({ body: answer.body, status: answer.status })
    .toStrictEqual({ body: { documentation_url: 'https://docs.github.com/rest', message: 'Bad credentials' }, status: 401 });
});

test('a token naming no world is recorded as refused', async ({ expect }) => {
  // A misspelt world key otherwise reads as an auth failure and nothing else.
  const answer = await answered({ body: pullRequest('title'), world: 'no-such-world' });

  expect(answer.refusals).toStrictEqual(['no world named no-such-world']);
});

test('a field the world does not model fails as GitHub fails', async ({ expect }) => {
  /* Answering null would read to an agent as "this pull request changes no
     files", which is an answer; and nothing the agent reads may say it is
     talking to a double. */
  const answer = await answered({ body: unmodelled });

  expect(errorsOf(answer)).toStrictEqual([
    { message: githubBug, path: ['repository', 'pullRequest', 'files'] },
  ]);
});

test('a field the world does not model is recorded as refused', async ({ expect }) => {
  const answer = await answered({ body: unmodelled });

  expect(answer.refusals).toStrictEqual(['no model for GraphQL field PullRequest.files']);
});

test('a refusal names the call that reached it', async ({ expect }) => {
  // The host files a refusal beside the call that caused it, by the context it attached.
  const answer = await answered({ body: unmodelled });

  expect(answer.refused).toStrictEqual([{
    caller: { argv: askedArgv, context: 'run-1', world: 'rate-limiter' },
    reason: 'no model for GraphQL field PullRequest.files',
  }]);
});

test('a refusal from a call the host attached no context to names a caller without one', async ({
  expect,
}) => {
  const answer = await answered({ body: unmodelled, withContext: false });

  expect(answer.refused).toStrictEqual([{
    caller: { argv: askedArgv, world: 'rate-limiter' },
    reason: 'no model for GraphQL field PullRequest.files',
  }]);
});

test('a REST route the world models is answered', async ({ expect }) => {
  const answer = await answered({
    body: '',
    method: 'PUT',
    url: restUrl('/repos/acme/widgets/pulls/7/merge-async'),
  });

  expect({ body: answer.body, status: answer.status })
    .toStrictEqual({ body: { status: 'pending' }, status: 202 });
});

test('a REST route the world does not model fails as GitHub fails', async ({ expect }) => {
  /* A server error rather than 404: gh reads a 404 as an answer in places,
     and deleting a branch that 404s counts as already deleted. */
  const answer = await answered({ url: restUrl('/user') });

  expect({ body: answer.body, status: answer.status })
    .toStrictEqual({ body: { message: 'Server Error' }, status: 500 });
});

test('a REST route the world does not model is recorded as refused', async ({ expect }) => {
  const answer = await answered({ url: restUrl('/user') });

  expect(answer.refusals).toStrictEqual(['no model for REST route GET /user']);
});

test('a world that throws answering a route fails as GitHub fails', async ({ expect }) => {
  const answer = await answered({ url: restUrl('/repos/acme/widgets/fault') });

  expect({ body: answer.body, status: answer.status })
    .toStrictEqual({ body: { message: 'Server Error' }, status: 500 });
});

test('a world that throws answering a route is recorded as refused', async ({ expect }) => {
  const answer = await answered({ url: restUrl('/repos/acme/widgets/fault') });

  expect(answer.refusals).toStrictEqual([
    'fault answering GET /repos/acme/widgets/fault: Error: the world broke',
  ]);
});

test('a world answering with a body JSON cannot carry fails as GitHub fails', async ({
  expect,
}) => {
  const answer = await answered({ url: restUrl('/repos/acme/widgets/unserializable') });

  expect({ body: answer.body, status: answer.status })
    .toStrictEqual({ body: { message: 'Server Error' }, status: 500 });
});

test('a world answering with a body JSON cannot carry is recorded as refused', async ({
  expect,
}) => {
  const answer = await answered({ url: restUrl('/repos/acme/widgets/unserializable') });

  expect(answer.refusals).toStrictEqual([
    'fault answering GET /repos/acme/widgets/unserializable: ' +
    'TypeError: Do not know how to serialize a BigInt',
  ]);
});
