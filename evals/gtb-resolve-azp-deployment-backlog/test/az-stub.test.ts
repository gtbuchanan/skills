/*
 * Tests for the fake `az` this suite runs the skill against.
 *
 * The three commands it models are the ones the suite's own scenarios reach
 * for. What matters as much is the fourth: `az devops invoke` is in the skill's
 * own vocabulary and is not modelled here, so it is the call most likely to
 * arrive — and empty success would answer it with "there is nothing here". A
 * run told that reads it as no approvals pending, does nothing, and finishes
 * looking correct, with every assertion still passing because none of them
 * reads the az log.
 *
 * The catalog is the other half. A named pipeline's numeric id lives nowhere
 * else, so the suite treats the script being invoked with the right id as proof
 * the name was resolved through `az pipelines list` — which only holds while
 * that command answers with the catalog and an unmodelled one cannot.
 *
 * Driven as a subprocess rather than by importing the module: the double's
 * whole contract is stdout and an exit status, and a refusal exists only once
 * both have been written out. Each case spawns a process and stays in the fast
 * bucket, where a refusal that stopped happening has to fail.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'vitest';

const stub = path.join(import.meta.dirname, '..', 'bin', 'az-stub.ts');

interface Run {
  readonly status: number | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * One `az` invocation, as the agent would make it.
 *
 * STUB_LOG_DIR is deliberately left unset: nothing here asserts on the log.
 */
const az = (...args: readonly string[]): Run => {
  const result = spawnSync(process.execPath, [stub, ...args], {
    encoding: 'utf8',
  });

  return {
    status: result.status ?? undefined,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

test('a command the suite does not model is refused, not answered', ({ expect }) => {
  /* The one that matters: the skill names `az devops invoke`, and `{}` would
     read as an empty result rather than as an unanswerable call. */
  const result = az('devops', 'invoke', '--area', 'distributedtask');

  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe('');
});

test('the refusal names the double and the call', ({ expect }) => {
  const result = az('pipelines', 'runs', 'list');

  expect(result.stderr).toContain('az-stub');
  expect(result.stderr).toContain('pipelines runs list');
});

test('the pipeline catalog is what a listing answers with', ({ expect }) => {
  /* Load bearing for the whole suite: the numeric ids live only here, so the
     script being run with one is what proves the agent resolved the name. */
  const result = az('pipelines', 'list', '--org', 'https://dev.azure.com/acme');

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toContainEqual(
    expect.objectContaining({ id: 900_001, name: 'web-frontend' }),
  );
});

test('a token request still answers, so the auth path is reachable', ({ expect }) => {
  const result = az('account', 'get-access-token');

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toHaveProperty('accessToken');
});
