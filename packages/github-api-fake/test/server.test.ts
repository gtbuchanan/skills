/*
 * Tests for the fake GitHub, driven through the real gh.
 *
 * The fake exists so gh can be the thing that formats, validates and exits,
 * so a test that called the fake directly would test the half nobody relies
 * on. Each case runs gh against a fake started for it alone.
 *
 * The real gh is `GH_REAL` where the runner names one, and the gh on PATH
 * otherwise.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { fakeGhEnv } from '@gtbuchanan/github-api-fake/gh-env';
import { startFakeGitHub } from '@gtbuchanan/github-api-fake/server';
import type { World } from '@gtbuchanan/github-api-fake/world';

const gh = process.env['GH_REAL'] ?? 'gh';

/**
 * The only variables a gh run inherits from this process: what a process needs
 * to start on each platform, and nothing that could carry a credential or
 * point gh anywhere. Spreading `process.env` instead lets gh fall back on the
 * developer's own login and host the moment the fake's variables go missing.
 */
const startupVars = ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR'];

const startupEntry = (name: string): [string, string][] => {
  const value = process.env[name];
  return value === undefined ? [] : [[name, value]];
};

const startupEnv = (): Record<string, string> =>
  Object.fromEntries(startupVars.flatMap(startupEntry));

interface Run {
  readonly status: number | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * A world with one repository, acme/widgets, holding pull request 7.
 */
const worldWithTitle = (title: string): World => ({
  graphql: {
    repository: ({ name, owner }: { name: string; owner: string }) =>
      owner === 'acme' && name === 'widgets'
        ? {
            id: 'R_widgets',
            pullRequest: ({ number }: { number: number }) =>
              number === 7 ? { id: 'PR_7', number: 7, title } : undefined,
          }
        : undefined,
  },
  rest: request =>
    request.method === 'PUT' && request.path === '/repos/acme/widgets/pulls/7/merge-async'
      ? { body: { status: 'pending' }, status: 202 }
      : undefined,
});

const worlds: Record<string, World> = {
  'rate-limiter': worldWithTitle('Add the rate limiter'),
  'tokenizer': worldWithTitle('Split the tokenizer'),
};

/**
 * Runs gh against a fake serving {@link worlds}, as the world `world`.
 *
 * Asynchronous, because the fake answers on this process's event loop: a
 * synchronous spawn would block the very loop gh is waiting on.
 */
const ghAgainst = async (world: string, args: readonly string[]): Promise<Run> => {
  const fake = await startFakeGitHub({ worlds: key => worlds[key] });
  const dir = mkdtempSync(path.join(tmpdir(), 'github-api-fake-'));
  try {
    const child = spawn(gh, [...args], {
      env: {
        ...startupEnv(),
        ...fakeGhEnv({ dir, port: fake.port, world }),
        GH_REPO: 'github.localhost/acme/widgets',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
    });
    const status = await new Promise<number | null>((resolve) => {
      child.on('close', resolve);
    });

    return { status: status ?? undefined, stderr, stdout };
  } finally {
    await fake.close();
  }
};

test('a field the world models is answered', { tags: ['slow'] }, async ({ expect }) => {
  const run = await ghAgainst('rate-limiter', ['pr', 'view', '7', '--json', 'title']);

  expect(run).toStrictEqual({
    status: 0,
    stderr: '',
    stdout: '{"title":"Add the rate limiter"}\n',
  });
});

test('a field the world does not model fails, naming it', { tags: ['slow'] }, async ({
  expect,
}) => {
  /* Answering null would read to an agent as "this pull request has no
     reviews", which is an answer. */
  const run = await ghAgainst('rate-limiter', ['pr', 'view', '7', '--json', 'reviews']);

  expect(run.status).toBe(1);
  expect(run.stderr).toContain('PullRequest.reviews');
});

test('the token chooses which world answers', { tags: ['slow'] }, async ({ expect }) => {
  const run = await ghAgainst('tokenizer', ['pr', 'view', '7', '--json', 'title']);

  expect(run.stdout).toBe('{"title":"Split the tokenizer"}\n');
});

test('a token naming no world is refused', { tags: ['slow'] }, async ({ expect }) => {
  const run = await ghAgainst('no-such-world', ['pr', 'view', '7', '--json', 'title']);

  expect(run.status).not.toBe(0);
  expect(run.stderr).toContain('Bad credentials');
});

test('a REST route the world models is answered', { tags: ['slow'] }, async ({ expect }) => {
  const run = await ghAgainst('rate-limiter', [
    'api',
    '--method',
    'PUT',
    'repos/acme/widgets/pulls/7/merge-async',
  ]);

  expect(run.stdout).toBe('{"status":"pending"}');
});

test('a REST route the world does not model fails, naming it', { tags: ['slow'] }, async ({
  expect,
}) => {
  const run = await ghAgainst('rate-limiter', ['api', 'user']);

  expect(run.status).toBe(1);
  expect(run.stderr).toContain('GET /user');
});

test('github.com cannot be reached', { tags: ['slow'] }, async ({ expect }) => {
  // The proxy is the only way out, and the fake refuses to tunnel anywhere.
  const run = await ghAgainst('rate-limiter', ['api', '--hostname', 'github.com', 'user']);

  expect(run.status).toBe(1);
  expect(run.stderr).toContain('Forbidden');
});
