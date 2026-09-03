/*
 * `gh --json` field selection.
 *
 * Real gh returns exactly the fields named and rejects one it does not know, so
 * a double that hands back its whole record over-serves: the agent gets
 * surfaces it never asked for, and an assertion like "did it read the reviews?"
 * then passes for a run that never looked. That failure is quieter than
 * answering wrongly, because nothing fails — the assertion simply stops being
 * able to.
 *
 * Three outcomes rather than a list, because a bare `--json` is none of them:
 * gh rejects it and prints the fields it could have been given. Collapsing that
 * onto the empty list would make "asked for nothing" indistinguishable from
 * "did not ask", and the whole record is what the second one returns.
 */
import { unmodelled } from './dispatch.ts';

/**
 * What a call asked gh to narrow to.
 */
export type FieldSelection =
  | { readonly fields: readonly string[]; readonly kind: 'named' }
  | { readonly kind: 'all' }
  | { readonly kind: 'invalid' };

/**
 * The selection `--json` expresses, in the order the fields were asked for.
 *
 * A value that is missing, or is the next flag rather than a field list, is
 * `invalid` rather than empty — the refusal belongs at the point of use, so
 * that reading the arguments stays total and only answering can fail.
 */
export const requestedFields = (argv: readonly string[]): FieldSelection => {
  const flag = argv.indexOf('--json');
  if (flag === -1) return { kind: 'all' };

  const value = argv[flag + 1];
  if (value === undefined || value.startsWith('-')) return { kind: 'invalid' };

  const fields = value
    .split(',')
    .map(field => field.trim())
    .filter(Boolean);

  return fields.length === 0 ? { kind: 'invalid' } : { fields, kind: 'named' };
};

/**
 * `record` narrowed to the selection, or the whole record when gh was not asked
 * to narrow.
 *
 * A field the record has no answer for is refused rather than omitted:
 * omitting it would read as "this thing has no such value", which is an answer,
 * and the suite would carry on against a double that is quietly incomplete.
 */
export const pick = (
  record: Readonly<Record<string, unknown>>,
  selection: FieldSelection,
): Record<string, unknown> => {
  if (selection.kind === 'all') return { ...record };
  if (selection.kind === 'invalid')
    throw unmodelled('--json without a comma-separated field list, which gh rejects');

  const known = new Set(Object.keys(record));
  const missing = selection.fields.filter(field => !known.has(field));
  if (missing.length > 0)
    throw unmodelled(`--json field(s) ${missing.join(', ')}`);

  return Object.fromEntries(
    selection.fields.map(field => [field, record[field]]),
  );
};
