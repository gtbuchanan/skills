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
import { suiteCallLog } from '@gtbuchanan/agent-skills-harness/paths';
import type { LoggedCall } from '@gtbuchanan/stub-runtime/calls';
import { readCalls } from '@gtbuchanan/stub-runtime/calls';
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
 * gh's inline body field, whatever its value.
 *
 * The rule is about the form, not about where the wording ended up, so this
 * matches the argument itself. Searching the flattened command for the body
 * text instead would call an endpoint that happens to contain that text an
 * inline body — and `-F body=@-` never puts the text in argv at all, so there
 * is nothing there to match on a correct run.
 */
const inlineBody = /(?:^| )(?:-f|--raw-field) body=/v;

/**
 * Each expected reply reached its own thread, carrying the wording it was
 * approved with, on standard input.
 *
 * The three failures report separately because they are three different
 * mistakes: nothing posted, the wrong wording, or the right wording sent the
 * way the skill rules out.
 *
 * The inline form is judged first. A thread answered twice — once piped, once
 * inline — has still had a body through a shell, and accepting the piped one
 * would let that pass unreported.
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
    if (hits.some(hit => inlineBody.test(hit.command))) {
      return [
        `reply to ${String(reply.id)} passed its body as an argument — ` +
        'it goes in on standard input',
      ];
    }

    return hits.some(hit => hit.stdin?.includes(reply.bodyIncludes) ?? false)
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
