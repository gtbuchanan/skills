/*
 * Tests for `--json` field selection.
 *
 * Real `gh` returns exactly the fields asked for and rejects one it does not
 * know. A double that returns the whole record instead hands the agent
 * surfaces it never requested, so "did it read the reviews?" passes for a run
 * that never looked — the same bug as the fall-through, inverted: it makes an
 * assertion unfalsifiable rather than wrong.
 *
 * Which is why the absent flag and the empty one are different answers rather
 * than the same empty list. Asking for nothing is not the same as not asking.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { pick, requestedFields } from '@gtbuchanan/github-cli-stub/selection';

const record = { number: 42, state: 'OPEN', title: 'Fix the cache key' };

const selectionFor = (...argv: string[]): ReturnType<typeof requestedFields> =>
  requestedFields(['pr', 'view', ...argv]);

test('no --json flag narrows nothing', ({ expect }) => {
  expect(selectionFor('42').kind).toBe('all');
});

test('--json yields the named fields in the order asked', ({ expect }) => {
  expect(selectionFor('--json', 'state,number')).toStrictEqual({
    fields: ['state', 'number'],
    kind: 'named',
  });
});

test('surrounding whitespace in the field list is ignored', ({ expect }) => {
  expect(selectionFor('--json', 'state, number')).toStrictEqual({
    fields: ['state', 'number'],
    kind: 'named',
  });
});

test('a bare --json names no fields and is not a selection', ({ expect }) => {
  /* gh rejects this and lists what it could have been given. Reading it as
     "no narrowing" would hand back the whole record, which is the one answer
     it must not produce. */
  expect(selectionFor('--json').kind).toBe('invalid');
});

test('--json followed by another flag names no fields either', ({ expect }) => {
  expect(selectionFor('--json', '--repo', 'acme/widgets').kind).toBe('invalid');
});

test('picking selects only what was asked for', ({ expect }) => {
  expect(pick(record, selectionFor('--json', 'title'))).toStrictEqual({
    title: 'Fix the cache key',
  });
});

test('picking without a --json flag hands back the whole record', ({ expect }) => {
  expect(pick(record, selectionFor('42'))).toStrictEqual(record);
});

test('picking a bare --json is refused rather than answered', ({ expect }) => {
  expect(() => pick(record, selectionFor('--json'))).toThrow(/--json/v);
});

test('a field the record does not model is refused, not omitted', ({ expect }) => {
  /* Omitting it would read as "this PR has no reviewDecision", which is an
     answer. The suite has to hear that the double is incomplete instead. */
  expect(() => pick(record, selectionFor('--json', 'reviewDecision'))).toThrow(
    /reviewDecision/v,
  );
});

test('the refusal names every unmodelled field, not just the first', ({ expect }) => {
  expect(() =>
    pick(record, selectionFor('--json', 'reviewDecision,mergeable')),
  ).toThrow(/mergeable/v);
});
