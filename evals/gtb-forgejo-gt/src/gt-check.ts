/*
 * promptfoo javascript assertion for this suite.
 *
 * The shared engine judges the run's call log against each test's vars. Three
 * checks it cannot express are added here:
 *
 *   requireHost — every gt call that selects an instance names --host. The log
 *     holds no "every" clause, and gt holds a second login and the workspace
 *     is never a checkout, so a call without one reaches the wrong instance
 *   expectReply — the reply the double recorded landed in the thread: the
 *     comment's own path and position, which only the double served
 *   reportIncludes — strings the agent's report must carry, for facts only the
 *     double knew, such as the failing line of a job's log
 */
import { readCallRecords, readJsonl } from '@gtbuchanan/cli-doubles/calls';
import { callExpectationAssertion } from '@gtbuchanan/promptfoo-agent/call-expectations';
import type { ReportedResult } from '@gtbuchanan/promptfoo-agent/refusals';
import { runLog } from '@gtbuchanan/promptfoo-agent/run-log';
import * as v from 'valibot';
import { reviewComment } from './world.ts';

export interface LoggedGtCall {
  readonly argv: readonly string[];
  readonly cmd: string;
}

const ReplySchema = v.looseObject({
  body: v.optional(v.unknown()),
  new_position: v.optional(v.unknown()),
  path: v.optional(v.unknown()),
});

export type PostedReply = v.InferOutput<typeof ReplySchema>;

const StringListSchema = v.array(v.string());

const VarsSchema = v.looseObject({
  expectReply: v.optional(v.boolean(), false),
  reportIncludes: v.optional(StringListSchema, []),
  requireHost: v.optional(v.boolean(), false),
});

/**
 * Where the double keeps the replies a run posted: beside the run's call log,
 * so they share its partitioning by run.
 */
export const postedLogFor = (logPath: string): string =>
  logPath.replace(/\.jsonl$/v, '.posted.jsonl');

/*
 * What selects no instance: `auth status` reports on every login, and version,
 * help and schema describe gt itself. A leading flag such as --version is gt's
 * own too.
 */
const hostless = new Set(['help', 'schema', 'version']);
const isInstanceCommand = ([first = '', second]: readonly string[]): boolean =>
  !first.startsWith('-') &&
  !hostless.has(first) &&
  !(first === 'auth' && second === 'status');
const hostFlag = /^--host(?:=|$)/v;

export const checkHosts = (calls: readonly LoggedGtCall[]): string[] =>
  calls
    .filter(call => call.cmd === 'gt' && isInstanceCommand(call.argv))
    .filter(call => call.argv.every(arg => !hostFlag.test(arg)))
    .map(call => `gt ${call.argv.join(' ')} names no --host`);

export const checkReply = (replies: readonly PostedReply[]): string[] => {
  if (replies.length === 0) return ['posted no reply through gt api'];
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

/*
 * This suite's checks, for the run whose log is `logPath`. JSON.stringify
 * returns undefined for undefined, so an absent report is guarded before it
 * rather than after.
 */
const suiteProblems = (output: unknown, rawVars: unknown, logPath: string): string[] => {
  const vars = v.parse(VarsSchema, rawVars ?? {});
  const text = typeof output === 'string' ? output : JSON.stringify(output ?? '');
  return [
    ...(vars.requireHost ? checkHosts(readCallRecords(logPath)) : []),
    ...(vars.expectReply ? checkReply(readJsonl(postedLogFor(logPath), ReplySchema)) : []),
    ...checkReport(text, vars.reportIncludes),
  ];
};

/**
 * The shared call expectations plus this suite's own checks, reported once
 * with the run's refusals.
 */
export default function assertGt(
  output: unknown,
  context: { metadata?: unknown; vars?: unknown },
): ReportedResult {
  const logPath = runLog(import.meta.url, context.metadata);
  const problems = suiteProblems(output, context.vars, logPath);
  return callExpectationAssertion({
    metaUrl: import.meta.url,
    outcomeChecks: [() => problems],
  })(output, context);
}
