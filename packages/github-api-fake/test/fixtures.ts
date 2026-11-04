/*
 * What the fake's tests share: a world to answer from, and two ways to reach
 * a fake started for one test alone.
 *
 * The real gh is `GH_REAL` where the runner names one, and the first gh on PATH
 * outside mise's shims otherwise.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readRefusals } from '@gtbuchanan/stub-runtime/calls';
import { resolveRealTool } from '@gtbuchanan/stub-runtime/real-tool';
import { runLogPath } from '@gtbuchanan/stub-runtime/run-log';
import { vi } from 'vitest';
import { callerToken } from '@gtbuchanan/github-api-fake/caller';
import { fakeGhEnv } from '@gtbuchanan/github-api-fake/gh-env';
import { startFakeGitHub } from '@gtbuchanan/github-api-fake/server';
import { GitHubError } from '@gtbuchanan/github-api-fake/world';
import type { World } from '@gtbuchanan/github-api-fake/world';

const gh = process.env['GH_REAL'] ?? resolveRealTool('gh') ?? 'gh';

const run = 'run-1';

/**
 * How long one gh call may take before it is killed: far longer than any
 * answer takes, far shorter than gh's own wait on a silent server.
 */
const ghTimeoutMs = 10_000;

/**
 * The only variables a gh run inherits from this process: what a process needs
 * to start on each platform, and nothing that could carry a credential or
 * point gh anywhere. Spreading `process.env` instead lets gh fall back on the
 * developer's own login and host the moment the fake's variables go missing.
 */
const startupVars = ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR'];

const startupEnv = (): Record<string, string> =>
  Object.fromEntries(startupVars.flatMap((name) => {
    const value = process.env[name];
    return value === undefined ? [] : [[name, value]];
  }));

/**
 * Pull request 7 of acme/widgets, titled `title`, with one user and one team
 * asked to review it and no milestone.
 */
const pullRequest = (title: string): Record<string, unknown> => ({
  id: 'PR_7',
  milestone: undefined,
  number: 7,
  reviewRequests: {
    nodes: [
      {
        requestedReviewer: {
          __typename: 'User',
          login: 'dana',
          name: 'Dana Reyes',
        },
      },
      {
        requestedReviewer: {
          __typename: 'Team',
          name: 'Platform',
          organization: { login: 'acme' },
          slug: 'platform',
        },
      },
    ],
  },
  title,
});

/**
 * A world with one repository, acme/widgets, holding pull request 7; a viewer;
 * a REST route for merging the pull request asynchronously; and two routes a
 * world gets wrong, one by throwing and one by answering with a body JSON
 * cannot carry.
 */
const worldWithTitle = (title: string): World => ({
  graphql: {
    repository: ({ name, owner }: { name: string; owner: string }) =>
      owner === 'acme' && name === 'widgets'
        ? { pullRequest: () => pullRequest(title) }
        : undefined,
    viewer: { login: 'taylor' },
  },
  rest: ({ method, path: route }) => {
    if (route === '/repos/acme/widgets/fault') throw new Error('the world broke');
    if (route === '/repos/acme/widgets/unserializable')
      return { body: { count: 1n }, status: 200 };
    const isMergeAsync = method === 'PUT' && route === '/repos/acme/widgets/pulls/7/merge-async';
    return isMergeAsync ? { body: { status: 'pending' }, status: 202 } : undefined;
  },
});

/**
 * Worlds that each get one thing wrong while answering GraphQL, and one that
 * answers with an error GitHub itself sends.
 */
const graphqlFaults: Readonly<Record<string, World>> = {
  'login-missing': { graphql: { viewer: { login: undefined } } },
  'no-such-user': {
    graphql: {
      viewer: () => {
        throw new GitHubError('Could not resolve to a User with the login of taylor.', {
          type: 'NOT_FOUND',
        });
      },
    },
  },
  'reviewer-untyped': {
    graphql: {
      repository: () => ({
        pullRequest: () => ({
          ...pullRequest('Add the rate limiter'),
          reviewRequests: { nodes: [{ requestedReviewer: { login: 'dana', name: 'Dana' } }] },
        }),
      }),
    },
  },
  'viewer-throws': {
    graphql: {
      viewer: () => {
        throw new Error('the world broke');
      },
    },
  },
};

