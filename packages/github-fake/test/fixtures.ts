/*
 * What the fake's tests share: worlds to answer from, and two ways to reach a
 * fake made for one test alone: asking it directly, or running gh against it.
 *
 * The real gh is `GH_REAL` where the runner or the developer names one, and the
 * first gh on PATH otherwise. A version manager's shim is not one: mise's
 * cannot start under the bare environment gh runs in here, so a host whose
 * PATH reaches gh only through shims names it in `GH_REAL`.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as v from 'valibot';
import which from 'which';
import { callerToken } from '@gtbuchanan/github-fake/caller';
import { fakeGhEnv } from '@gtbuchanan/github-fake/gh-env';
import { fakeGitHub, startFakeGitHub } from '@gtbuchanan/github-fake/server';
import type { Refusal } from '@gtbuchanan/github-fake/server';
import { GitHubError } from '@gtbuchanan/github-fake/world';
import type { World } from '@gtbuchanan/github-fake/world';

/* Only an .exe on Windows: gh is spawned without a shell, which refuses a .cmd
   and cannot run an extensionless file. */
const gh = process.env['GH_REAL'] ??
  which.sync('gh', { nothrow: true, ...(process.platform === 'win32' && { pathExt: '.exe' }) }) ??
  'gh';

/**
 * What the host attaches to each call, and the fake hands back with a refusal.
 */
const context = 'run-1';

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
 * Options for a fake serving {@link worlds} that keeps every refusal it hands
 * its host in `refused`.
 */
const collecting = (refused: Refusal[]) => ({
  onRefusal: (refusal: Refusal) => {
    refused.push(refusal);
  },
  worlds: (key: string) => worlds[key],
});

export interface Run {
  /**
   * The reasons the fake refused for, in the order it refused.
   */
  readonly refusals: readonly string[];
  readonly refused: readonly Refusal[];
  readonly status: number | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

export interface Against {
  readonly args: readonly string[];
  /**
   * Whether the host attaches a context to the call.
   */
  readonly withContext?: boolean;
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
  withContext = true,
  world,
}: Against): Promise<Run> => {
  const dir = mkdtempSync(path.join(tmpdir(), 'github-fake-'));
  const refused: Refusal[] = [];
  const fake = await startFakeGitHub(collecting(refused));
  const caller = withContext ? { argv: [...args], context, world } : { argv: [...args], world };
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

    return {
      refusals: refused.map(refusal => refusal.reason),
      refused,
      status: status ?? undefined,
      stderr,
      stdout,
    };
  } finally {
    await fake.close();
  }
};

/**
 * Where gh sends GraphQL for `github.localhost`.
 */
export const graphqlUrl = 'http://api.github.localhost/graphql';

/**
 * Where gh sends a REST call to `route` for `github.localhost`.
 */
export const restUrl = (route: string): string => new URL(route, graphqlUrl).href;

/**
 * A GraphQL request body as gh sends one.
 */
export const graphql = (query: string, extra: Readonly<Record<string, unknown>> = {}): string =>
  JSON.stringify({ query, ...extra });

export interface Asked {
  readonly body?: string;
  readonly method?: string;
  /**
   * Whether the request carries a token, as every request gh sends does.
   */
  readonly signed?: boolean;
  readonly url?: string;
  /**
   * Whether the host attaches a context to the call.
   */
  readonly withContext?: boolean;
  readonly world?: string;
}

export interface Answer {
  readonly body: unknown;
  /**
   * The reasons the fake refused for, in the order it refused.
   */
  readonly refusals: readonly string[];
  readonly refused: readonly Refusal[];
  readonly status: number;
}

/**
 * The argv a request's token names: the call that sent it.
 */
export const askedArgv = ['api', 'graphql'];

/**
 * Asks a fake serving {@link worlds} one question directly, as a caller with
 * the token gh would send, and reads back what it answered and refused.
 */
export const answered = async ({
  body,
  method = body === undefined ? 'GET' : 'POST',
  signed = true,
  url = graphqlUrl,
  withContext = true,
  world = 'rate-limiter',
}: Asked): Promise<Answer> => {
  const refused: Refusal[] = [];
  const caller = withContext ? { argv: askedArgv, context, world } : { argv: askedArgv, world };
  const response = await fakeGitHub(collecting(refused)).request(new Request(url, {
    headers: signed ? { authorization: `token ${callerToken(caller)}` } : {},
    method,
    ...(body !== undefined && { body }),
  }));

  return {
    body: JSON.parse(await response.text()),
    refusals: refused.map(refusal => refusal.reason),
    refused,
    status: response.status,
  };
};

const PathSchema = v.array(v.union([v.string(), v.number()]));
const ErrorSchema = v.object({
  message: v.string(),
  path: v.optional(PathSchema),
  type: v.optional(v.string()),
});
const ErrorsSchema = v.object({ errors: v.array(ErrorSchema) });

/**
 * The GraphQL errors an answer carries: each one's message, path and type.
 */
export const errorsOf = (answer: Answer): v.InferOutput<typeof ErrorsSchema>['errors'] =>
  v.parse(ErrorsSchema, answer.body).errors.map(({ message, path: at, type }) =>
    ({ message, ...(at !== undefined && { path: at }), ...(type !== undefined && { type }) }));

/**
 * What GitHub says when a query fails on its side.
 */
export const githubBug =
  'Something went wrong while executing your query. This may be the result of a timeout, ' +
  'or it could be a GitHub bug.';
