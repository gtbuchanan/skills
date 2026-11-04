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
 * help. What a world does not define is an error, because the alternative —
 * a null, an empty list, a 200 with nothing in it — reads to an agent as
 * "there is nothing here", and it acts on that.
 *
 * Each call names its world, and the call itself, with the token gh sends;
 * see caller.ts.
 *
 * What the fake cannot answer it refuses twice over. gh gets an error GitHub
 * itself could send, so nothing an agent reads says it is talking to a
 * double. The run log gets the refusal, naming the field or route, beside the
 * call that reached it, which is where a suite reports what its doubles
 * refused.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { text } from 'node:stream/consumers';
import { runLogPath } from '@gtbuchanan/stub-runtime/run-log';
import { appendJsonl } from '@gtbuchanan/stub-runtime/stub';
import {
  GraphQLError,
  OverlappingFieldsCanBeMergedRule,
  buildSchema,
  execute,
  parse,
  specifiedRules,
  validate,
} from 'graphql';
import type { GraphQLFieldResolver, GraphQLSchema } from 'graphql';
import * as v from 'valibot';
import { callerOf } from './caller.ts';
import type { Caller } from './caller.ts';
import type { RestAnswer, RestRequest, World } from './world.ts';

export interface FakeGitHub {
  readonly close: () => Promise<void>;
  readonly port: number;
}

