/*
 * Tests for the requests the fake answers that a world has no say in: the
 * host they are for, and the shape of the request itself.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 *
 * @module-tag slow
 */
import { test } from 'vitest';
import { ghAgainst, proxied } from './fixtures.ts';

/* eslint-disable-next-line unicorn/prefer-https --
   The request under test is plain HTTP to a host other than the fake's. */
const foreignUrl = 'http://example.com/';

/* eslint-disable-next-line unicorn/prefer-https --
   gh speaks plain HTTP to github.localhost, and this stands in for gh. */
const graphqlUrl = 'http://api.github.localhost/graphql';

const viewer = '{"data":{"viewer":{"login":"taylor"}}}';

test('github.com cannot be reached', async ({ expect }) => {
  // The proxy is the only way out, and the fake refuses to tunnel anywhere.
  const result = await ghAgainst({
    args: ['api', '--hostname', 'github.com', 'user'],
    world: 'rate-limiter',
  });

  expect(result.stderr).toContain('Forbidden');
});

test('a plain-HTTP request for another host is forbidden', async ({ expect }) => {
  const result = await proxied({ url: foreignUrl });

  expect(result.status).toBe(403);
});

test('a plain-HTTP request for another host is recorded as refused', async ({ expect }) => {
  const result = await proxied({ url: foreignUrl });

  expect(result.refusals).toStrictEqual([
    'request to a host other than api.github.localhost: example.com',
  ]);
});

test('a request with no token is refused as bad credentials', async ({ expect }) => {
  // gh always sends one, but anything else that reaches the port may not.
  const result = await proxied({ signed: false, url: graphqlUrl });

  expect(result.status).toBe(401);
});

const unparsedQuery = ['api', 'graphql', '-f', 'query={ viewer {'];

test('a query that does not parse is answered as a syntax error', async ({ expect }) => {
  /* GitHub answers a malformed query with its parse error, so the caller
     fixes the query rather than waiting out an outage. */
  const result = await ghAgainst({ args: unparsedQuery, world: 'rate-limiter' });

  expect(result.stderr).toContain('Syntax Error');
});

test('a query that does not parse is not recorded as refused', async ({ expect }) => {
  // The mistake is the caller's, not a gap in the world.
  const result = await ghAgainst({ args: unparsedQuery, world: 'rate-limiter' });

  expect(result.refusals).toStrictEqual([]);
});

const invalidQuery = ['api', 'graphql', '-f', 'query={ viewer { loginn } }'];

test('a query that does not validate is answered with its errors', async ({ expect }) => {
  // What an agent gets for a misspelt field in a query it wrote by hand.
  const result = await ghAgainst({ args: invalidQuery, world: 'rate-limiter' });

  expect(result.stderr).toContain('Cannot query field "loginn" on type "User".');
});

test('a query that does not validate is not recorded as refused', async ({ expect }) => {
  // The mistake is the caller's, not a gap in the world.
  const result = await ghAgainst({ args: invalidQuery, world: 'rate-limiter' });

  expect(result.refusals).toStrictEqual([]);
});

test('a call whose arguments outgrow a default request header is answered', async ({ expect }) => {
  /* The token carries the call's argv, so a long body flag makes for a long
     Authorization header. */
  const padding = 'x'.repeat(14_000);
  const result = await ghAgainst({
    args: ['api', 'graphql', '-f', 'query={ viewer { login } }', '-f', `padding=${padding}`],
    world: 'rate-limiter',
  });

  expect(result.stdout).toBe(viewer);
});

test('a query sent with null variables is answered', async ({ expect }) => {
  // go-gh sends `"variables": null` for a query it was given no variables for.
  const result = await proxied({
    /* eslint-disable-next-line unicorn/no-null --
       The null is the request under test, as go-gh serializes it. */
    body: JSON.stringify({ query: '{ viewer { login } }', variables: null }),
    method: 'POST',
    url: graphqlUrl,
  });

  expect(result.body).toBe(viewer);
});

test('the operation a request names is the one run', async ({ expect }) => {
  const result = await ghAgainst({
    args: [
      'api',
      'graphql',
      '-f',
      'query=query Ping { __typename } query Me { viewer { login } }',
      '-f',
      'operationName=Me',
    ],
    world: 'rate-limiter',
  });

  expect(result.stdout).toBe(viewer);
});
