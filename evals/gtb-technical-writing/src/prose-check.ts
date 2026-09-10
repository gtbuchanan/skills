/*
 * promptfoo javascript assertion for this suite.
 *
 * The skill's output is a revised document. Every constraint here is
 * deterministic — no model grades another model — so a failure names a
 * specific phrase that survived, a fact that did not, or a length that moved
 * the wrong way.
 *
 * Constraint kinds, each optional per test:
 *   - `mustContain`     literal substrings, matched case-insensitively. The
 *                       facts the revision has to carry through, and the
 *                       point-in-time figures it must NOT strip.
 *   - `mustNotContain`  regular expressions. The defect being tested —
 *                       a periphrastic figure, an expletive construction,
 *                       a nominalization, a volatile count.
 *   - `maxWordRatio`    revised ÷ original word count, upper bound. A padded
 *                       fixture has to actually shrink.
 *   - `minWordRatio`    the same ratio, lower bound. This is what stops a
 *                       skill from passing by deleting everything, and it is
 *                       the whole of the already-tight control.
 *   - `maxWords`        absolute upper bound, for generation fixtures whose
 *                       input is a fact list with no length to compare to.
 *   - `minWords`        absolute lower bound.
 *
 * The original is read from disk rather than passed as a count, so editing a
 * fixture cannot leave a stale number behind in the config.
 */
import { readFileSync } from 'node:fs';
import type { AssertionResult } from '@gtbuchanan/agent-skills-harness/assert';
import * as v from 'valibot';

const StringArraySchema = v.array(v.string());

/**
 * Decimal places when a ratio is named in a failure reason.
 */
const ratioDecimals = 2;

/*
 * The config keeps these as plain YAML vars. That needs
 * `defaultTest.options.disableVarExpansion`, or promptfoo turns each list into
 * a test case per element and hands this a bare string.
 */
const VarsSchema = v.looseObject({
  fixture: v.string(),
  /* Absolute budgets, for generation fixtures: the input is a fact
     specification rather than prose, so there is no original length to take a
     ratio against. `maxWords` is the whole point of those tests, since the
     model is never told to be brief and writing to a budget it was not given
     is what the skill has to supply. */
  maxWords: v.optional(v.number()),
  maxWordRatio: v.optional(v.number()),
  minWordRatio: v.optional(v.number()),
  minWords: v.optional(v.number()),
  mustContain: v.optional(StringArraySchema, []),
  /* Regular expressions that must match. `mustContain` is literal, which is
     too brittle for a fact the prose may legitimately render more than one
     way: a count opening a sentence is spelled out rather than written as a
     numeral, and asserting the numeral fails a correct document. */
  mustMatch: v.optional(StringArraySchema, []),
  mustNotContain: v.optional(StringArraySchema, []),
});

/**
 * Agents commonly return the whole document inside one fence. That is
 * packaging rather than prose quality, so a fence wrapping the entire reply is
 * peeled off.
 *
 * Peel only a wrapping fence, never a fenced span found anywhere in the reply:
 * a document may contain code blocks of its own — a runbook of `kubectl`
 * invocations does — and extracting one of those yields the prose between two
 * blocks, failing a correct document for the facts outside it.
 */
const unwrapFence = (text: string): string => {
  const wrapped = /^```[a-z]*\n(?<body>[\s\S]*)\n```$/iv.exec(text.trim());
  return wrapped?.groups?.['body'] ?? text;
};

/**
 * Renders a provider's output as text.
 *
 * A provider that returned nothing arrives here as undefined, and
 * `JSON.stringify` hands back undefined for it, which throws in `unwrapFence`.
 * The empty string carries it to the empty-revision failure instead, which is
 * what a missing output is.
 */
const serialize = (output: unknown): string => {
  if (typeof output === 'string') return output;
  if (output === undefined) return '';
  return JSON.stringify(output);
};

const countWords = (text: string): number =>
  text.split(/\s+/v).filter(word => word.length > 0).length;

const readFixture = (fixture: string): string =>
  readFileSync(
    new URL(`../fixtures/${fixture}/document.md`, import.meta.url),
    'utf8',
  );

interface Check { readonly ok: boolean; readonly label: string }

const containChecks = (revised: string, phrases: readonly string[]): Check[] => {
  const haystack = revised.toLowerCase();
  return phrases.map(phrase => ({
    label: `dropped required text: "${phrase}"`,
    ok: haystack.includes(phrase.toLowerCase()),
  }));
};

const matchChecks = (revised: string, patterns: readonly string[]): Check[] =>
  patterns.map(pattern => ({
    label: `no match for: /${pattern}/`,
    ok: new RegExp(pattern, 'iv').test(revised),
  }));

const absenceChecks = (
  revised: string,
  patterns: readonly string[],
): Check[] =>
  patterns.map(pattern => ({
    label: `left in place: /${pattern}/`,
    ok: !new RegExp(pattern, 'iv').test(revised),
  }));

const ratioChecks = (
  ratio: number,
  { max, min }: { max: number | undefined; min: number | undefined },
): Check[] => {
  const checks: Check[] = [];
  if (max !== undefined) {
    checks.push({
      label: `too long: ratio ${ratio.toFixed(ratioDecimals)} > ${String(max)}`,
      ok: ratio <= max,
    });
  }
  if (min !== undefined) {
    checks.push({
      label: `over-cut: ratio ${ratio.toFixed(ratioDecimals)} < ${String(min)}`,
      ok: ratio >= min,
    });
  }
  return checks;
};

const wordCountChecks = (
  words: number,
  { max, min }: { max: number | undefined; min: number | undefined },
): Check[] => {
  const checks: Check[] = [];
  if (max !== undefined) {
    checks.push({
      label: `over budget: ${String(words)} words > ${String(max)}`,
      ok: words <= max,
    });
  }
  if (min !== undefined) {
    checks.push({
      label: `under budget: ${String(words)} words < ${String(min)}`,
      ok: words >= min,
    });
  }
  return checks;
};

/**
 * Scores a revised document against the constraints its test declares.
 */
export default function assertProse(
  output: unknown,
  context: { vars?: unknown },
): AssertionResult {
  const raw = serialize(output);
  const revised = unwrapFence(raw);
  const vars = v.parse(VarsSchema, context.vars ?? {});

  const originalWords = countWords(readFixture(vars.fixture));
  const revisedWords = countWords(revised);
  if (revisedWords === 0) {
    return { pass: false, reason: 'revised document is empty', score: 0 };
  }
  const ratio = revisedWords / originalWords;

  const checks = [
    ...containChecks(revised, vars.mustContain),
    ...matchChecks(revised, vars.mustMatch),
    ...absenceChecks(revised, vars.mustNotContain),
    ...ratioChecks(ratio, {
      max: vars.maxWordRatio,
      min: vars.minWordRatio,
    }),
    ...wordCountChecks(revisedWords, {
      max: vars.maxWords,
      min: vars.minWords,
    }),
  ];

  const failures = checks.filter(check => !check.ok);

  return {
    pass: failures.length === 0,
    reason:
      failures.map(check => check.label).join('; ') ||
      `ok (ratio ${ratio.toFixed(ratioDecimals)})`,
    score: (checks.length - failures.length) / checks.length,
  };
}
