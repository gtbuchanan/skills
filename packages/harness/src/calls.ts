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
 * A logged stub invocation: the argv, tagged with the command that ran.
 */
export const CallSchema = v.object({
  argv: v.optional(StringListSchema, []),
  cmd: v.optional(v.string(), ''),
});

/**
 * Reads a call log as space-joined command lines, optionally limited to one
 * command. Stubs that log a single command omit the `cmd` tag, so filtering is
 * opt-in.
 */
export const readCommands = (logPath: string, cmd?: string): string[] =>
  readJsonl(logPath, CallSchema)
    .filter(call => cmd === undefined || call.cmd === cmd)
    .map(call => call.argv.join(' '));
