/*
 * Tests for what only the fake's server decides, driven through the real gh:
 * what reaches it as a proxy, and what fits in a request it accepts. Answers
 * themselves are tested without a socket, in the other test files.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 *
 * @module-tag slow
 */
import { test } from 'vitest';
import { ghAgainst } from './fixtures.ts';

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