export interface FakeGitHubOptions {
  /**
   * Where run logs are kept, read when a refusal is recorded: `STUB_LOG_DIR`
   * unless given. Unset, refusals are recorded nowhere.
   */
  readonly logDir?: () => string | undefined;
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
 * Vendored from docs.github.com rather than taken from a package, because gh
 * queries fields as soon as GitHub ships them and a packaged schema lags: gh
 * 2.103 already asks for `PullRequest.assignedActors`, which the last
 * `@octokit/graphql-schema` release does not have.
 *
 * Trusted rather than validated. It breaks a rule newer graphql-js enforces
 * about deprecated interface fields, and it is GitHub's schema to get wrong.
 */
const githubSchema = ((): (() => GraphQLSchema) => {
  const cache: { schema?: GraphQLSchema } = {};
  return () => {
    cache.schema ??= buildSchema(
      readFileSync(new URL('../schema/github.graphql', import.meta.url), 'utf8'),
      { assumeValid: true, assumeValidSDL: true },
    );
    return cache.schema;
  };
})();

/**
 * The validation GitHub applies, which is graphql-js's less one rule.
 *
 * gh's own queries select `name` from union members that type it differently
 * (`String` on one, `String!` on another), and GitHub answers them. graphql-js
 * refuses that by default; refusing it here would fail calls GitHub serves.
 */
const githubRules = specifiedRules.filter(rule => rule !== OverlappingFieldsCanBeMergedRule);

/**
 * What GitHub says when a query fails on its side.
 */
const githubBugMessage =
  'Something went wrong while executing your query. This may be the result of a timeout, ' +
  'or it could be a GitHub bug.';

/**
 * What GitHub's REST API says when it fails on its side.
 */
const serverError: RestAnswer = { body: { message: 'Server Error' }, status: 500 };

/**
 * The reasons a request was refused, collected while it is answered.
 */
type Refusals = string[];

/**
 * Resolves only what a world defines: a property is the field's value and a
 * function is called with the field's arguments. Anything else is an error
 * GitHub could have sent, with the field recorded as refused.
 */
const fieldResolver: GraphQLFieldResolver<unknown, Refusals> = (source, args, refusals, info) => {
  if (typeof source === 'object' && source !== null && Object.hasOwn(source, info.fieldName)) {
    const value: unknown = Reflect.get(source, info.fieldName);
    return typeof value === 'function' ? Reflect.apply(value, source, [args]) : value;
  }

  refusals.push(`no model for GraphQL field ${info.parentType.name}.${info.fieldName}`);
  throw new GraphQLError(githubBugMessage);
};

const send = (res: ServerResponse, answer: RestAnswer): void => {
  res.writeHead(answer.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(answer.body));
};

const tokenPattern = /^token (?<token>.+)$/v;

/**
 * The caller the token gh sent names, if it names one.
 */
const callerFrom = (req: IncomingMessage): Caller | undefined => {
  const match = tokenPattern.exec(req.headers.authorization ?? '');
  const token = match?.groups?.['token'];
  return token === undefined ? undefined : callerOf(token);
};

const VariablesSchema = v.record(v.string(), v.unknown());

const GraphqlRequestSchema = v.object({
  query: v.string(),
  variables: v.optional(VariablesSchema, {}),
});

/**
 * Answers a GraphQL request from `world`, validated as GitHub validates it.
 */
const answerGraphql = async (
  body: string,
  world: World,
  refusals: Refusals,
): Promise<RestAnswer> => {
  const request = v.parse(GraphqlRequestSchema, JSON.parse(body));
  const schema = githubSchema();
  const document = parse(request.query);
  const errors = validate(schema, document, githubRules);
  if (errors.length > 0) return { body: { errors }, status: 200 };

  const result = await execute({
    contextValue: refusals,
    document,
    fieldResolver,
    rootValue: world.graphql,
    schema,
    variableValues: request.variables,
  });
  return { body: result, status: 200 };
};

/**
 * Answers a REST request from `world`.
 *
 * An unmodelled route is a server error rather than a 404: gh reads a 404 as
 * an answer in places — deleting a branch that 404s counts as already deleted
 * — so a route nobody modelled would pass for success there.
 */
const answerRest = (request: RestRequest, world: World, refusals: Refusals): RestAnswer => {
  const modelled = world.rest?.(request);
  if (modelled !== undefined) return modelled;
  refusals.push(`no model for REST route ${request.method} ${request.path}`);
  return serverError;
};

const answer = async (
  req: IncomingMessage,
  caller: Caller | undefined,
  options: FakeGitHubOptions,
  refusals: Refusals,
): Promise<RestAnswer> => {
  // Proxied requests arrive with an absolute URL; anything else has none.
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? apiHost}`);
  if (url.host !== apiHost) {
    refusals.push(`request to a host other than ${apiHost}: ${url.host}`);
    return { body: { message: 'Forbidden' }, status: 403 };
  }

  const world = caller === undefined ? undefined : options.worlds(caller.world);
  if (world === undefined)
    return {
      body: { documentation_url: 'https://docs.github.com/rest', message: 'Bad credentials' },
      status: 401,
    };

  const body = await text(req);
  const method = req.method ?? 'GET';

  if (method === 'POST' && url.pathname === '/graphql')
    return answerGraphql(body, world, refusals);

  return answerRest({ body, method, path: url.pathname }, world, refusals);
};

/**
 * Records each refusal in the caller's run log, the way a stub records its
 * own. A caller outside a run records nothing, as a stub outside one does.
 */
const recordRefusals = (
  caller: Caller | undefined,
  refusals: Refusals,
  options: FakeGitHubOptions,
): void => {
  const logDir = (options.logDir ?? (() => process.env['STUB_LOG_DIR']))();
  if (logDir === undefined || logDir === '' || caller?.run === undefined) return;
  for (const refusal of refusals)
    appendJsonl(runLogPath(logDir, caller.run), { argv: caller.argv, cmd: 'gh', refusal });
};

/**
 * Answers one request. Never rejects: a fault in the fake is a 500, recorded
 * as a refusal, rather than a dropped connection gh retries.
 */
const respond = async (
  req: IncomingMessage,
  res: ServerResponse,
  options: FakeGitHubOptions,
): Promise<void> => {
  const caller = callerFrom(req);
  const refusals: Refusals = [];
  try {
    send(res, await answer(req, caller, options, refusals));
  } catch (error) {
    refusals.push(`fault answering ${req.method ?? 'GET'} ${req.url ?? '/'}: ${String(error)}`);
    send(res, serverError);
  }
  recordRefusals(caller, refusals, options);
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
