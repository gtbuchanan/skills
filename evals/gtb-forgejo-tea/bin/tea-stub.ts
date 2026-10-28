#!/usr/bin/env node
/*
 * Fake `tea` for the gtb-forgejo-tea eval, answering from the one Forgejo world
 * in `src/world.ts`. The runner installs it as `tea` at the front of the eval
 * PATH, and the real CLI is unreachable.
 *
 * It answers the way tea 0.16.0 against Forgejo 16.0.6 does where the skill
 * says the two part from gh: the Gitea-only routes answer 405, `--json` is an
 * undefined flag, and a call outside a checkout without `--repo` fails. Those
 * refusals are the world the skill describes, not gaps in the double. Anything
 * else unmodelled is refused by `dispatch`.
 *
 * A reply posted through `tea api` is recorded, parsed, beside the call log, so
 * the checker judges the body Forgejo would have received rather than the
 * spelling of the command that sent it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { StubResponse } from '@gtbuchanan/stub-runtime/dispatch';
import { UnmodelledCall, dispatch, unmodelled } from '@gtbuchanan/stub-runtime/dispatch';
import { allOf, argument, subcommand } from '@gtbuchanan/stub-runtime/match';
import { locateScenario } from '@gtbuchanan/stub-runtime/scenario';
import { appendJsonl, argv, emit, logCallToScenario } from '@gtbuchanan/stub-runtime/stub';
import { scenarios } from '../src/scenarios.ts';
import {
  apiValueFlags,
  endpointPath,
  isOAuthLogin,
  parseArgs,
  pullsValueFlags,
  requestBody,
} from '../src/tea-args.ts';
import type { ParsedArgs } from '../src/tea-args.ts';
import {
  combinedStatus,
  headSha,
  host,
  login,
  pull,
  pullIndex,
  repo,
  review,
  reviewComment,
} from '../src/world.ts';

logCallToScenario('tea', scenarios);

/*
 * Whether tea has a login for the instance yet. A call outside every workspace
 * has no world to say, and answers as if it had one.
 */
const hasLogin = ((): boolean => {
  try {
    return locateScenario(scenarios, process.cwd()).scenario.hasLogin;
  } catch {
    return true;
  }
})();

/**
 * tea pretty-prints the JSON it relays.
 */
const jsonIndent = 2;

const json = (body: unknown): StubResponse => ({
  stdout: `${JSON.stringify(body, undefined, jsonIndent)}\n`,
});

const failure = (message: string): StubResponse => ({
  code: 1,
  stderr: `Error: ${message}\n`,
});

const methodNotAllowed = (method: string, endpoint: string): StubResponse =>
  failure(
    `unknown API error: 405\nRequest: '/api/v1/${endpoint}' with '${method}' ` +
    "method and '' body",
  );

/*
 * Without a checkout tea cannot infer a login, so it warns and falls back to
 * its first. The fallback happens to be right here; the warning is what a run
 * that skipped `--login` sees.
 */
const loginWarning = (flags: ParsedArgs['flags']): string =>
  flags['login'] === undefined
    ? `NOTE: no login matched this repository, falling back to login '${login}' ` +
    'in non-interactive mode.\n'
    : '';

const withWarning = (
  flags: ParsedArgs['flags'],
  response: StubResponse,
): StubResponse => ({
  ...response,
  stderr: loginWarning(flags) + (response.stderr ?? ''),
});

const readSource = (source: string): string =>
  readFileSync(source === '-' ? 0 : source, 'utf8');

const repoPath = `repos/${repo}`;
const pullPath = `${repoPath}/pulls/${String(pullIndex)}`;
const reviewPath = `${pullPath}/reviews/${String(review.id)}`;
const statusRefs = new Set([headSha, pull.head.ref]);

/*
 * The parsed body of a reply, kept beside the call log for the checker.
 */
const recordReply = (body: Readonly<Record<string, unknown>>): void => {
  const logDir = process.env['STUB_LOG_DIR'];
  if (logDir === undefined) return;
  const { scenario } = locateScenario(scenarios, process.cwd());
  appendJsonl(path.join(logDir, `${scenario.key}.posted.jsonl`), body);
};

const readRoutes: Readonly<Record<string, () => unknown>> = {
  [pullPath]: () => pull,
  [`${pullPath}/reviews`]: () => [review],
  [reviewPath]: () => review,
  [`${reviewPath}/comments`]: () => [reviewComment],
};

