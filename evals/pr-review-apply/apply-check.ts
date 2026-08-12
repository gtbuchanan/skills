/*
 * promptfoo javascript assertion for the pr-review-apply write path.
 *
 * The fake gh (bin/gh-stub.ts) appends every invocation's argv, as a JSON
 * line, to artifacts/skill-evals/pr-review-apply.calls.jsonl. This checks that
 * the skill made the right GitHub calls for the fixture's approved actions:
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
import * as v from 'valibot';
import type { AssertionResult } from '#lib/assert.ts';
import { fromProblems } from '#lib/assert.ts';
import { readCommands } from '#lib/calls.ts';
import { suiteCallLog } from '#lib/paths.ts';

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
 */
const VarsSchema = v.object({
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
  commands: string[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] => {
  const problems = [];

  for (const threadId of vars.expectResolve) {
    const isHit = commands.some(
      command =>
        command.includes('resolveReviewThread') &&
        command.includes(`threadId=${threadId}`),
    );
    if (!isHit) problems.push(`missing resolve for ${threadId}`);
  }

  for (const reply of vars.expectReply) {
    const endpoint = `comments/${String(reply.id)}/replies`;
    const isHit = commands.some(
      command =>
        command.includes(endpoint) && command.includes(reply.bodyIncludes),
    );
    if (!isHit) {
      problems.push(
        `missing reply to ${String(reply.id)} containing ` +
        `"${reply.bodyIncludes}"`,
      );
    }
  }

  for (const id of vars.expectAbsent) {
    if (commands.some(command => command.includes(String(id)))) {
      problems.push(`acted on a withheld thread (${String(id)})`);
    }
  }

  return problems;
};

/**
 * A verified author-resolved fix is acknowledged with a 🚀 reaction on its root
 * comment — no resolve/reply, the thread stays as the other reviewer left it.
 */
const checkAcks = (
  commands: string[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] =>
  vars.expectAck.flatMap((rootCommentId) => {
    const isHit = commands.some(
      command =>
        command.includes(`comments/${String(rootCommentId)}/reactions`) &&
        command.includes('rocket'),
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
  commands: string[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] =>
  vars.expectReopen.flatMap(({ rootCommentId, threadId }) => {
    const replyIndex = commands.findIndex(command =>
      command.includes(`comments/${String(rootCommentId)}/replies`),
    );
    const unresolveIndex = commands.findIndex(
      command =>
        command.includes('unresolveReviewThread') &&
        command.includes(`threadId=${threadId}`),
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
  const commands = readCommands(suiteCallLog(import.meta.url));
  const vars = v.parse(VarsSchema, context.vars ?? {});
  const problems = [
    ...checkExpectedCalls(commands, vars),
    ...checkAcks(commands, vars),
    ...checkReopens(commands, vars),
  ];

  if (vars.expectFailure) {
    const text = typeof output === 'string' ? output : JSON.stringify(output);
    if (!failureWording.test(text.toLowerCase())) {
      problems.push('skill did not report the failed call');
    }
  }

  return fromProblems(problems);
}
