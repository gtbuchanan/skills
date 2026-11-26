#!/usr/bin/env node
/*
 * Fake `gt` for the gtb-forgejo-gt eval, answering from the one Forgejo world
 * in `src/world.ts` with the output `src/responses.ts` builds. The runner
 * installs it as `gt` at the front of the eval PATH, and the real CLI is
 * unreachable.
 *
 * It answers the way gt 2.0.0 against Forgejo 17.0.1 does where the skill says
 * the two part from gh: `pr review reply`, `resolve` and `unresolve` reach
 * Gitea-only routes and get 405, `run view`, `run jobs` and `run logs` cannot
 * parse Forgejo's bare-array job list, the check links name the run's number
 * rather than its id, and a call without --host reaches gt's other login.
 * Those refusals are the world the skill describes, not gaps in the double.
 * Anything else unmodelled is refused by `dispatch`.
 *
 * A failed `auth login` is worded approximately. `--jq` is ignored and the
 * whole response printed, since the double has no jq; a run gets more output,
 * never less.
 *
 * A reply posted through `gt api` is recorded, parsed, beside the run's call
 * log, so the checker judges the body Forgejo would have received rather than
 * the spelling of the command that sent it.
 */
import { readFileSync } from 'node:fs';
import type { StubResponse } from '@gtbuchanan/cli-doubles/dispatch';
import { UnmodelledCall, dispatch } from '@gtbuchanan/cli-doubles/dispatch';
import { allOf, subcommand } from '@gtbuchanan/cli-doubles/match';
import { locateScenario } from '@gtbuchanan/cli-doubles/scenario';
import { appendJsonl, argv, emit, logCallToRun } from '@gtbuchanan/cli-doubles/stub';
import {
  apiValueFlags,
  authLoginValueFlags,
  commandValueFlags,
  endpointPath,
  loginMethod,
  parseArgs,
  requestBody,
  requestMethod,
} from '../src/gt-args.ts';
import type { LoginMethod, ParsedArgs } from '../src/gt-args.ts';
import { postedLogFor } from '../src/gt-check.ts';
import {
  authStatus,
  failure,
  noAccount,
  notFound,
  postedReply,
  pullChecks,
  pullView,
  reviewComments,
  reviewList,
  reviewRefusal,
  route,
  runList,
  text,
} from '../src/responses.ts';
import { scenarios } from '../src/scenarios.ts';
import { host, keyFingerprint, otherHost, pullIndex, repo } from '../src/world.ts';

const log = logCallToRun('gt');

/*
 * Whether gt has a login for the Forgejo instance yet. A call outside every
 * workspace has no world to say, and answers as if it had one.
 */
const hasLogin = ((): boolean => {
  try {
    return locateScenario(scenarios, process.cwd()).scenario.hasLogin;
  } catch {
    return true;
  }
})();

const readSource = (source: string): string =>
  readFileSync(source === '-' ? 0 : source, 'utf8');

/*
 * The instance a call reaches: its --host, else gt's other login, which is the
 * one it picks outside a checkout.
 */
const hostOf = (flags: ParsedArgs['flags']): string =>
  (flags['host']?.at(-1) ?? otherHost).replace(/\/+$/v, '');

const postReply = (body: Readonly<Record<string, unknown>>): StubResponse => {
  if (log !== undefined) appendJsonl(postedLogFor(log), body);
  return postedReply(body);
};

/*
 * What gt itself rejects before sending anything, a malformed body or an
 * unfillable placeholder, fails the call the way gt would; only a request it
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
  const [raw] = positionals;
  if (raw === undefined) return failure('accepts 1 arg(s), received 0');

  const request = prepared(() => {
    const body = requestBody(flags, readSource);
    return {
      body,
      endpoint: endpointPath(raw, flags['repo']?.at(-1)),
      method: requestMethod(flags, body),
    };
  });
  if (!('endpoint' in request)) return request;

  const instance = hostOf(flags);
  if (instance !== host) return notFound(request.method, request.endpoint, instance);
  if (!hasLogin) return noAccount();
  return route(request, postReply);
};

/*
 * A repository command outside a checkout needs -R, and reaches Forgejo only
 * with --host; gt's other login has no such repository.
 */
const repoCall = (
  respond: (flags: ParsedArgs['flags'], positionals: readonly string[]) => StubResponse,
): StubResponse => {
  const { flags, positionals } = parseArgs(argv, commandValueFlags);
  const target = flags['repo']?.at(-1);
  if (target === undefined) return failure('repository required: use --repo owner/name');
  if (target !== repo || hostOf(flags) !== host)
    return failure(`repository ${target} not found`);
  if (!hasLogin) return noAccount();
  return respond(flags, positionals);
};

/*
 * Answers for the one pull request the world holds, and gt's refusal for any
 * other number.
 */
