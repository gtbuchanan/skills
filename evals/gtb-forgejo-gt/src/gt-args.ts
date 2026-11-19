/*
 * How the gt double reads a command line: flags, the body and method a `gt api`
 * call sends, the endpoint it names, and how an `auth login` authenticates.
 *
 * Pure so it can be tested in-process; the double supplies argv and the reader
 * for `@file`, `@-` and `--input` sources. Follows gt 2.0.0's `api --help` and
 * what its `--dry-run` printed, down to the wording of its refusals.
 *
 * Loaded by the double under plain `node`, so everything here stays erasable
 * syntax.
 */
import * as v from 'valibot';

export interface ParsedArgs {
  readonly flags: Readonly<Record<string, readonly string[]>>;
  readonly positionals: readonly string[];
}

/**
 * Reads a source given what names it: a path, or `-` for standard input.
 */
export type ReadSource = (source: string) => string;

/**
 * How an `auth login` authenticates, or `none` for any other command.
 */
export type LoginMethod = 'none' | 'oauth' | 'ssh-agent-key' | 'ssh-key' | 'token';

/*
 * gt's global flags that take a value, and the repository selectors every
 * repository command shares.
 */
const globalValueFlags = {
  '--cwd': 'cwd',
  '--host': 'host',
  '--jq': 'jq',
  '--json': 'json',
  '--remote': 'remote',
  '--repo': 'repo',
  '--sudo': 'sudo',
  '--template': 'template',
  '--user': 'user',
  '-R': 'repo',
};

/**
 * `gt api`'s flags that take a value, by spelling. `-F` is `--field` here and
 * `--body-file` under `pr review`, which is why the table is per command.
 */
export const apiValueFlags: Readonly<Record<string, string>> = {
  ...globalValueFlags,
  '--field': 'field',
  '--header': 'header',
  '--input': 'input',
  '--max-pages': 'max-pages',
  '--method': 'method',
  '--output-file': 'output-file',
  '--raw-field': 'raw-field',
  '-F': 'field',
  '-H': 'header',
  '-X': 'method',
  '-f': 'raw-field',
};

/**
 * The value flags of the `pr`, `run` and `auth status` commands the double
 * answers.
 */
export const commandValueFlags: Readonly<Record<string, string>> = {
  ...globalValueFlags,
  '--body': 'body',
  '--body-file': 'body-file',
  '--comments-file': 'comments-file',
  '--commit': 'commit',
  '--interval': 'interval',
  '--limit': 'limit',
  '--page': 'page',
  '--state': 'state',
  '--timeout': 'timeout',
  '-F': 'body-file',
  '-L': 'limit',
  '-b': 'body',
};

/**
 * `gt auth login`'s flags that take a value, by spelling.
 */
export const authLoginValueFlags: Readonly<Record<string, string>> = {
  ...globalValueFlags,
  '--client-cert': 'client-cert',
  '--client-id': 'client-id',
  '--client-key': 'client-key',
  '--credential-store': 'credential-store',
  '--header': 'header',
  '--scopes': 'scopes',
  '--ssh-agent-key': 'ssh-agent-key',
  '--ssh-agent-principal': 'ssh-agent-principal',
  '--ssh-key': 'ssh-key',
};

/**
 * Splits argv into flags, keyed by canonical name, and positionals. A flag not
 * in `valueFlags` is a boolean and records an empty value.
 */
export const parseArgs = (
  argv: readonly string[],
  valueFlags: Readonly<Record<string, string>>,
): ParsedArgs => {
  const flags: Record<string, string[]> = {};
  const positionals: string[] = [];
  const record = (name: string, value: string): void => {
    (flags[name] ??= []).push(value);
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '-' || !arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }
    const equals = arg.indexOf('=');
    const spelling = equals === -1 ? arg : arg.slice(0, equals);
    const name = valueFlags[spelling];
    if (name === undefined) {
      record(spelling.replace(/^-+/v, ''), '');
    } else if (equals === -1) {
      index += 1;
      record(name, argv[index] ?? '');
    } else {
      record(name, arg.slice(equals + 1));
    }
  }

  return { flags, positionals };
};

