/*
 * Tests for the requests the fake answers that a world has no say in: the
 * host they are for, and the shape of the request itself.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { answered, errorsOf, graphql } from './fixtures.ts';

/* eslint-disable-next-line unicorn/prefer-https --
   The request under test is plain HTTP to a host other than the fake's. */
const foreignUrl = 'http://example.com/';

const viewer = { data: { viewer: { login: 'taylor' } } };

test('a plain-HTTP request for another host is forbidden', async ({ expect }) => {
  const answer = await answered({ url: foreignUrl });

  expect(answer.status).toBe(403);
});

test('a plain-HTTP request for another host is recorded as refused', async ({ expect }) => {
  const answer = await answered({ url: foreignUrl });

  expect(answer.refusals).toStrictEqual([
    'request to a host other than api.github.localhost: example.com',
  ]);
});

test('a request with no token is refused as bad credentials', async ({ expect }) => {
  // gh always sends one, but anything else that reaches the port may not.
  const answer = await answered({ body: graphql('{ viewer { login } }'), signed: false });

  expect(answer.status).toBe(401);
});

test('a refusal of a request with no token names no caller', async ({ expect }) => {
  // The host still hears of it, and decides what a refusal from nobody is worth.
  const answer = await answered({ signed: false, url: foreignUrl });

  expect(answer.refused).toStrictEqual([{
    caller: undefined,
    reason: 'request to a host other than api.github.localhost: example.com',
  }]);
});

const unparsedQuery = graphql('{ viewer {');

test('a query that does not parse is answered as a syntax error', async ({ expect }) => {
  /* GitHub answers a malformed query with its parse error, so the caller
     fixes the query rather than waiting out an outage. */
  const answer = await answered({ body: unparsedQuery });

  expect(errorsOf(answer).map(error => error.message)).toStrictEqual([
    'Syntax Error: Expected Name, found <EOF>.',
  ]);
});

test('a query that does not parse is not recorded as refused', async ({ expect }) => {
  // The mistake is the caller's, not a gap in the world.
  const answer = await answered({ body: unparsedQuery });

  expect(answer.refusals).toStrictEqual([]);
});

const invalidQuery = graphql('{ viewer { loginn } }');

test('a query that does not validate is answered with its errors', async ({ expect }) => {
  // What an agent gets for a misspelt field in a query it wrote by hand.
  const answer = await answered({ body: invalidQuery });

  expect(errorsOf(answer).map(error => error.message)).toStrictEqual([
    'Cannot query field "loginn" on type "User". Did you mean "login"?',
  ]);
});

test('a query that does not validate is not recorded as refused', async ({ expect }) => {
  // The mistake is the caller's, not a gap in the world.
  const answer = await answered({ body: invalidQuery });

  expect(answer.refusals).toStrictEqual([]);
});

test('a query sent with null variables is answered', async ({ expect }) => {
  // go-gh sends `"variables": null` for a query it was given no variables for.
  // eslint-disable-next-line unicorn/no-null -- the null is the request under test
  const answer = await answered({ body: graphql('{ viewer { login } }', { variables: null }) });

  expect(answer.body).toStrictEqual(viewer);
});

test('the operation a request names is the one run', async ({ expect }) => {
  const answer = await answered({
    body: graphql('query Ping { __typename } query Me { viewer { login } }', {
      operationName: 'Me',
    }),
  });

  expect(answer.body).toStrictEqual(viewer);
});
