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
 * What the fake cannot answer it refuses twice over. gh gets an error GitHub
 * itself could send, so nothing an agent reads says it is talking to a
 * double. The calling run's log gets the refusal, naming the field or route,
 * beside the call that reached it, which is where a suite reports what its
 * doubles refused. The caller and its run travel in the token gh sends; see
 * caller.ts.
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
import type {
  DocumentNode,
  GraphQLFieldResolver,
  GraphQLFormattedError,
  GraphQLSchema,
} from 'graphql';
import * as v from 'valibot';
import { callerOf } from './caller.ts';
import type { Caller } from './caller.ts';
import { GitHubError } from './world.ts';
import type { RestAnswer, RestRequest, World } from './world.ts';

export interface FakeGitHub {
  readonly close: () => Promise<void>;
  readonly port: number;
}

export interface FakeGitHubOptions {
  /**
   * Where run logs are kept, read each time a refusal is recorded:
   * `STUB_LOG_DIR` unless given. Unset, refusals are recorded nowhere.
   */
  readonly logDir?: () => string | undefined;
  /**
   * The world a caller names, or `undefined` for a key naming none.
   */
  readonly worlds: (key: string) => World | undefined;
}

/**
 * The host gh sends API calls to for `github.localhost`.
 */
const apiHost = 'api.github.localhost';

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
 * GitHub's published schema, built once: it is large, and building it is the
 * slowest thing the fake does.
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
 * Resolves only what a world defines: a property is the field's value and a
 * function is called with the field's arguments. Anything else is the error
 * GitHub sends when it fails, with the field recorded as refused.
 */
const fieldResolver: GraphQLFieldResolver<unknown, Refusals> = (
  source,
  args,
  refusals,
  info,
) => {
  if (typeof source === 'object' && source !== null && Object.hasOwn(source, info.fieldName)) {
    const value: unknown = Reflect.get(source, info.fieldName);
    return typeof value === 'function' ? Reflect.apply(value, source, [args]) : value;
  }

  refusals.push(`no model for GraphQL field ${info.parentType.name}.${info.fieldName}`);
  throw new UnmodelledField(githubBugMessage);
};

/**
 * The error the fake answers a field a world does not model with, already
 * recorded as a refusal by the time anyone sees it.
 */
class UnmodelledField extends GraphQLError {}

/**
 * Whether an execution error is one the fake or the world meant to send.
 */
const isIntended = (error: GraphQLError): boolean =>
  error.cause instanceof GitHubError || error.cause instanceof UnmodelledField;

/**
 * An execution error as GitHub would send it: as written where the world or
 * the fake meant it, and otherwise the error GitHub sends when it fails, with
 * the fault recorded. That covers a world that threw, and the errors
 * graphql-js raises for a world's answer: a null on a non-null field, an
 * object of an abstract type with no `__typename`.
 */
const asGitHubSends = (error: GraphQLError, refusals: Refusals): GraphQLError => {
  if (isIntended(error)) return error;
  /* v8 ignore next -- An error raised while executing always carries its path;
     the fallback is only there because the type allows undefined. */
  const path = (error.path ?? []).join('.');
  refusals.push(`fault answering GraphQL ${path}: ${error.message}`);
  return new GraphQLError(githubBugMessage, {
    nodes: error.nodes,
    path: error.path,
    positions: error.positions,
    source: error.source,
  });
};

const tokenPattern = /^token (?<token>.+)$/v;

/**
 * The caller the token gh sent names, if it names one.
 */
const callerFrom = (req: IncomingMessage): Caller | undefined => {
  const token = tokenPattern.exec(req.headers.authorization ?? '')?.groups?.['token'];
  return token === undefined ? undefined : callerOf(token);
};

const VariablesSchema = v.record(v.string(), v.unknown());

/*
 * go-gh sends `"variables": null` for a query given none, so null is as
 * absent as a missing key.
 */
const GraphqlRequestSchema = v.object({
  operationName: v.nullish(v.string()),
  query: v.string(),
  variables: v.nullish(VariablesSchema, {}),
});

/**
 * The document a query names, or the syntax error GitHub would answer with.
 */
const parsed = (query: string): DocumentNode | GraphQLError => {
  try {
    return parse(query);
  } catch (error) {
    /* v8 ignore if -- graphql-js reports every syntax error as a GraphQLError;
       anything else would be its bug, not the caller's. */
    if (!(error instanceof GraphQLError)) throw error;
    return error;
  }
};

/**
 * An error as it goes on the wire, with GitHub's `type` beside the message
 * where the world gave one: graphql-js serializes only the standard fields.
 */
