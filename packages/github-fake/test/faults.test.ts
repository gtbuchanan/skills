/*
 * Tests for a world that gets its GraphQL answer wrong, driven through the
 * real gh.
 *
 * A world's mistake is the double's, not the caller's, so it reaches gh as
 * the error GitHub sends when it fails and reaches the host as a fault. An
 * error the world means to send, as GitHub would, goes through as written.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 *
 * @module-tag slow
 */
import { test } from 'vitest';
import { ghAgainst } from './fixtures.ts';

const githubBug =
  'GraphQL: Something went wrong while executing your query. This may be the result of a ' +
  'timeout, or it could be a GitHub bug.';

const viewerLogin = ['api', 'graphql', '-f', 'query={ viewer { login } }'];
const reviewRequests = ['pr', 'view', '7', '--json', 'reviewRequests'];

test('a world that throws answering a field fails as GitHub fails', async ({ expect }) => {
  const result = await ghAgainst({ args: viewerLogin, world: 'viewer-throws' });

  expect(result.stderr).toBe(`gh: ${githubBug.replace('GraphQL: ', '')}\n`);
});

test('a world that throws answering a field is recorded as a fault', async ({ expect }) => {
  const result = await ghAgainst({ args: viewerLogin, world: 'viewer-throws' });

  expect(result.refusals).toStrictEqual([
    'fault answering GraphQL viewer: the world broke',
  ]);
});

test('an error a world throws as GitHub would is answered as written', async ({ expect }) => {
  const result = await ghAgainst({ args: viewerLogin, world: 'no-such-user' });

  expect(result.stderr).toBe('gh: Could not resolve to a User with the login of taylor.\n');
});

test('an error a world throws as GitHub would carries its type', async ({ expect }) => {
  /* gh branches on the type: an issue lookup that comes back NOT_FOUND is
     retried as a pull request. gh api prints the body it was answered with. */
  const result = await ghAgainst({ args: viewerLogin, world: 'no-such-user' });

  expect(result.stdout).toContain('"type":"NOT_FOUND"');
});

test('an error a world throws as GitHub would is not recorded', async ({ expect }) => {
  const result = await ghAgainst({ args: viewerLogin, world: 'no-such-user' });

  expect(result.refusals).toStrictEqual([]);
});

test('a non-null field a world answers with null fails as GitHub fails', async ({ expect }) => {
  const result = await ghAgainst({ args: viewerLogin, world: 'login-missing' });

  expect(result.stderr).toBe(`gh: ${githubBug.replace('GraphQL: ', '')}\n`);
});

test('a non-null field a world answers with null is recorded as a fault', async ({ expect }) => {
  const result = await ghAgainst({ args: viewerLogin, world: 'login-missing' });

  expect(result.refusals).toStrictEqual([
    'fault answering GraphQL viewer.login: Cannot return null for non-nullable field User.login.',
  ]);
});

test('an object a world leaves untyped fails as GitHub fails', async ({ expect }) => {
  const result = await ghAgainst({ args: reviewRequests, world: 'reviewer-untyped' });

  expect(result.stderr).toBe(
    `${githubBug} (repository.pullRequest.reviewRequests.nodes.0.requestedReviewer)\n`,
  );
});

test('an object a world leaves untyped is recorded as a fault', async ({ expect }) => {
  const result = await ghAgainst({ args: reviewRequests, world: 'reviewer-untyped' });

  expect(result.refusals).toHaveLength(1);
});
