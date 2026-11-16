/*
 * Tests for a world that gets its GraphQL answer wrong.
 *
 * A world's mistake is the double's, not the caller's, so it reaches gh as
 * the error GitHub sends when it fails and reaches the host as a fault. An
 * error the world means to send, as GitHub would, goes through as written.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { answered, errorsOf, githubBug, graphql } from './fixtures.ts';

const viewerLogin = graphql('{ viewer { login } }');
const reviewRequests = graphql(
  '{ repository(owner: "acme", name: "widgets") { pullRequest(number: 7) { ' +
  'reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } } } } } } }',
);

test('a world that throws answering a field fails as GitHub fails', async ({ expect }) => {
  const answer = await answered({ body: viewerLogin, world: 'viewer-throws' });

  expect(errorsOf(answer)).toStrictEqual([{ message: githubBug, path: ['viewer'] }]);
});

test('a world that throws answering a field is recorded as a fault', async ({ expect }) => {
  const answer = await answered({ body: viewerLogin, world: 'viewer-throws' });

  expect(answer.refusals).toStrictEqual([
    'fault answering GraphQL viewer: the world broke',
  ]);
});

test('an error a world throws as GitHub would is answered as written', async ({ expect }) => {
  /* gh branches on the type: an issue lookup that comes back NOT_FOUND is
     retried as a pull request. */
  const answer = await answered({ body: viewerLogin, world: 'no-such-user' });

  expect(errorsOf(answer)).toStrictEqual([{
    message: 'Could not resolve to a User with the login of taylor.',
    path: ['viewer'],
    type: 'NOT_FOUND',
  }]);
});

test('an error a world throws as GitHub would is not recorded', async ({ expect }) => {
  const answer = await answered({ body: viewerLogin, world: 'no-such-user' });

  expect(answer.refusals).toStrictEqual([]);
});

test('a non-null field a world answers with null fails as GitHub fails', async ({ expect }) => {
  const answer = await answered({ body: viewerLogin, world: 'login-missing' });

  expect(errorsOf(answer)).toStrictEqual([{ message: githubBug, path: ['viewer', 'login'] }]);
});

test('a non-null field a world answers with null is recorded as a fault', async ({ expect }) => {
  const answer = await answered({ body: viewerLogin, world: 'login-missing' });

  expect(answer.refusals).toStrictEqual([
    'fault answering GraphQL viewer.login: Cannot return null for non-nullable field User.login.',
  ]);
});

test('an object a world leaves untyped fails as GitHub fails', async ({ expect }) => {
  const answer = await answered({ body: reviewRequests, world: 'reviewer-untyped' });

  expect(errorsOf(answer)).toStrictEqual([{
    message: githubBug,
    path: ['repository', 'pullRequest', 'reviewRequests', 'nodes', 0, 'requestedReviewer'],
  }]);
});

test('an object a world leaves untyped is recorded as a fault', async ({ expect }) => {
  const answer = await answered({ body: reviewRequests, world: 'reviewer-untyped' });

  expect(answer.refusals).toHaveLength(1);
});