const forPull = (number: string | undefined, respond: () => StubResponse): StubResponse => {
  const index = (number ?? '').replace(/^#/v, '');
  return index === String(pullIndex) ? respond() : failure(`pull request ${index} not found`);
};

/*
 * An agent-key login succeeds silently for the fingerprint the agent holds.
 * The other methods need what the harness cannot supply: a token on stdin, a
 * browser, or a key file.
 */
const loginAnswers: Readonly<Record<LoginMethod, (flags: ParsedArgs['flags']) => StubResponse>> = {
  'none': () =>
    failure(
      'gt auth login requires --with-token, --oauth or --ssh-key when it cannot ask on ' +
      'a terminal',
    ),
  'oauth': () => failure('cannot open a browser to authorize gt'),
  'ssh-agent-key': (flags) => {
    const fingerprint = flags['ssh-agent-key']?.at(-1) ?? '';
    return fingerprint === keyFingerprint
      ? text('')
      : failure(`ssh-agent holds no key ${fingerprint}`);
  },
  'ssh-key': flags => failure(`open ${flags['ssh-key']?.at(-1) ?? ''}: no such file or directory`),
  'token': () => failure('no access token on stdin'),
};

/*
 * The commands the double answers, as the words that name them. A command's
 * operands are whatever follows those words.
 */
const authLoginCommand = ['auth', 'login'];
const prReviewCommand = ['pr', 'review'];
const prReviewListCommand = ['pr', 'review', 'list'];
const prReviewCommentsCommand = ['pr', 'review', 'comments'];
const prViewCommand = ['pr', 'view'];
const prChecksCommand = ['pr', 'checks'];
const runListCommand = ['run', 'list'];
// Each reads the run's jobs, which Forgejo sends as a bare array gt cannot parse.
const runJobReaders = [['run', 'view'], ['run', 'jobs'], ['run', 'logs']];

const operandsAfter = (words: readonly string[], command: readonly string[]): string[] =>
  words.slice(command.length);

const authLogin = (): StubResponse => {
  const { flags } = parseArgs(operandsAfter(argv, authLoginCommand), authLoginValueFlags);
  return flags['host'] === undefined
    ? failure('gt auth login requires --host when it cannot ask on a terminal')
    : loginAnswers[loginMethod(argv)](flags);
};

const wordsOf = (call: { readonly argv: readonly string[] }): readonly string[] =>
  parseArgs(call.argv, commandValueFlags).positionals;

const commandIs = (command: readonly string[]) =>
  (call: { readonly argv: readonly string[] }): boolean => {
    const words = wordsOf(call);
    return command.every((word, index) => words[index] === word);
  };

const refusedReviewActions = new Set(['reply', 'resolve', 'unresolve']);
const isRefusedReview = (call: { readonly argv: readonly string[] }): boolean => {
  const [action = ''] = operandsAfter(wordsOf(call), prReviewCommand);
  return refusedReviewActions.has(action);
};

/*
 * A command on the world's one pull request, answered by `respond` with the
 * call's flags.
 */
const onPull = (
  command: readonly string[],
  respond: (flags: ParsedArgs['flags']) => StubResponse,
) => () =>
  repoCall((flags, words) => {
    const [number] = operandsAfter(words, command);
    return forPull(number, () => respond(flags));
  });

const outcome = dispatch({ argv, cmd: 'gt', stdin: '' }, [
  {
    matches: subcommand('auth', 'status'),
    name: 'auth status',
    respond: () => authStatus(hasLogin),
  },
  { matches: subcommand(...authLoginCommand), name: 'auth login', respond: authLogin },
  { matches: subcommand('api'), name: 'api', respond: api },
  {
    matches: allOf(commandIs(prReviewCommand), isRefusedReview),
    name: 'pr review reply/resolve',
    respond: () =>
      repoCall((_flags, words) => {
        const [action = '', number = '', comment = ''] = operandsAfter(words, prReviewCommand);
        return reviewRefusal(action, number, comment);
      }),
  },
  {
    matches: commandIs(prReviewListCommand),
    name: 'pr review list',
    respond: onPull(prReviewListCommand, reviewList),
  },
  {
    matches: commandIs(prReviewCommentsCommand),
    name: 'pr review comments',
    respond: onPull(prReviewCommentsCommand, reviewComments),
  },
  {
    matches: commandIs(prViewCommand),
    name: 'pr view',
    respond: onPull(prViewCommand, flags => pullView(flags['json']?.at(-1))),
  },
  {
    matches: allOf(commandIs(prChecksCommand), call => !call.argv.includes('--watch')),
    name: 'pr checks',
    respond: onPull(prChecksCommand, pullChecks),
  },
  {
    matches: call => runJobReaders.some(command => commandIs(command)(call)),
    name: 'run view/jobs/logs',
    respond: () => repoCall(() => failure('Gitea returned an invalid JSON response')),
  },
  { matches: commandIs(runListCommand), name: 'run list', respond: () => repoCall(runList) },
]);

emit(outcome, log);
