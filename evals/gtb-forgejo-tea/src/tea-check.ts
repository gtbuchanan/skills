/*
 * promptfoo javascript assertion for this suite.
 *
 * The shared engine judges the call log against each test's vars. Three checks
 * it cannot express are added here:
 *
 *   requireLogin — every tea call that takes --login names one. The log holds
 *     no "every" clause, and the workspace is never a checkout, so a call
 *     without one is the gap the skill closes
 *   expectReply — the reply the double recorded landed in the thread: the
 *     comment's own path and position, which only the double served
 *   reportIncludes — strings the agent's report must carry, for facts only the
 *     double knew, such as which check failed
 */
import path from 'node:path';
import type { AssertionResult } from '@gtbuchanan/agent-skills-harness/assert';
import { fromProblems } from '@gtbuchanan/agent-skills-harness/assert';
import { callExpectationAssertion } from '@gtbuchanan/agent-skills-harness/call-expectations';
import { suiteRunDir } from '@gtbuchanan/agent-skills-harness/paths';
import { readJsonl } from '@gtbuchanan/stub-runtime/calls';
import * as v from 'valibot';
import { reviewComment } from './world.ts';

const StringListSchema = v.array(v.string());

const VarsSchema = v.looseObject({
  expectReply: v.optional(v.boolean(), false),
  reportIncludes: v.optional(StringListSchema, []),
  requireLogin: v.optional(v.boolean(), false),
  scenario: v.string(),
});

const CallSchema = v.object({ argv: v.array(v.string()), cmd: v.string() });

const ReplySchema = v.looseObject({
  body: v.optional(v.unknown()),
  new_position: v.optional(v.unknown()),
  path: v.optional(v.unknown()),
});

const runDir = suiteRunDir(import.meta.url);

/*
 * What takes no --login: the login commands, whoami, and tea's global flags,
 * which come before any command.
 */
const loginCommands = new Set(['login', 'logins', 'whoami']);
const isLoginTaking = (argv: readonly string[]): boolean => {
  const first = argv[0] ?? '';
  return !first.startsWith('-') && !loginCommands.has(first);
};
const loginFlag = /^(?:-l|--login)(?:=|$)/v;

export const checkLogins = (
  calls: readonly v.InferOutput<typeof CallSchema>[],
): string[] =>
  calls
    .filter(call => call.cmd === 'tea' && isLoginTaking(call.argv))
    .filter(call => call.argv.every(arg => !loginFlag.test(arg)))
    .map(call => `tea ${call.argv.join(' ')} names no --login`);

export const checkReply = (
  replies: readonly v.InferOutput<typeof ReplySchema>[],
): string[] => {
  if (replies.length === 0) return ['posted no reply through tea api'];
  const isLanded = replies.some(
    reply =>
      reply.path === reviewComment.path &&
      Number(reply.new_position) === reviewComment.position &&
      typeof reply.body === 'string' &&
      reply.body.trim() !== '',
  );
  return isLanded
    ? []
    : [
        `no reply carried path ${reviewComment.path} and new_position ` +
        `${String(reviewComment.position)} with a body`,
      ];
};

export const checkReport = (text: string, includes: readonly string[]): string[] =>
  includes
    .filter(needle => !text.includes(needle))
    .map(needle => `report never mentions ${needle}`);

const callAssertion = callExpectationAssertion({ metaUrl: import.meta.url });

const readLog = <TOutput>(
  file: string,
  schema: v.GenericSchema<unknown, TOutput>,
): TOutput[] => readJsonl(path.join(runDir, file), schema);

/**
 * The shared call expectations, plus this suite's own checks.
 */
export default function assertTea(
  output: unknown,
  context: { vars?: unknown },
): AssertionResult {
  const base = callAssertion(output, context);
  const vars = v.parse(VarsSchema, context.vars ?? {});
  const calls = readLog(`${vars.scenario}.jsonl`, CallSchema);
  const text = typeof output === 'string' ? output : JSON.stringify(output ?? '');

  return fromProblems([
    ...(base.pass ? [] : [base.reason]),
    ...(vars.requireLogin ? checkLogins(calls) : []),
    ...(vars.expectReply
      ? checkReply(readLog(`${vars.scenario}.posted.jsonl`, ReplySchema))
      : []),
    ...checkReport(text, vars.reportIncludes),
  ]);
}