const sent = (error: GraphQLError): GraphQLFormattedError & { readonly type?: string } => {
  const type = error.cause instanceof GitHubError ? error.cause.type : undefined;
  return type === undefined ? error.toJSON() : { ...error.toJSON(), type };
};

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
  /* A query that does not parse or validate is the caller's mistake, which
     GitHub answers as a 200 carrying the errors, not a gap in the world. */
  const document = parsed(request.query);
  if (document instanceof GraphQLError) return { body: { errors: [document] }, status: 200 };
  const errors = validate(schema, document, githubRules);
  if (errors.length > 0) return { body: { errors }, status: 200 };

  const result = await execute({
    contextValue: refusals,
    document,
    fieldResolver,
    operationName: request.operationName,
    rootValue: world.graphql,
    schema,
    variableValues: request.variables,
  });
  const answered = result.errors === undefined
    ? result
    : { ...result, errors: result.errors.map(error => sent(asGitHubSends(error, refusals))) };
  return { body: answered, status: 200 };
};

/**
 * Answers a REST request from `world`.
 *
 * An unmodelled route is a server error rather than a 404: gh reads a 404 as
 * an answer in places, and deleting a branch that 404s counts as already
 * deleted, so a route nobody modelled would pass for success there.
 */
const answerRest = (request: RestRequest, world: World, refusals: Refusals): RestAnswer => {
  const modelled = world.rest?.(request);
  if (modelled !== undefined) return modelled;
  refusals.push(`no model for REST route ${request.method} ${request.path}`);
  return serverError;
};

/**
 * The method and URL a request names.
 */
interface Target {
  readonly method: string;
  readonly url: URL;
}

/**
 * Reads a request's target. Proxied requests arrive with an absolute URL;
 * anything else is resolved against its Host header.
 */
const targetOf = (req: IncomingMessage): Target => {
  /* v8 ignore next -- Node sets the method and URL of every request a server
     receives, and HTTP/1.1 requires a Host header: the fallbacks are only
     there because the types allow undefined. */
  return { method: req.method ?? 'GET', url: new URL(req.url ?? '/', `http://${req.headers.host ?? apiHost}`) };
};

/**
 * What the fake reads from a request before answering it: who sent it, and
 * what it asks for.
 */
interface Received {
  readonly caller: Caller | undefined;
  readonly target: Target;
}

const answer = async (
  req: IncomingMessage,
  { caller, target: { method, url } }: Received,
  options: FakeGitHubOptions,
  refusals: Refusals,
): Promise<RestAnswer> => {
  if (url.host !== apiHost) {
    refusals.push(`request to a host other than ${apiHost}: ${url.host}`);
    return { body: { message: 'Forbidden' }, status: 403 };
  }

  const world = caller === undefined ? undefined : options.worlds(caller.world);
  if (world === undefined) {
    /* A token naming a world that does not exist is the suite's mistake, and
       the agent sees only an auth failure, so the run log says which. */
    if (caller !== undefined) refusals.push(`no world named ${caller.world}`);
    return {
      body: { documentation_url: 'https://docs.github.com/rest', message: 'Bad credentials' },
      status: 401,
    };
  }

  const body = await text(req);
  return method === 'POST' && url.pathname === '/graphql'
    ? answerGraphql(body, world, refusals)
    : answerRest({ body, method, path: url.pathname }, world, refusals);
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
 * Writes `reply`, serialized before anything is sent: a body JSON cannot
 * carry throws here, while the response can still be answered with an error
 * instead.
 */
const send = (res: ServerResponse, reply: RestAnswer): void => {
  const body = JSON.stringify(reply.body);
  res.writeHead(reply.status, { 'content-type': 'application/json' });
  res.end(body);
};

/**
 * Answers one request. Never rejects: a fault in a world is a 500, recorded
 * as a refusal, rather than a dropped connection gh retries.
 */
const respond = async (
  req: IncomingMessage,
  res: ServerResponse,
  options: FakeGitHubOptions,
): Promise<void> => {
  const target = targetOf(req);
  const caller = callerFrom(req);
  const refusals: Refusals = [];
  try {
    send(res, await answer(req, { caller, target }, options, refusals));
  } catch (error) {
    refusals.push(`fault answering ${target.method} ${target.url.pathname}: ${String(error)}`);
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
  /* v8 ignore next -- A server listening on a TCP port reports an address
     object; the check narrows the type. */
  if (address === null || typeof address === 'string')
    throw new Error('the fake GitHub is not listening on a TCP port');

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