const statusResponse = (endpoint: string): StubResponse | undefined => {
  const match = new RegExp(
    String.raw`^${repoPath}/commits/(?<ref>[^\/]+)/(?<kind>status|statuses)$`,
    'v',
  ).exec(endpoint);
  const ref = match?.groups?.['ref'];
  if (ref === undefined) return undefined;
  if (!statusRefs.has(ref)) return failure('404 Not Found');
  return json(
    match?.groups?.['kind'] === 'status' ? combinedStatus : combinedStatus.statuses,
  );
};

const gitOnlyRoute = new RegExp(
  String.raw`^${pullPath}/comments/\d+/replies$|^${repoPath}/pulls/comments/\d+/(?:un)?resolve$`,
  'v',
);

const readRoute = (endpoint: string): StubResponse => {
  const read = readRoutes[endpoint];
  const response = read === undefined ? statusResponse(endpoint) : json(read());
  if (response === undefined) throw unmodelled(`no GET ${endpoint}`);
  return response;
};

const postReply = (body: Readonly<Record<string, unknown>>): StubResponse => {
  recordReply(body);
  return json({
    body: body['body'],
    id: reviewComment.id + 1,
    path: body['path'],
    position: body['new_position'],
    pull_request_review_id: review.id,
  });
};

/**
 * Answers a request tea would send.
 */
const route = (
  method: string,
  endpoint: string,
  body: Readonly<Record<string, unknown>> | undefined,
): StubResponse => {
  if (gitOnlyRoute.test(endpoint)) return methodNotAllowed(method, endpoint);
  if (method === 'GET') return readRoute(endpoint);
  if (body !== undefined && method === 'POST' && endpoint === `${reviewPath}/comments`)
    return postReply(body);
  throw unmodelled(`no ${method} ${endpoint}`);
};

/*
 * What tea itself rejects before sending anything, a malformed body or an
 * unfillable placeholder, fails the call the way tea would; only a request it
 * would send reaches the routes.
 */
const prepared = <T>(build: () => T): T | StubResponse => {
  try {
    return build();
  } catch (error) {
    if (error instanceof UnmodelledCall || !(error instanceof Error)) throw error;
    return failure(error.message);
  }
};

const api = (): StubResponse => {
  const { flags, positionals } = parseArgs(argv.slice(1), apiValueFlags);
  const raw = positionals[0];
  if (raw === undefined) return failure('missing endpoint');

  const request = prepared(() => ({
    body: requestBody(flags, readSource),
    endpoint: endpointPath(raw, flags['repo']?.[0]),
  }));
  if (!('endpoint' in request)) return withWarning(flags, request);
  const { body, endpoint } = request;
  const method = (flags['method']?.[0] ?? (body === undefined ? 'GET' : 'POST'))
    .toUpperCase();

  return withWarning(flags, route(method, endpoint, body));
};

const pullsEntities = new Set(['pr', 'pull', 'pulls']);
const isPulls = (call: { readonly argv: readonly string[] }): boolean =>
  pullsEntities.has(call.argv[0] ?? '');

/*
 * The first positional after the entity: an action, an index, or nothing for
 * the list. Flags may come before it.
 */
const pullsTarget = (call: { readonly argv: readonly string[] }): string | undefined =>
  parseArgs(call.argv.slice(1), pullsValueFlags).positionals[0];

/*
 * A pulls command outside a checkout needs `--repo`, or tea has nothing to
 * resolve the index against.
 */
const pullsCall = (
  respond: (flags: ParsedArgs['flags'], positionals: readonly string[]) => StubResponse,
): StubResponse => {
  const { flags, positionals } = parseArgs(argv.slice(1), pullsValueFlags);
  if (flags['repo'] === undefined)
    return withWarning(flags, failure(
      'remote repository required: specify id via --repo or execute from a local git repo',
    ));
  if (flags['repo'][0] !== repo) return withWarning(flags, failure('404 Not Found'));
  return withWarning(flags, respond(flags, positionals));
};

/*
 * A single pull ignores `--fields` and carries no CI status, the gap the skill
 * routes around.
 */
const pullDetail = (flags: ParsedArgs['flags']): StubResponse => {
  if (flags['output']?.[0] !== 'json') {
    const heading = `#${String(pull.number)} ${pull.title} (${pull.state})`;
    return { stdout: `${heading}\n${pull.head.ref} → ${pull.base.ref}\n` };
  }
  return json({
    base: pull.base.ref,
    head: pull.head.ref,
    headSha: pull.head.sha,
    index: pull.number,
    state: pull.state,
    title: pull.title,
    url: pull.html_url,
  });
};

