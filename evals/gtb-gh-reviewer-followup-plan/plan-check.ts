/*
 * promptfoo javascript assertion for this suite's read path.
 *
 * The fake gh/git (bin/*-stub.ts) append every invocation's argv, as a JSON
 * line tagged with its command, to the suite's call log under
 * artifacts/skill-evals/. This asserts the skill behaved as the read-only
 * analysis shell it claims to be:
 *
 *   1. read-only        — no mutating gh call (resolve/unresolve, replies,
 *                         reactions)
 *   2. right endpoints  — queried the reviews API and reviewThreads via GraphQL
 *   3. baseline scope   — diffed since the viewer's last-review commit, not the
 *                         whole PR (the diff range references that baseline SHA)
 *   4. output contract  — the action list drops only the threads it should
 *                         (self-resolved, and resolved-by-other already vouched
 *                         for via a ROCKET reaction) and maps every judged
 *                         thread's verdict to the right action + ids, including
 *                         reopening a resolved-by-other thread the fix missed
 *
 * Verdicts themselves come from the real gtb-reviewer-followup-verdict delegation; the
 * fixture is built so they are unambiguous (a clean constant-time fix → exact-fix
 * → resolve; a guarded call whose batch path still derefs → partial → reply; a
 * thread the author resolved but whose file the diff never touches → unaddressed
 * → reply + reopen).
 */
import * as v from 'valibot';
import { readReviews, scenarioDir, selectLastOwnReview, viewer } from './scenario.ts';
import type { AssertionResult } from '#lib/assert.ts';
import { fromProblems } from '#lib/assert.ts';
import { parseJson, readCommands } from '#lib/calls.ts';
import { suiteCallLog } from '#lib/paths.ts';

/*
 * The baseline is read from the same resolved fixture the fake gh serves it
 * from, so this can't drift into asserting a commit the suite no longer hands
 * out. Seeding decides the object name, and it is deliberately neither the tip
 * nor the fork point: a run that gave up and diffed the whole PR must fail
 * this assertion, not pass it.
 */
const readBaseline = (): string => {
  const commit = selectLastOwnReview(
    readReviews(scenarioDir()),
    viewer,
  )?.commit_id;
  if (commit === undefined)
    throw new Error('fixture has no submitted review for the viewer to baseline on');

  return commit;
};

/**
 * Shortest abbreviation git will resolve.
 */
const abbrevLength = 7;

/**
 * Whether a command names the baseline commit — abbreviated or in full. The
 * checkout is real, so `git diff 94c2aed..HEAD` is as correct as the full
 * object name, and the skill has no reason to prefer one.
 */
const isBaselineNamed = (line: string, baseline: string): boolean =>
  Array.from(line.matchAll(/\b[\da-f]{7,40}\b/gv), match => match[0]).some(
    token => token.length >= abbrevLength && baseline.startsWith(token),
  );

const authRootCommentId = 9001;
const userRootCommentId = 9002;
const orderRootCommentId = 9005;

/*
 * An entry of the skill's action list. Every field is optional: the assertion
 * reports what is missing rather than failing to parse, and reply text may
 * arrive as `replyBody` or `reply`.
 */
const ActionSchema = v.looseObject({
  action: v.optional(v.string()),
  reopen: v.optional(v.boolean()),
  reply: v.optional(v.string()),
  replyBody: v.optional(v.string()),
  rootCommentId: v.optional(v.number()),
  threadId: v.optional(v.string()),
  verdict: v.optional(v.string()),
});

const ActionListSchema = v.array(ActionSchema);

/**
 * Parses the longest span from `start` that yields an action list. Spans are
 * tried longest-first so a nested array inside the list can't win.
 */
const parseListFrom = (
  text: string,
  start: number,
  ends: number[],
): v.InferOutput<typeof ActionListSchema> | undefined => {
  for (const end of ends.toReversed()) {
    if (end <= start) return;
    const result = v.safeParse(ActionListSchema, parseJson(text.slice(start, end + 1)));
    if (
      result.success &&
      result.output.some(entry => entry.rootCommentId !== undefined)
    ) {
      return result.output;
    }
  }

  return;
};

/**
 * Locates the action list in free-form output. A regex can't be trusted here
 * because `[`/`]` appear both in summary index markers ([1], [2]) and inside
 * JSON string values (e.g. `lookup(p["id"])`). Scan every `[` start against the
 * furthest `]` first and take the first slice that parses to an array whose
 * items carry rootCommentId.
 */
const findActionList = (text: string): v.InferOutput<typeof ActionListSchema> | undefined => {
  const starts = Array.from(text.matchAll(/\[/gv), match => match.index);
  const ends = Array.from(text.matchAll(/\]/gv), match => match.index);

  for (const start of starts) {
    const list = parseListFrom(text, start, ends);
    if (list) return list;
  }

  return;
};

/**
 * Action is checked semantically: taken from `action` when present, else
 * derived from `verdict` (exact-fix → resolve). This tests the contract, not
 * the incidental field naming the two skills share.
 */
