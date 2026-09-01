/*
 * Tests for the eval suites' shared JSON array extraction.
 *
 * The function exists because a skill's structured result arrives embedded in
 * prose, so the cases worth pinning are the ones where prose and JSON are hard
 * to tell apart. Two of them are regressions: nested arrays were unreachable
 * while the scan resumed past every span it parsed, and bracket runs inside
 * string literals became candidates once that resume was removed. Fixing either
 * one in isolation reintroduces the other, which is what makes them worth
 * holding down together.
 *
 * Everything here is pure — no workspace, no I/O — so the schema is the only
 * moving part.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import * as v from 'valibot';
import { test } from 'vitest';
import { findJsonArray } from '#evals/lib/json-scan.ts';

const TitledUnit = v.looseObject({ title: v.string() });

/**
 * Stands in for a real result schema: objects with a known key, which is what
 * separates a skill's result from an array of anything else.
 */
const Titled = v.pipe(v.array(TitledUnit), v.minLength(1));

/**
 * Permissive enough to accept an array of bare numbers, so a candidate lifted
 * out of a string literal would win if the scan offered one.
 */
const Numbers = v.pipe(v.array(v.number()), v.minLength(1));

test('returns the array matching the schema', ({ expect }) => {
  const found = findJsonArray('[{"title":"x"}]', Titled);

  expect(found).toStrictEqual({ output: [{ title: 'x' }] });
});

test('ignores prose around the result', ({ expect }) => {
  const found = findJsonArray('See [1] and [2].\n[{"title":"y"}]', Titled);

  expect(found).toStrictEqual({ output: [{ title: 'y' }] });
});

test('reaches a nested array when the outer loses to the schema', ({ expect }) => {
  const found = findJsonArray('[[{"title":"x"}]]', Titled);

  expect(found).toStrictEqual({ output: [{ title: 'x' }] });
});

test('does not take a candidate from inside a string literal', ({ expect }) => {
  // `[1]` appears only within the quoted note, so it is not an array in the
  // JSON and must not be reachable from a parse of it.
  const found = findJsonArray('["note [1]"]', Numbers);

  expect(found).toStrictEqual({ reason: 'no array matched the expected shape' });
});

test('prefers the outer array when both satisfy the schema', ({ expect }) => {
  const found = findJsonArray('[{"title":"outer","kids":[{"title":"inner"}]}]', Titled);

  expect(found).toStrictEqual({
    output: [{ kids: [{ title: 'inner' }], title: 'outer' }],
  });
});

test('fails on a truncated array rather than salvaging it', ({ expect }) => {
  const found = findJsonArray('[{"title": "z"', Titled);

  expect(found).toStrictEqual({ reason: 'no JSON array found in output' });
});

test('reports the parse failure when a bracket-balanced span is not JSON', ({ expect }) => {
  const found = findJsonArray('[{title: "z"}]', Titled);

  expect(found).toHaveProperty('reason');
  expect(Object.values(found)[0]).toContain('invalid JSON');
});

test('rejects an empty array, which satisfies the shape but carries no result', ({ expect }) => {
  const found = findJsonArray('[]', Titled);

  expect(found).toStrictEqual({ reason: 'no array matched the expected shape' });
});
