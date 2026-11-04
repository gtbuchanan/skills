/*
 * Tests for how the fake GitHub answers from a world, driven through the real
 * gh.
 *
 * The fake exists so gh can be the thing that formats, validates and exits,
 * so a test that called the fake directly would test the half nobody relies
 * on. Each case runs gh against a fake started for it alone, with a run log of
 * its own.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 *
 * @module-tag slow
 */
import { test } from 'vitest';
import { ghAgainst } from './fixtures.ts';

const viewTitle = ['pr', 'view', '7', '--json', 'title'];
const viewUnmodelled = ['pr', 'view', '7', '--json', 'files'];
const unmodelledRoute = ['api', 'user'];
const faultyRoute = ['api', 'repos/acme/widgets/fault'];
const unserializableRoute = ['api', 'repos/acme/widgets/unserializable'];

test('a field the world models is answered', async ({ expect }) => {
  const result = await ghAgainst({ args: viewTitle, world: 'rate-limiter' });

  expect(result).toStrictEqual({
    refusals: [],
    status: 0,
    stderr: '',
    stdout: '{"title":"Add the rate limiter"}\n',
  });
});

test('a field the world models as undefined is answered as null', async ({ expect }) => {
  /* GitHub sends explicit nulls, and a world states one without breaking the
     no-null rule. */
  const result = await ghAgainst({
    args: ['pr', 'view', '7', '--json', 'milestone'],
    world: 'rate-limiter',
  });

  expect(result.stdout).toBe('{"milestone":null}\n');
});

test('a query selecting one field typed differently by union members is answered', async ({
  expect,
}) => {
  /* gh selects `name` from both User (String) and Team (String!) when it
     reads review requests. graphql-js refuses that by default, and GitHub
     answers it. */
  const result = await ghAgainst({
    args: ['pr', 'view', '7', '--json', 'reviewRequests'],
    world: 'rate-limiter',
  });

  expect(result.status).toBe(0);
});

test('the token chooses which world answers', async ({ expect }) => {
  const result = await ghAgainst({ args: viewTitle, world: 'tokenizer' });

  expect(result.stdout).toBe('{"title":"Split the tokenizer"}\n');
});

test('a token naming no world is refused as bad credentials', async ({ expect }) => {
  const result = await ghAgainst({ args: viewTitle, world: 'no-such-world' });

  expect(result.stderr).toContain('Bad credentials');
});

test('a token naming no world is recorded as refused', async ({ expect }) => {
  // A misspelt world key otherwise reads as an auth failure and nothing else.
  const result = await ghAgainst({ args: viewTitle, world: 'no-such-world' });

  expect(result.refusals).toStrictEqual(['no world named no-such-world']);
});

test('a field the world does not model fails', async ({ expect }) => {
  /* Answering null would read to an agent as "this pull request changes no
     files", which is an answer. */
  const result = await ghAgainst({ args: viewUnmodelled, world: 'rate-limiter' });

  expect(result.status).toBe(1);
});

test('a field the world does not model fails as GitHub fails', async ({ expect }) => {
  // Nothing the agent reads may say it is talking to a double.
  const result = await ghAgainst({ args: viewUnmodelled, world: 'rate-limiter' });

  expect(result.stderr).toBe(
    'GraphQL: Something went wrong while executing your query. This may be the result of a ' +
    'timeout, or it could be a GitHub bug. (repository.pullRequest.files)\n',
  );
});

test('a field the world does not model is recorded as refused', async ({ expect }) => {
  const result = await ghAgainst({ args: viewUnmodelled, world: 'rate-limiter' });

  expect(result.refusals).toStrictEqual(['no model for GraphQL field PullRequest.files']);
});

test('a refusal is recorded under STUB_LOG_DIR by default', async ({ expect }) => {
  // A suite hosting the fake names the log directory the way it does for stubs.
  const result = await ghAgainst({
    args: viewUnmodelled,
    logDirFrom: 'environment',
    world: 'rate-limiter',
  });

  expect(result.refusals).toStrictEqual(['no model for GraphQL field PullRequest.files']);
});

test('a refusal outside a run is recorded nowhere', async ({ expect }) => {
  const result = await ghAgainst({ args: viewUnmodelled, inRun: false, world: 'rate-limiter' });

  expect(result.refusals).toStrictEqual([]);
});

test('a REST route the world models is answered', async ({ expect }) => {
  const result = await ghAgainst({
    args: ['api', '--method', 'PUT', 'repos/acme/widgets/pulls/7/merge-async'],
    world: 'rate-limiter',
  });

  expect(result.stdout).toBe('{"status":"pending"}');
});

test('a REST route the world does not model fails', async ({ expect }) => {
  const result = await ghAgainst({ args: unmodelledRoute, world: 'rate-limiter' });

  expect(result.status).toBe(1);
});

test('a REST route the world does not model fails as GitHub fails', async ({ expect }) => {
  /* A server error rather than 404: gh reads a 404 as an answer in places,
     and deleting a branch that 404s counts as already deleted. */
  const result = await ghAgainst({ args: unmodelledRoute, world: 'rate-limiter' });

  expect(result.stderr).toBe('gh: Server Error (HTTP 500)\n');
});

test('a REST route the world does not model is recorded as refused', async ({ expect }) => {
  const result = await ghAgainst({ args: unmodelledRoute, world: 'rate-limiter' });

  expect(result.refusals).toStrictEqual(['no model for REST route GET /user']);
});

test('a world that throws answering a route fails as GitHub fails', async ({ expect }) => {
  const result = await ghAgainst({ args: faultyRoute, world: 'rate-limiter' });

  expect(result.stderr).toBe('gh: Server Error (HTTP 500)\n');
});

test('a world that throws answering a route is recorded as refused', async ({ expect }) => {
  const result = await ghAgainst({ args: faultyRoute, world: 'rate-limiter' });

  expect(result.refusals).toStrictEqual([
    'fault answering GET /repos/acme/widgets/fault: Error: the world broke',
  ]);
});

test('a world answering with a body JSON cannot carry fails as GitHub fails', async ({
  expect,
}) => {
  const result = await ghAgainst({ args: unserializableRoute, world: 'rate-limiter' });

  expect(result.stderr).toBe('gh: Server Error (HTTP 500)\n');
});

test('a world answering with a body JSON cannot carry is recorded as refused', async ({
  expect,
}) => {
  const result = await ghAgainst({ args: unserializableRoute, world: 'rate-limiter' });

  expect(result.refusals).toStrictEqual([
    'fault answering GET /repos/acme/widgets/unserializable: ' +
    'TypeError: Do not know how to serialize a BigInt',
  ]);
});