const statusMark = (state: string): string => (state === 'success' ? '✅' : '❌');

/*
 * The list's fields as `--fields` names them. In JSON `ci` is only the combined
 * state; the table names each context, which is how a run reading it finds the
 * failing check.
 */
const listFields = (isJson: boolean): Readonly<Record<string, string>> => ({
  base: pull.base.ref,
  ci: isJson
    ? combinedStatus.state
    : combinedStatus.statuses
        .map(status => `${statusMark(status.state)} ${status.context}`)
        .join(' '),
  head: pull.head.ref,
  index: String(pull.number),
  state: pull.state,
  title: pull.title,
  url: pull.html_url,
});

const pullList = (flags: ParsedArgs['flags']): StubResponse => {
  const isJson = flags['output']?.[0] === 'json';
  const fields = listFields(isJson);
  const requested = (flags['fields']?.[0] ?? 'index,title,state').split(',');
  const row = requested.map((field): [string, string] => {
    const value = fields[field];
    if (value === undefined) throw unmodelled(`pull field "${field}"`);
    return [field, value];
  });
  if (isJson) return json([Object.fromEntries(row)]);
  const header = requested.map(field => field.toUpperCase()).join(' | ');
  return { stdout: `| ${header} |\n| ${row.map(([, value]) => value).join(' | ')} |\n` };
};

const loginEntities = new Set(['login', 'logins']);
const isLogin = (call: { readonly argv: readonly string[] }): boolean =>
  loginEntities.has(call.argv[0] ?? '');

const outcome = dispatch({ argv, cmd: 'tea', stdin: '' }, [
  {
    matches: argument(/^--(?:json|jq)(?:=|$)/v),
    name: 'undefined output flag',
    respond: (call) => {
      const flag = call.argv.find(arg => /^--(?:json|jq)/v.test(arg)) ?? '';
      const name = flag.replaceAll(/^--|=.*$/gv, '');
      return { code: 1, stderr: `flag provided but not defined: -${name}\n` };
    },
  },
  {
    matches: call => isLogin(call) && call.argv[1] === 'add',
    name: 'login add',
    /*
     * OAuth completes in the user's browser. Any other flag switches tea out
     * of its prompt, and then it needs a token or a password on the line.
     */
    respond: (call) => {
      if (isOAuthLogin(call.argv))
        return { stdout: `Login as ${login} on ${host} successful\n` };
      return failure(
        call.argv.some(arg => arg.startsWith('-'))
          ? 'no access token or user/password given'
          : 'interactive login needs a terminal',
      );
    },
  },
  {
    matches: call => isLogin(call) && ['list', 'ls', undefined].includes(call.argv[1]),
    name: 'login list',
    respond: () => ({
      stdout:
        '| NAME | URL | SSHHOST | USER | DEFAULT |\n' +
        (hasLogin ? `| ${login} | ${host} | forgejo.example.com | agent | true |\n` : ''),
    }),
  },
  {
    matches: call => !hasLogin && !isLogin(call),
    name: 'no login yet',
    respond: () => failure("no gitea login configured, run 'tea login add'"),
  },
  {
    matches: subcommand('whoami'),
    name: 'whoami',
    respond: call =>
      call.argv.length > 1
        ? { code: 1, stderr: `flag provided but not defined: ${call.argv[1] ?? ''}\n` }
        : { stdout: 'agent\n' },
  },
  { matches: subcommand('api'), name: 'api', respond: api },
  {
    matches: allOf(
      isPulls,
      call => ['reply', 'resolve', 'unresolve'].includes(pullsTarget(call) ?? ''),
    ),
    name: 'pulls reply/resolve',
    respond: () =>
      pullsCall((_flags, [action, first, second]) =>
        methodNotAllowed(
          'POST',
          action === 'reply'
            ? `${pullPath}/comments/${second ?? ''}/replies`
            : `${repoPath}/pulls/comments/${first ?? ''}/${action ?? ''}`,
        ),
      ),
  },
  {
    matches: allOf(isPulls, call => pullsTarget(call) === String(pullIndex)),
    name: 'pulls detail',
    respond: () => pullsCall(pullDetail),
  },
  {
    matches: allOf(isPulls, call => [undefined, 'list', 'ls'].includes(pullsTarget(call))),
    name: 'pulls list',
    respond: () => pullsCall(pullList),
  },
]);

emit(outcome);