const worlds: Readonly<Record<string, World>> = {
  ...graphqlFaults,
  'rate-limiter': worldWithTitle('Add the rate limiter'),
  'tokenizer': worldWithTitle('Split the tokenizer'),
};

/**
 * The reasons the fake recorded in a test's run log.
 */
const refusalsIn = (dir: string): readonly string[] => {
  const log = runLogPath(dir, run);
  return existsSync(log) ? readRefusals(log, 'gh').map(refused => refused.reason) : [];
};

export interface Run {
  readonly refusals: readonly string[];
  readonly status: number | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

export interface Against {
  readonly args: readonly string[];
  /**
   * Whether the call is made inside a run, so the fake has a log to record a
   * refusal in.
   */
  readonly inRun?: boolean;
  /**
   * How the fake learns where run logs go: from its options, or from
   * `STUB_LOG_DIR`, as it does when a suite hosts it.
   */
  readonly logDirFrom?: 'environment' | 'options';
  readonly world: string;
}

/**
 * Runs gh against a fake serving {@link worlds}.
 *
 * Asynchronous, because the fake answers on this process's event loop: a
 * synchronous spawn would block the very loop gh is waiting on.
 */
export const ghAgainst = async ({
  args,
  inRun = true,
  logDirFrom = 'options',
  world,
}: Against): Promise<Run> => {
  const dir = mkdtempSync(path.join(tmpdir(), 'github-api-fake-'));
  if (logDirFrom === 'environment') vi.stubEnv('STUB_LOG_DIR', dir);
  const fake = await startFakeGitHub(logDirFrom === 'environment'
    ? { worlds: key => worlds[key] }
    : { logDir: () => dir, worlds: key => worlds[key] });
  const caller = inRun ? { argv: [...args], run, world } : { argv: [...args], world };
  try {
    const child = spawn(gh, [...args], {
      env: {
        ...startupEnv(),
        ...fakeGhEnv({ caller, dir: path.join(dir, 'gh'), port: fake.port }),
        GH_REPO: 'github.localhost/acme/widgets',
      },
      // A fake that never answers leaves gh waiting forever; fail instead.
      timeout: ghTimeoutMs,
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

    return { refusals: refusalsIn(dir), status: status ?? undefined, stderr, stdout };
  } finally {
    await fake.close();
  }
};

export interface Proxied {
  readonly body?: string;
  readonly method?: string;
  /**
   * Whether the request carries a token, as every request gh sends does.
   */
  readonly signed?: boolean;
  readonly url: string;
}

export interface ProxiedReply {
  readonly body: string;
  readonly refusals: readonly string[];
  readonly status: number;
}

/**
 * Sends one plain-HTTP request through the fake as its proxy, inside a run,
 * and reads back what it answered and recorded.
 *
 * Direct rather than through gh, for requests gh will not make: plain HTTP to
 * a host other than `github.localhost`, and request bodies gh never sends.
 */
export const proxied = async ({
  body,
  method = 'GET',
  signed = true,
  url,
}: Proxied): Promise<ProxiedReply> => {
  const dir = mkdtempSync(path.join(tmpdir(), 'github-api-fake-'));
  const fake = await startFakeGitHub({ logDir: () => dir, worlds: key => worlds[key] });
  const token = callerToken({ argv: ['api'], run, world: 'rate-limiter' });
  try {
    const reply = await new Promise<Omit<ProxiedReply, 'refusals'>>((resolve, reject) => {
      const outgoing = request({
        headers: {
          ...(signed && { authorization: `token ${token}` }),
          host: new URL(url).host,
        },
        host: '127.0.0.1',
        method,
        path: url,
        port: fake.port,
      }, (response) => {
        let received = '';
        response.on('data', (chunk: Buffer) => {
          received += String(chunk);
        });
        response.on('end', () => {
          resolve({ body: received, status: response.statusCode ?? 0 });
        });
      });
      outgoing.on('error', reject);
      outgoing.end(body);
    });

    return { ...reply, refusals: refusalsIn(dir) };
  } finally {
    await fake.close();
  }
};
