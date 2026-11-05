/*
 * How the tea double reads a command line: flags, the body a `tea api` call
 * sends, and the endpoint it names.
 *
 * Pure so it can be tested in-process; the double supplies argv and the reader
 * for `@file` and `@-` sources. Follows `tea api --help` (tea 0.16.0) wherever
 * the two could differ.
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
 * Reads a `@`-prefixed source, given what followed the `@`: a path, or `-` for
 * standard input.
 */
export type ReadSource = (source: string) => string;

const sharedValueFlags = {
  '--login': 'login',
  '--output': 'output',
  '--remote': 'remote',
  '--repo': 'repo',
  '-R': 'remote',
  '-l': 'login',
  '-o': 'output',
  '-r': 'repo',
};

/**
 * `tea api`'s flags that take a value, by spelling. `-f` is `--field` here and
 * `--fields` under `pulls`, which is why the table is per command.
 */
export const apiValueFlags: Readonly<Record<string, string>> = {
  ...sharedValueFlags,
  '--Field': 'Field',
  '--data': 'data',
  '--field': 'field',
  '--header': 'header',
  '--method': 'method',
  '-F': 'Field',
  '-H': 'header',
  '-X': 'method',
  '-d': 'data',
  '-f': 'field',
};

export const pullsValueFlags: Readonly<Record<string, string>> = {
  ...sharedValueFlags,
  '--fields': 'fields',
  '--limit': 'limit',
  '--lm': 'limit',
  '--page': 'page',
  '--state': 'state',
  '-f': 'fields',
  '-p': 'page',
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

/**
 * `tea login add`'s flags that take a value, by spelling.
 */
const loginAddValueFlags: Readonly<Record<string, string>> = {
  '--client-id': 'client-id',
  '--name': 'name',
  '--otp': 'otp',
  '--password': 'password',
  '--pwd': 'password',
  '--redirect-url': 'redirect-url',
  '--scopes': 'scopes',
  '--ssh-agent-key': 'ssh-agent-key',
  '--ssh-agent-principal': 'ssh-agent-principal',
  '--ssh-key': 'ssh-key',
  '--token': 'token',
  '--url': 'url',
  '--user': 'user',
  '-a': 'ssh-agent-key',
  '-c': 'ssh-agent-principal',
  '-n': 'name',
  '-s': 'ssh-key',
  '-t': 'token',
  '-u': 'url',
};

const loginEntities = new Set(['login', 'logins']);

/**
 * Whether argv adds a login through tea's OAuth flow.
 */
export const isOAuthLogin = ([entity, action, ...rest]: readonly string[]): boolean => {
  if (action !== 'add' || !loginEntities.has(entity ?? '')) return false;
  const { flags } = parseArgs(rest, loginAddValueFlags);
  return flags['oauth'] !== undefined || flags['o'] !== undefined;
};

const splitPair = (pair: string): readonly [string, string] => {
  const equals = pair.indexOf('=');
  if (equals === -1) throw new Error(`field "${pair}" is not key=value`);
  return [pair.slice(0, equals), pair.slice(equals + 1)];
};

const quoted = /^"(?<inner>.*)"$/v;

const parseJson = (raw: string): unknown => {
  const parsed: unknown = JSON.parse(raw);
  return parsed;
};

/**
 * A `-F` value, typed as `tea api --help` describes: numbers, booleans, null,
 * arrays and objects are the JSON literals they spell, and anything else, or
 * anything quoted, is a string.
 */
const typedValue = (raw: string, read: ReadSource): unknown => {
  if (raw.startsWith('@')) return read(raw.slice(1));
  const inner = quoted.exec(raw)?.groups?.['inner'];
  if (inner !== undefined) return inner;
  try {
    return parseJson(raw);
  } catch {
    return raw;
  }
};

const BodySchema = v.record(v.string(), v.unknown());

const dataBody = (
  raw: string,
  read: ReadSource,
): Readonly<Record<string, unknown>> => {
  const text = raw.startsWith('@') ? read(raw.slice(1)) : raw;
  return v.parse(BodySchema, parseJson(text));
};

/**
 * The JSON body the call would send, or `undefined` when it sends none.
 */
export const requestBody = (
  flags: ParsedArgs['flags'],
  read: ReadSource,
): Readonly<Record<string, unknown>> | undefined => {
  const data = flags['data']?.at(-1);
  const strings = flags['field'] ?? [];
  const typed = flags['Field'] ?? [];
  const hasFields = strings.length > 0 || typed.length > 0;

  if (data !== undefined) {
    if (hasFields) throw new Error('the -d flag cannot be combined with -f or -F');
    return dataBody(data, read);
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

const apiPrefix = /^(?:https?:\/\/[^\/]+)?\/?(?:api\/v1\/)?/v;

/**
 * The endpoint as a path under `/api/v1/`, query dropped and placeholders
 * filled from `--repo`.
 */
export const endpointPath = (raw: string, repo: string | undefined): string => {
  const path = raw.replace(apiPrefix, '').replace(/\?.*$/v, '');
  if (!path.includes('{owner}') && !path.includes('{repo}')) return path;

  const [owner, name] = repo?.split('/') ?? [];
  if (owner === undefined || name === undefined)
    throw new Error(
      'could not fill {owner}/{repo}: not in a repository and no --repo given',
    );
  return path.replaceAll('{owner}', () => owner).replaceAll('{repo}', () => name);
};