const splitPair = (pair: string): readonly [string, string] => {
  const equals = pair.indexOf('=');
  if (equals === -1) throw new Error(`field "${pair}" is not name=value`);
  return [pair.slice(0, equals), pair.slice(equals + 1)];
};

const parseJson = (raw: string): unknown => {
  const parsed: unknown = JSON.parse(raw);
  return parsed;
};

/**
 * A `-F` value, typed as `gt api --help` describes: true, false, null, numbers,
 * arrays and objects are the JSON they spell, `@FILE` and `@-` read a source,
 * and anything else is a string.
 */
const typedValue = (raw: string, read: ReadSource): unknown => {
  if (raw.startsWith('@')) return read(raw.slice(1));
  try {
    return parseJson(raw);
  } catch {
    return raw;
  }
};

const BodySchema = v.record(v.string(), v.unknown());

/**
 * The JSON body the call would send, or `undefined` when it sends none.
 */
export const requestBody = (
  flags: ParsedArgs['flags'],
  read: ReadSource,
): Readonly<Record<string, unknown>> | undefined => {
  const input = flags['input']?.at(-1);
  const strings = flags['raw-field'] ?? [];
  const typed = flags['field'] ?? [];
  const hasFields = strings.length > 0 || typed.length > 0;

  if (input !== undefined) {
    if (hasFields) throw new Error('--input cannot be combined with API fields');
    return v.parse(BodySchema, parseJson(read(input)));
  }
  if (!hasFields) return undefined;

  return Object.fromEntries([
    ...strings.map(splitPair),
    ...typed.map((pair): readonly [string, unknown] => {
      const [key, raw] = splitPair(pair);
      return [key, typedValue(raw, read)];
    }),
  ]);
};

/**
 * The method the call sends: `-X` when given, else POST with a body and GET
 * without one.
 */
export const requestMethod = (
  flags: ParsedArgs['flags'],
  body: Readonly<Record<string, unknown>> | undefined,
): string =>
  (flags['method']?.at(-1) ?? (body === undefined ? 'GET' : 'POST')).toUpperCase();

const apiPrefix = /^(?:https?:\/\/[^\/]+)?\/?(?:api\/v1\/)?/v;

/**
 * The endpoint as a path under `/api/v1/`, query dropped and placeholders
 * filled from `--repo`. The workspace is never a checkout, so `--repo` is the
 * only source gt would have.
 */
export const endpointPath = (raw: string, repo: string | undefined): string => {
  const path = raw.replace(apiPrefix, '').replace(/\?.*$/v, '');
  if (!path.includes('{owner}') && !path.includes('{repo}')) return path;

  const [owner, name] = repo?.split('/') ?? [];
  if (owner === undefined || name === undefined)
    throw new Error('repository required: use --repo owner/name');
  return path.replaceAll('{owner}', () => owner).replaceAll('{repo}', () => name);
};

/*
 * The method flags, in the order a login with several would be read. gt
 * refuses more than one, so the order only decides which a malformed call is
 * reported under.
 */
const methodFlags: readonly (readonly [string, LoginMethod])[] = [
  ['ssh-agent-key', 'ssh-agent-key'],
  ['ssh-key', 'ssh-key'],
  ['with-token', 'token'],
  ['oauth', 'oauth'],
];

/**
 * How an `auth login` authenticates, read from its flags.
 */
export const loginMethod = ([command, action, ...rest]: readonly string[]): LoginMethod => {
  if (command !== 'auth' || action !== 'login') return 'none';
  const { flags } = parseArgs(rest, authLoginValueFlags);
  return methodFlags.find(([flag]) => flags[flag] !== undefined)?.[1] ?? 'none';
};
