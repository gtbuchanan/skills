/*
 * A fake GitHub API the real gh reaches through its HTTP proxy.
 *
 * gh is the thing under the agent, and it is real: it builds the queries,
 * validates the flags, formats the output and chooses the exit status. What
 * is fake is only the forge behind it, so what a scenario has to state is the
 * repository, never what gh prints about it.
 *
 * GraphQL runs against GitHub's published schema, so a query is validated the
 * way GitHub would validate it and gh's feature detection is answered without
 * help. What a world does not define is an error naming the field or route,
 * because the alternative — a null, an empty list, a 200 with nothing in it —
 * reads to an agent as "there is nothing here", and it acts on that.
 *
 * Each call names its world with the token gh sends, since HTTP carries no
 * working directory to locate a scenario from. See gh-env.ts for the other
 * half of that contract.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { text } from 'node:stream/consumers';
import { schema as published } from '@octokit/graphql-schema';
import { GraphQLError, buildSchema, graphql } from 'graphql';
import type { GraphQLFieldResolver, GraphQLSchema } from 'graphql';
import * as v from 'valibot';
import type { RestAnswer, World } from './world.ts';

export interface FakeGitHub {
  readonly close: () => Promise<void>;
  readonly port: number;
}

export interface FakeGitHubOptions {
  /**
   * The world a call's token names, or `undefined` for a token naming none.
   */
  readonly worlds: (key: string) => World | undefined;
}

/**
 * The host gh sends API calls to for `github.localhost`.
 */
const apiHost = 'api.github.localhost';

/**
 * GitHub's published schema, built once: it is large, and building it is the
 * slowest thing the fake does.
 *
 * Trusted rather than validated. It breaks a rule newer graphql-js enforces
 * about deprecated interface fields, and it is GitHub's schema to get wrong.
 */
const githubSchema = ((): (() => GraphQLSchema) => {
  const cache: { schema?: GraphQLSchema } = {};
  return () => {
    cache.schema ??= buildSchema(published.idl, { assumeValid: true, assumeValidSDL: true });
    return cache.schema;
  };
})();

/**
 * Resolves only what a world defines: a property is the field's value and a
 * function is called with the field's arguments. Anything else is an error
 * naming the field, which gh reports with the path that reached it.
 */
const fieldResolver: GraphQLFieldResolver<unknown, unknown> = (source, args, _context, info) => {
  if (typeof source === 'object' && source !== null && Object.hasOwn(source, info.fieldName)) {
    const value: unknown = Reflect.get(source, info.fieldName);
    return typeof value === 'function' ? Reflect.apply(value, source, [args]) : value;
  }

  throw new GraphQLError(
    `fake GitHub does not model ${info.parentType.name}.${info.fieldName}`,
  );
};

const send = (res: ServerResponse, answer: RestAnswer): void => {
  res.writeHead(answer.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(answer.body));
};

const tokenPattern = /^token (?<token>.+)$/v;

/**
 * The token gh sent, which names the world.
 */
const tokenOf = (req: IncomingMessage): string => {
  const match = tokenPattern.exec(req.headers.authorization ?? '');
  return match?.groups?.['token'] ?? '';
};

const VariablesSchema = v.record(v.string(), v.unknown());

const GraphqlRequestSchema = v.object({
  query: v.string(),
  variables: v.optional(VariablesSchema, {}),
});

const answer = async (
  req: IncomingMessage,
  options: FakeGitHubOptions,
): Promise<RestAnswer> => {
  // Proxied requests arrive with an absolute URL; anything else has none.
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? apiHost}`);
  if (url.host !== apiHost)
    return { body: { message: `fake GitHub refuses ${url.host}` }, status: 403 };

  const world = options.worlds(tokenOf(req));
  if (world === undefined)
    return {
      body: { documentation_url: 'https://docs.github.com/rest', message: 'Bad credentials' },
      status: 401,
    };

  const body = await text(req);
  const method = req.method ?? 'GET';

  if (method === 'POST' && url.pathname === '/graphql') {
    const request = v.parse(GraphqlRequestSchema, JSON.parse(body));
    const result = await graphql({
      fieldResolver,
      rootValue: world.graphql,
      schema: githubSchema(),
      source: request.query,
      variableValues: request.variables,
    });
    return { body: result, status: 200 };
  }

  return world.rest?.({ body, method, path: url.pathname }) ?? {
    body: { message: `fake GitHub does not model ${method} ${url.pathname}` },
    status: 404,
  };
};

/**
 * Answers one request. Never rejects: a fault in the fake is a 500 naming it,
 * which gh reports, rather than a dropped connection it retries.
 */
const respond = async (
  req: IncomingMessage,
  res: ServerResponse,
  options: FakeGitHubOptions,
): Promise<void> => {
  try {
    send(res, await answer(req, options));
  } catch (error) {
    send(res, { body: { message: `fake GitHub failed: ${String(error)}` }, status: 500 });
  }
};

export const startFakeGitHub = async (options: FakeGitHubOptions): Promise<FakeGitHub> => {
  const server = createServer((req, res) => {
    // Not awaited: the listener returns nothing, and respond never rejects.
    void respond(req, res, options);
  });

  /* A tunnel is gh trying to reach a real host over HTTPS. Refused, so the
     proxy that leads here leads nowhere else. */
  server.on('connect', (_req, socket) => {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('fake GitHub is not listening on a TCP port');

  return {
    close: async () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
    port: address.port,
  };
};
