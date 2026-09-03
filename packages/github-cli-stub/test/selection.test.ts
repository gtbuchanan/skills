/*
 * Tests for `--json` field selection.
 *
 * Real `gh` returns exactly the fields asked for and rejects one it does not
 * know. A double that returns the whole record instead hands the agent
 * surfaces it never requested, so "did it read the reviews?" passes for a run
 * that never looked — the same bug as the fall-through, inverted: it makes an
 * assertion unfalsifiable rather than wrong.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { pick, requestedFields } from '@gtbuchanan/github-cli-stub/selection';

const record = { number: 42, state: 'OPEN', title: 'Fix the cache key' };

test('no --json flag selects nothing', ({ expect }) => {
  expect(requestedFields(['pr', 'view', '42'])).toStrictEqual([]);
});

test('--json yields the named fields in the order asked', ({ expect }) => {
  expect(requestedFields(['pr', 'view', '--json', 'state,number'])).toStrictEqual([
    'state',
    'number',
  ]);
});

test('surrounding whitespace in the field list is ignored', ({ expect }) => {
  expect(requestedFields(['pr', 'view', '--json', 'state, number'])).toStrictEqual([
    'state',
    'number',
  ]);
});

test('picking selects only what was asked for', ({ expect }) => {
  expect(pick(record, ['title'])).toStrictEqual({ title: 'Fix the cache key' });
});

test('picking nothing hands back the whole record', ({ expect }) => {
  /* No `--json` means gh was not asked to narrow, so the caller gets the lot —
     distinct from being asked for an empty selection, which cannot occur. */
  expect(pick(record, [])).toStrictEqual(record);
});

test('a field the record does not model is refused, not omitted', ({ expect }) => {
  /* Omitting it would read as "this PR has no reviewDecision", which is an
     answer. The suite has to hear that the double is incomplete instead. */
  expect(() => pick(record, ['reviewDecision'])).toThrow(/reviewDecision/v);
});

test('the refusal names every unmodelled field, not just the first', ({ expect }) => {
  expect(() => pick(record, ['reviewDecision', 'mergeable'])).toThrow(/mergeable/v);
});
