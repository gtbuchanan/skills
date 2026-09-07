/*
 * Reading the JSONL call logs the stubs write.
 *
 * A missing log is deliberately not an error: it yields an empty list so the
 * caller's presence checks fail with their own specific reasons rather than an
 * exception. Malformed lines are dropped the same way — the checkers assert on
 * what a skill DID call, so a line that cannot be parsed simply is not evidence.
 */
import fs from 'node:fs';
import * as v from 'valibot';

/**
 * `JSON.parse` that yields `undefined` instead of throwing, so callers can
 * probe candidate spans without control flow by exception.
 */
export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * Reads a JSONL log, returning every line that parses against `schema`.
 */
export const readJsonl = <TOutput>(
  logPath: string,
  schema: v.GenericSchema<unknown, TOutput>,
): TOutput[] => {
  let raw = '';
  try {
    raw = fs.readFileSync(logPath, 'utf8');
  } catch {
    // no log yet → the caller's checks fail with their own clear reasons
    return [];
  }

  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => v.safeParse(schema, parseJson(line)))
    .filter(result => result.success)
    .map(result => result.output);
};

// Extracted rather than inlined to keep the schema call nesting shallow.
const StringListSchema = v.array(v.string());

/**
 * A logged stub invocation: the argv, tagged with the command that ran, and
 * whatever arrived on standard input.
 *
 * `stdin` is optional and undefaulted. Most stubs never read standard input, so
 * requiring it would drop their lines silently — but defaulting it to `''` says
 * they read and found nothing, which is a different claim.
 */
export const CallSchema = v.object({
  argv: v.optional(StringListSchema, []),
  cmd: v.optional(v.string(), ''),
  stdin: v.optional(v.string()),
});

/**
 * A logged invocation as a checker asks about it: the command line, and the
 * body that never appears in it.
 *
 * `undefined` is "this stub does not record bodies", distinct from `''`, "it
 * recorded an empty one". A checker that cannot tell them apart blames the
 * skill for a body its own double never captured.
 */
export interface LoggedCall {
  readonly command: string;
  readonly stdin: string | undefined;
}

/**
 * Reads a call log, optionally limited to one command. Stubs that log a single
 * command omit the `cmd` tag, so filtering is opt-in.
 */
export const readCalls = (logPath: string, cmd?: string): LoggedCall[] =>
  readJsonl(logPath, CallSchema)
    .filter(call => cmd === undefined || call.cmd === cmd)
    .map(call => ({ command: call.argv.join(' '), stdin: call.stdin }));

/**
 * The same log as space-joined command lines, for checkers with nothing to ask
 * about a body.
 */
export const readCommands = (logPath: string, cmd?: string): string[] =>
  readCalls(logPath, cmd).map(call => call.command);
