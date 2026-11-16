/*
 * Tests for what only the fake's server decides: what reaches it as a proxy,
 * what fits in a request it accepts, and what it says to a request it cannot
 * read. Most run the real gh against it. Answers
 * themselves are tested without a socket, in the other test files.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 *
 * @module-tag slow
 */
import { request } from 'node:http';
import { test } from 'vitest';
import { ghAgainst, graphqlUrl } from './fixtures.ts';
import { startFakeGitHub } from '@gtbuchanan/github-fake/server';
import type { World } from '@gtbuchanan/github-fake/world';

test('github.com cannot be reached', async ({ expect }) => {
  // The proxy is the only way out, and the fake refuses to tunnel anywhere.
  const result = await ghAgainst({
    args: ['api', '--hostname', 'github.com', 'user'],
    world: 'rate-limiter',
  });

  expect(result.stderr).toContain('Forbidden');
});

test('a call whose arguments outgrow a default request header is answered', async ({ expect }) => {
  /* The token carries the call's argv, so a long body flag makes for a long
     Authorization header. */
  const padding = 'x'.repeat(14_000);
  const result = await ghAgainst({
    args: ['api', 'graphql', '-f', 'query={ viewer { login } }', '-f', `padding=${padding}`],
    world: 'rate-limiter',
  });

  expect(result.stdout).toBe('{"data":{"viewer":{"login":"taylor"}}}');
});

/**
 * How long to wait for the server's answer to a raw request: far longer than
 * any answer takes, so a request that gets none fails rather than hangs.
 */
const answerTimeoutMs = 5000;

/**
 * The status the fake's server answers a raw `method` request with.
 */
const statusFor = async (method: string): Promise<number | undefined> => {
  const noWorlds: Readonly<Record<string, World>> = {};
  const fake = await startFakeGitHub({ worlds: key => noWorlds[key] });
  try {
    return await new Promise<number | undefined>((resolve, reject) => {
      const outgoing = request(
        { host: '127.0.0.1', method, path: graphqlUrl, port: fake.port, timeout: answerTimeoutMs },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      outgoing.on('timeout', () => {
        outgoing.destroy(new Error(`no answer to ${method} within ${String(answerTimeoutMs)} ms`));
      });
      outgoing.on('error', reject);
      outgoing.end();
    });
  } finally {
    await fake.close();
  }
};

test('a request the fake cannot read is answered as a bad request', async ({ expect }) => {
  // A fetch request refuses TRACE, so the fake never gets to answer it itself.
  await expect(statusFor('TRACE')).resolves.toBe(400);
});
