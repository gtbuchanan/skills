/*
 * promptfoo javascript assertion for this suite.
 *
 * The skill's output is a raw JSON array of per-thread verdicts. A reply must be
 * present iff the verdict is not exact-fix (exact-fix resolves the thread instead
 * of replying).
 *
 * Two fixture shapes are supported:
 *   - Single thread: `expectedVerdict` checks parsed[0] (verdict 0.8 / reply 0.2).
 *   - Multiple threads: `expectedVerdicts` is an { threadId: verdict } map; every
 *     thread is matched by its echoed `threadId` and scored as a fraction.
 */
import type { AssertionResult } from '@gtbuchanan/agent-skills-harness/assert';
import { findJsonArray } from '@gtbuchanan/agent-skills-harness/json-scan';
import * as v from 'valibot';

/**
 * Share of the single-thread score carried by the verdict itself.
 */
const verdictWeight = 0.8;
/**
 * Share carried by getting reply presence right.
 */
const replyWeight = 0.2;

const VerdictSchema = v.looseObject({
  reply: v.optional(v.string(), ''),
  threadId: v.optional(v.string()),
  verdict: v.optional(v.string(), ''),
});
const VerdictArraySchema = v.array(VerdictSchema);
/* `v.minLength(1)` must be inlined: hoisting it to a const widens its input
   to valibot's generic LengthInput, which no longer matches the array pipe. */
const VerdictListSchema = v.pipe(VerdictArraySchema, v.minLength(1));

/**
 * `expectedVerdicts` maps thread id → expected verdict.
 */
const VerdictMapSchema = v.record(v.string(), v.string());

const VarsSchema = v.object({
  expectedVerdict: v.optional(v.string()),
  expectedVerdicts: v.optional(VerdictMapSchema),
});

const isReplyPresent = (verdict: string, reply: string): boolean =>
  verdict === 'exact-fix' ? reply.trim() === '' : reply.trim().length > 0;

const checkMany = (
  parsed: v.InferOutput<typeof VerdictArraySchema>,
  expectedMap: Record<string, string>,
): AssertionResult => {
  const byId = new Map(parsed.map(entry => [entry.threadId, entry]));
  const ids = Object.keys(expectedMap);
  const problems = [];
  let correct = 0;

  for (const id of ids) {
    const entry = byId.get(id);
    if (!entry) {
      problems.push(`no verdict for thread ${id}`);
      continue;
    }
    const expected = expectedMap[id];
    const isVerdictOk = entry.verdict === expected;
    const isReplyOk = isReplyPresent(entry.verdict, entry.reply);
    if (isVerdictOk && isReplyOk) correct += 1;
    if (isVerdictOk) {
      if (!isReplyOk) problems.push(`${id}: reply presence wrong`);
    } else {
      problems.push(
        `${id}: verdict=${entry.verdict} (expected ${String(expected)})`,
      );
    }
  }

  return {
    pass: problems.length === 0,
    reason: problems.join('; ') || 'ok',
    score: correct / ids.length,
  };
};

type ParsedVerdicts =
  | {
    first: v.InferOutput<typeof VerdictSchema>;
    list: v.InferOutput<typeof VerdictArraySchema>;
  }
  | { reason: string };

/**
 * Extracts the verdict array the skill embeds in its prose output.
 */
const parseVerdictList = (text: string): ParsedVerdicts => {
  const found = findJsonArray(text, VerdictListSchema);
  if ('reason' in found) return found;

  /*
   * minLength(1) guarantees an entry at runtime, but the parsed type stays a
   * plain array. Destructure here, next to the schema that makes it true, so
   * callers get a non-optional entry without an assertion.
   */
  const [first] = found.output;
  if (first === undefined) return { reason: 'result is not a non-empty array' };

  return { first, list: found.output };
};

/**
 * Scores each thread's verdict and whether a reply accompanies it.
 */
export default function assertVerdicts(
  output: unknown,
  context: { vars?: unknown },
): AssertionResult {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  const parsedList = parseVerdictList(text);
  if ('reason' in parsedList) {
    return { pass: false, reason: parsedList.reason, score: 0 };
  }
  const parsed = parsedList.list;

  const vars = v.parse(VarsSchema, context.vars ?? {});
  if (vars.expectedVerdicts) return checkMany(parsed, vars.expectedVerdicts);

  const { first } = parsedList;
  const expected = vars.expectedVerdict;
  const isVerdictOk = first.verdict === expected;
  const isReplyOk = isReplyPresent(first.verdict, first.reply);

  return {
    pass: isVerdictOk && isReplyOk,
    reason:
      `verdict=${first.verdict} (expected ${String(expected)}); ` +
      `reply presence ${isReplyOk ? 'ok' : 'wrong'}`,
    score: (isVerdictOk ? verdictWeight : 0) + (isReplyOk ? replyWeight : 0),
  };
}
