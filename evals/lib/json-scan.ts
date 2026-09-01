/*
 * Finding a JSON array a skill embedded in prose output.
 *
 * Skills that return structured results are told to emit the array bare and
 * usually do, but a run that leads with a sentence — or quotes an index like
 * `users[0]` in a field — puts a `[` somewhere other than the result. Matching
 * from the first `[` to the last `]` would drag that text into the parse and
 * fail a run whose array was fine, so every bracket-balanced span is collected
 * as a candidate and the schema decides which one is the result.
 *
 * A truncated or otherwise broken array deliberately falls through to a
 * failure: emitting invalid JSON breaks a skill's stated contract, and
 * salvaging it here would hide the defect the suites exist to catch.
 */
import * as v from 'valibot';

/**
 * The bracket-balanced span starting at `start`, or undefined when it never
 * closes. Brackets inside string literals neither open nor close a span, so a
 * field quoting `users[0]` cannot truncate the array it sits in.
 */
const arraySpan = (text: string, start: number): string | undefined => {
  let depth = 0;
  let isInString = false;
  let isEscaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (isInString) {
      if (isEscaped) isEscaped = false;
      else if (char === '\\') isEscaped = true;
      else if (char === '"') isInString = false;
      continue;
    }

    if (char === '"') {
      isInString = true;
      continue;
    }

    if (char === '[') {
      depth += 1;
      continue;
    }

    if (char !== ']') continue;

    depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }

  return undefined;
};

/**
 * Every bracket-balanced array in `text` that parses as JSON, in the order they
 * start, plus the first parse failure seen along the way.
 */
const scanJsonArrays = (
  text: string,
): { arrays: unknown[][]; parseError: string | undefined } => {
  const arrays: unknown[][] = [];
  let parseError: string | undefined;

  for (
    let index = text.indexOf('[');
    index !== -1;
    index = text.indexOf('[', index + 1)
  ) {
    const span = arraySpan(text, index);
    if (span === undefined) continue;

    try {
      const parsed: unknown = JSON.parse(span);
      if (!Array.isArray(parsed)) continue;
      arrays.push(parsed);
      // Resume past this array so its own contents aren't rescanned.
      index += span.length - 1;
    } catch (error) {
      parseError ??= error instanceof Error ? error.message : String(error);
    }
  }

  return { arrays, parseError };
};

/**
 * A schema this module can match a candidate array against.
 */
type ArraySchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;

/**
 * The first array in `text` that satisfies `schema`, or the reason none did.
 *
 * Candidates that fail the schema are skipped rather than reported, which is
 * what makes surrounding prose harmless: `Read threads [1] and [2].` puts two
 * arrays ahead of the result, and both simply lose to the schema.
 * @param text the raw output to scan
 * @param schema decides which candidate is the skill's result
 */
export const findJsonArray = <TSchema extends ArraySchema>(
  text: string,
  schema: TSchema,
): { output: v.InferOutput<TSchema> } | { reason: string } => {
  const { arrays, parseError } = scanJsonArrays(text);

  for (const candidate of arrays) {
    const result = v.safeParse(schema, candidate);
    if (result.success) return { output: result.output };
  }

  if (parseError !== undefined) return { reason: `invalid JSON: ${parseError}` };
  if (arrays.length > 0) return { reason: 'no array matched the expected shape' };

  return { reason: 'no JSON array found in output' };
};
