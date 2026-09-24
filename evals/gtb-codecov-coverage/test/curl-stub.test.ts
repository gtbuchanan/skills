/*
 * Tests for the fake `curl` this suite runs the skill against.
 *
 * What the double has to get right is refusing rather than obliging. An
 * unauthenticated read of the private repository must come back as 401, because
 * that refusal is the only thing forcing the private scenario to authenticate
 * at all — answered on the nod, an agent that never looked for the token would
 * produce the right lines and the test would pass on a run that proved nothing.
 *
 * The path filter is the same shape of defect inverted. A double returning the
 * whole report whatever was asked makes "did it narrow the request" a question
 * no assertion can fail, so a call naming `src/api` has to come back without
 * src/web in it.
 *
 * Driven as a subprocess rather than by importing the module: the double's
 * whole contract is stdout and an exit status.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'vitest';

const stub = path.join(import.meta.dirname, '..', 'bin', 'curl-stub.ts');

const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const base = 'https://api.codecov.io/api/v2/github/acme/repos';

interface Run {
  readonly body: Record<string, unknown>;
  readonly status: number | undefined;
  readonly stdout: string;
}

/**
 * One `curl` invocation, as the agent would make it.
 *
 * STUB_LOG_DIR is deliberately left unset: nothing here asserts on the log.
 */
const curl = (...args: readonly string[]): Run => {
  const result = spawnSync(process.execPath, [stub, ...args], {
    encoding: 'utf8',
  });
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    // a refusal writes nothing to stdout; the caller asserts on status instead
  }

  return { body, status: result.status ?? undefined, stdout: result.stdout };
};

test('a public repository answers without credentials', ({ expect }) => {
  const result = curl('-s', `${base}/widgets/report/?sha=${sha}`);

  expect(result.status).toBe(0);
  expect(result.body['totals']).toMatchObject({ files: 3 });
});

test('a private repository refuses an unauthenticated read', ({ expect }) => {
  /* The refusal the private scenario rests on: answered instead, an agent that
     never looked for the token would still get the lines. */
  const result = curl('-s', `${base}/ledger/report/?sha=${sha}`);

  expect(result.body).toMatchObject({
    detail: 'Invalid token or not authenticated.',
  });
  expect(result.body['totals']).toBeUndefined();
});

test('a bearer header unlocks the private repository', ({ expect }) => {
  const result = curl(
    '-s',
    '-H',
    'Authorization: bearer some-token',
    `${base}/ledger/report/?sha=${sha}`,
  );

  expect(result.body['totals']).toMatchObject({ files: 3 });
});

test('--config unlocks it too, since curl reads the header from the file', ({
  expect,
}) => {
  /* Taken on trust: this double is not curl and cannot read that file, and
     refusing would reject the very form the skill recommends for keeping a
     token out of argv. */
  const result = curl('-s', '--config', '/dev/fd/63', `${base}/ledger/report/?sha=${sha}`);

  expect(result.body['totals']).toMatchObject({ files: 3 });
});

test('an empty bearer header does not count as authentication', ({ expect }) => {
  const result = curl(
    '-s',
    '-H',
    'Authorization: bearer ',
    `${base}/ledger/report/?sha=${sha}`,
  );

  expect(result.body).toMatchObject({
    detail: 'Invalid token or not authenticated.',
  });
});

test('path= narrows the file list rather than being ignored', ({ expect }) => {
  const result = curl('-s', `${base}/widgets/report/?sha=${sha}&path=src/api`);
  const files = result.body['files'] as { name: string }[];

  expect(files.map(file => file.name)).toStrictEqual([
    'src/api/router.ts',
    'src/api/auth.ts',
  ]);
});

test('totals follow the selection, so a filtered call reads differently', ({
  expect,
}) => {
  const whole = curl('-s', `${base}/widgets/totals/?sha=${sha}`);
  const filtered = curl('-s', `${base}/widgets/totals/?sha=${sha}&path=src/api`);

  expect(whole.body['totals']).toMatchObject({ lines: 44, partials: 2 });
  expect(filtered.body['totals']).toMatchObject({ lines: 23, partials: 2 });
});

test('only the report resource carries line-level verdicts', ({ expect }) => {
  const report = curl('-s', `${base}/widgets/report/?sha=${sha}&path=src/web`);
  const totals = curl('-s', `${base}/widgets/totals/?sha=${sha}&path=src/web`);

  expect((report.body['files'] as Record<string, unknown>[])[0]).toHaveProperty(
    'line_coverage',
  );
  expect((totals.body['files'] as Record<string, unknown>[])[0]).not.toHaveProperty(
    'line_coverage',
  );
});

test('an unknown sha is refused, not answered from the one report held', ({
  expect,
}) => {
  const result = curl('-s', `${base}/widgets/report/?sha=deadbeef`);

  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe('');
});

test('an unmodelled resource is refused rather than answered empty', ({
  expect,
}) => {
  /* `pulls/` is in the skill's own vocabulary and is not canned here, so it is
     the call most likely to arrive. Empty success would read as "this pull
     request has no coverage", which is a fact rather than a refusal. */
  const result = curl('-s', `${base}/widgets/pulls/412/`);

  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe('');
});