const actionOf = (entry: v.InferOutput<typeof ActionSchema>): string =>
  entry.action ?? (entry.verdict === 'exact-fix' ? 'resolve' : 'reply');

const replyTextOf = (entry: v.InferOutput<typeof ActionSchema>): string =>
  (entry.replyBody ?? entry.reply ?? '').trim();

type ActionsById = Map<string | undefined, v.InferOutput<typeof ActionSchema>>;

interface ThreadExpectation {
  action: string;
  requireReopen?: boolean;
  requireReplyText?: boolean;
  rootCommentId: number;
  threadId: string;
}

/**
 * Checks one expected thread's entry in the action list.
 */
const checkThread = (
  byId: ActionsById,
  expected: ThreadExpectation,
): string[] => {
  const entry = byId.get(expected.threadId);
  if (!entry) {
    return [`action list missing thread ${expected.threadId}`];
  }

  const problems = [];
  if (actionOf(entry) !== expected.action) {
    problems.push(
      `${expected.threadId} action=${actionOf(entry)} ` +
      `(expected ${expected.action})`,
    );
  }
  if (expected.requireReplyText && !replyTextOf(entry)) {
    problems.push(`${expected.threadId} reply has no reply text`);
  }
  if (expected.requireReopen && entry.reopen !== true) {
    problems.push(
      `${expected.threadId} should reopen the thread (reopen:true) — a ` +
      'resolved-by-other thread the fix missed must be unresolved, not left closed',
    );
  }
  if (entry.rootCommentId !== expected.rootCommentId) {
    problems.push(
      `${expected.threadId} rootCommentId=${String(entry.rootCommentId)} ` +
      `(expected ${String(expected.rootCommentId)})`,
    );
  }

  return problems;
};

/**
 * Threads that must never appear in the action list: one the viewer resolved
 * themselves (authoritative), and one resolved by someone else that the viewer
 * already vouched for with a ROCKET reaction. Re-judging either every pass is
 * exactly the churn the ack is meant to prevent.
 */
const checkSkipped = (byId: ActionsById): string[] =>
  ['PRRT_resolved_log', 'PRRT_resolved_acked']
    .filter(id => byId.has(id))
    .map(id => `action list included the skip-only thread ${id}`);

/**
 * Asserts the skill stayed read-only and emitted a usable action list.
 */
export default function assertDiffOutput(output: unknown): AssertionResult {
  const baseline = readBaseline();
  const logPath = suiteCallLog(import.meta.url);
  const gh = readCommands(logPath, 'gh');
  const git = readCommands(logPath, 'git');

  const problems = [];

  // 1. read-only guardrail. `resolveReviewThread` as a substring also catches
  // `unresolveReviewThread`; reactions and replies are matched by REST path.
  const mutating = gh.filter(
    line =>
      line.includes('resolveReviewThread') ||
      line.includes('addReaction') ||
      /comments\/\d+\/(?:replies|reactions)/v.test(line),
  );
  if (mutating.length > 0) {
    problems.push(
      `read-only skill made mutating gh call(s): ${mutating.join(' | ')}`,
    );
  }

  // 2. queried the right read endpoints
  if (gh.every(line => !/\breviews\b/v.test(line))) {
    problems.push('never queried the reviews API for a baseline');
  }
  if (
    gh.every(line => !(line.includes('graphql') && line.includes('reviewThreads')))
  ) {
    problems.push('never queried reviewThreads via GraphQL');
  }

  // 3. baseline propagation — diff scoped to the last-review commit
  if (git.every(line => !(/\bdiff\b/v.test(line) && isBaselineNamed(line, baseline)))) {
    problems.push('diff was not scoped to the last-review baseline commit');
  }

  // 4. output action list — filtering + verdict→action mapping. The action list
  // is the array whose items carry rootCommentId (the id-join is what sets it
  // apart from gtb-reviewer-followup-verdict's raw output).
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  const list = findActionList(text);

  if (list) {
    const byId = new Map(list.map(entry => [entry.threadId, entry]));

    problems.push(
      ...checkSkipped(byId),
      ...checkThread(byId, {
        action: 'resolve',
        rootCommentId: authRootCommentId,
        threadId: 'PRRT_open_auth',
      }),
      ...checkThread(byId, {
        action: 'reply',
        requireReplyText: true,
        rootCommentId: userRootCommentId,
        threadId: 'PRRT_open_user',
      }),
      /*
       * The point of the whole change: a thread the author resolved but never
       * actually fixed must resurface — replied to AND reopened, not silently
       * dropped the way a plain isResolved filter would.
       */
      ...checkThread(byId, {
        action: 'reply',
        requireReopen: true,
        requireReplyText: true,
        rootCommentId: orderRootCommentId,
        threadId: 'PRRT_resolved_by_author',
      }),
    );
  } else {
    problems.push(
      'no machine-usable action list (array with rootCommentId) found in output',
    );
  }

  return fromProblems(problems);
}
