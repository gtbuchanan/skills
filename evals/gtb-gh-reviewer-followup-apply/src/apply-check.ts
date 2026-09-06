/*
 * promptfoo javascript assertion for this suite's write path.
 *
 * The fake gh (bin/gh-stub.ts) appends every invocation, as a JSON line, to the
 * suite's call log under artifacts/skill-evals/ — argv, and the body gh was
 * handed on standard input, which never appears in argv at all. This checks
 * that the skill made the right GitHub calls for the fixture's approved
 * actions:
 *
 *   expectResolve  — thread ids that must appear in a resolveReviewThread call
 *   expectReply    — { id, bodyIncludes } that must appear as a REST reply
 *   expectAck      — root comment ids that must get a 🚀 reaction (content=rocket)
 *   expectReopen   — { rootCommentId, threadId } that must be unresolved, with
 *                    the reply posted BEFORE the unresolve (reply-first ordering)
 *   expectAbsent   — ids that must NEVER appear (the reviewer withheld approval)
 *   expectFailure  — the agent's own report must acknowledge a failure
 *
 * Assertions are presence/absence (not counts), so a shared, append-only log is
 * safe across concurrent tests and repeated runs: fixtures use globally-unique
 * ids, and a correct skill never emits a call for a withheld id.
 */
import type { AssertionResult } from '@gtbuchanan/agent-skills-harness/assert';
import { fromProblems } from '@gtbuchanan/agent-skills-harness/assert';
import type { LoggedCall } from '@gtbuchanan/agent-skills-harness/calls';
import { readCalls } from '@gtbuchanan/agent-skills-harness/calls';
import { suiteCallLog } from '@gtbuchanan/agent-skills-harness/paths';
import * as v from 'valibot';

const StringListSchema = v.array(v.string());

/**
 * Comment and thread ids arrive as numbers or strings depending on the API.
 */
const IdSchema = v.union([v.string(), v.number()]);
const IdListSchema = v.array(IdSchema);

const ReplyExpectationSchema = v.object({
  bodyIncludes: v.string(),
  id: IdSchema,
});
const ReplyExpectationListSchema = v.array(ReplyExpectationSchema);

const ReopenExpectationSchema = v.object({
  rootCommentId: IdSchema,
  threadId: v.string(),
});
const ReopenExpectationListSchema = v.array(ReopenExpectationSchema);

/**
 * The per-test expectations, declared as promptfoo vars.
 *
 * Exported so a test can build the same fully-defaulted shape the assertion
 * runs on rather than hand-rolling one that drifts from it.
 */
export const VarsSchema = v.object({
  expectAbsent: v.optional(IdListSchema, []),
  expectAck: v.optional(IdListSchema, []),
  expectFailure: v.optional(v.boolean(), false),
  expectReopen: v.optional(ReopenExpectationListSchema, []),
  expectReply: v.optional(ReplyExpectationListSchema, []),
  expectResolve: v.optional(StringListSchema, []),
});

const failureWording =
  /fail|error|could not|couldn't|unable|did not|didn't/v;

const checkExpectedCalls = (
  calls: readonly LoggedCall[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] => {
  const problems = [];

  for (const threadId of vars.expectResolve) {
    const isHit = calls.some(
      call =>
        call.command.includes('resolveReviewThread') &&
        call.command.includes(`threadId=${threadId}`),
    );
    if (!isHit) problems.push(`missing resolve for ${threadId}`);
  }

  /* argv alone, deliberately: a withheld thread is acted on by naming it in an
     endpoint or a mutation argument, both of which are the command line. Its id
     turning up inside some other thread's reply body is prose, not an act. */
  for (const id of vars.expectAbsent) {
    if (calls.some(call => call.command.includes(String(id)))) {
      problems.push(`acted on a withheld thread (${String(id)})`);
    }
  }

  return problems;
};

/**
 * Whether this call carried `text`, wherever gh took it from.
 *
 * A reply body reaches gh one of two ways — inline as `-f body='…'`, which puts
 * it in argv, or piped as `-F body=@-`, which keeps it out of argv entirely.
 * Only the recorded pair can see both, and a checker reading the command line
 * alone reports the piped form as a reply that never happened.
 *
 * The two are searched separately rather than concatenated, so a needle can
 * never be matched half out of the command and half out of the body.
 */
const didCarry = (call: LoggedCall, text: string): boolean =>
  call.command.includes(text) || call.stdin.includes(text);

/**
 * Each expected reply reached its own thread carrying the wording it was
 * approved with.
 *
 * The thread and the wording fail separately because they are different
 * mistakes: nothing posted at all is a skill that skipped the action, while a
 * reply on the right thread saying the wrong thing is one that rewrote an
 * approved body — and a single "missing reply containing …" sends the reader
 * hunting for wording that may not exist.
 */
export const checkReplies = (
  calls: readonly LoggedCall[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] =>
  vars.expectReply.flatMap((reply) => {
    const hits = calls.filter(call =>
      call.command.includes(`comments/${String(reply.id)}/replies`),
    );
    if (hits.length === 0) return [`missing reply to ${String(reply.id)}`];

    return hits.some(hit => didCarry(hit, reply.bodyIncludes))
      ? []
      : [`reply to ${String(reply.id)} did not carry "${reply.bodyIncludes}"`];
  });

/**
 * A verified author-resolved fix is acknowledged with a 🚀 reaction on its root
 * comment — no resolve/reply, the thread stays as the other reviewer left it.
 */
const checkAcks = (
  calls: readonly LoggedCall[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] =>
  vars.expectAck.flatMap((rootCommentId) => {
    const isHit = calls.some(
      call =>
        call.command.includes(`comments/${String(rootCommentId)}/reactions`) &&
        call.command.includes('rocket'),
    );
    return isHit
      ? []
      : [`missing 🚀 ack reaction on comment ${String(rootCommentId)}`];
  });

/**
 * Each reopen must post the reply BEFORE unresolving the thread, so the author
 * gets the context comment alongside the state change rather than a bare reopen.
 */
const checkReopens = (
  calls: readonly LoggedCall[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] =>
  vars.expectReopen.flatMap(({ rootCommentId, threadId }) => {
    const replyIndex = calls.findIndex(call =>
      call.command.includes(`comments/${String(rootCommentId)}/replies`),
    );
    const unresolveIndex = calls.findIndex(
      call =>
        call.command.includes('unresolveReviewThread') &&
        call.command.includes(`threadId=${threadId}`),
    );
    if (unresolveIndex === -1) {
      return [`missing unresolve (reopen) for ${threadId}`];
    }
    if (replyIndex === -1) {
      return [`reopen ${threadId} posted no reply before unresolving`];
    }
    if (replyIndex > unresolveIndex) {
      return [`reopen ${threadId} unresolved before replying — reply must come first`];
    }
    return [];
  });

/**
 * Asserts the skill made exactly the GitHub calls the fixture approved.
 */
export default function assertApplyCalls(
  output: unknown,
  context: { vars?: unknown },
): AssertionResult {
  const calls = readCalls(suiteCallLog(import.meta.url));
  const vars = v.parse(VarsSchema, context.vars ?? {});
  const problems = [
    ...checkExpectedCalls(calls, vars),
    ...checkReplies(calls, vars),
    ...checkAcks(calls, vars),
    ...checkReopens(calls, vars),
  ];

  if (vars.expectFailure) {
    const text = typeof output === 'string' ? output : JSON.stringify(output);
    if (!failureWording.test(text.toLowerCase())) {
      problems.push('skill did not report the failed call');
    }
  }

  return fromProblems(problems);
}
