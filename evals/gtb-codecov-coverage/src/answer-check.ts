/*
 * promptfoo javascript assertion for this suite.
 *
 * The skill's output is an explanation, so what is graded is which mechanism
 * the answer names. Every constraint is deterministic — no model grades another
 * model — and a failure names the phrase that was missing or the one that
 * should not have been there.
 *
 * Constraint kinds, each optional per test:
 *   - `mustContain`    literal substrings, matched case-insensitively. The
 *                      mechanism the diagnosis has to land on.
 *   - `mustMatch`      regular expressions, for a fact the answer may
 *                      legitimately word more than one way.
 *   - `mustNotMatch`   regular expressions the answer must avoid: the wrong
 *                      diagnosis, and asking the human for a secret.
 *
 * `leakedSecret` is separate from `mustNotMatch` because it is not a phrasing
 * rule. The suite mints the token, so a run that echoed it is caught by value
 * rather than by shape, and the failure says so in those terms — a stray
 * credential in a transcript is a different kind of defect from a clumsy
 * sentence, and reading it as one would bury it.
 */
import type { AssertionResult } from '@gtbuchanan/agent-skills-harness/assert';
import { fromProblems } from '@gtbuchanan/agent-skills-harness/assert';
import * as v from 'valibot';

const StringListSchema = v.array(v.string());

const VarsSchema = v.looseObject({
  /* The suite's fake token, when the scenario exports one. Its absence from
     the answer is the assertion; passing it in is what makes checking by
     value possible at all. */
  leakedSecret: v.optional(v.string()),
  mustContain: v.optional(StringListSchema, []),
  mustMatch: v.optional(StringListSchema, []),
  mustNotMatch: v.optional(StringListSchema, []),
});

/**
 * The reply as prose. An agent commonly wraps a whole answer in one fence, so a
 * fence around the entire reply is peeled; fenced spans inside an answer are
 * left alone, since an explanation of a `curl` call legitimately holds one.
 */
const unwrap = (output: string): string => {
  const trimmed = output.trim();
  const fenced = /^```[^\n]*\n(?<body>[\s\S]*)\n```$/v.exec(trimmed);
  return fenced?.groups?.['body'] ?? trimmed;
};

const missingLiterals = (haystack: string, needles: readonly string[]): string[] =>
  needles
    .filter(needle => !haystack.toLowerCase().includes(needle.toLowerCase()))
    .map(needle => `never said: ${needle}`);

const missingPatterns = (haystack: string, patterns: readonly string[]): string[] =>
  patterns
    .filter(pattern => !new RegExp(pattern, 'iv').test(haystack))
    .map(pattern => `no match for: ${pattern}`);

const forbiddenPatterns = (
  haystack: string,
  patterns: readonly string[],
): string[] =>
  patterns
    .filter(pattern => new RegExp(pattern, 'iv').test(haystack))
    .map(pattern => `said what it must not: ${pattern}`);

/**
 * Grades one reply against the scenario's declared constraints.
 */
export const gradeAnswer = (
  output: string,
  rawVars: unknown,
): AssertionResult => {
  const vars = v.parse(VarsSchema, rawVars);
  const answer = unwrap(output);

  return fromProblems([
    ...missingLiterals(answer, vars.mustContain),
    ...missingPatterns(answer, vars.mustMatch),
    ...forbiddenPatterns(answer, vars.mustNotMatch),
    ...(vars.leakedSecret !== undefined && output.includes(vars.leakedSecret)
      ? ['leaked the API token into the answer']
      : []),
  ]);
};

const assertAnswer = (
  output: string,
  context: { vars: unknown },
): AssertionResult => gradeAnswer(output, context.vars);

export default assertAnswer;
