/*
 * `gh --json` field selection.
 *
 * Real gh returns exactly the fields named and rejects one it does not know, so
 * a double that hands back its whole record over-serves: the agent gets
 * surfaces it never asked for, and an assertion like "did it read the reviews?"
 * then passes for a run that never looked. That failure is quieter than
 * answering wrongly, because nothing fails — the assertion simply stops being
 * able to.
 */
import { unmodelled } from './dispatch.ts';

/**
 * The fields `--json` asked for, in the order asked. Empty when the flag is
 * absent, which is gh saying "do not narrow" rather than "narrow to nothing".
 */
export const requestedFields = (argv: readonly string[]): string[] => {
  const flag = argv.indexOf('--json');
  if (flag === -1) return [];

  return (argv[flag + 1] ?? '')
    .split(',')
    .map(field => field.trim())
    .filter(Boolean);
};

/**
 * `record` narrowed to `fields`, or the whole record when nothing was asked
 * for.
 *
 * A field the record has no answer for is refused rather than omitted:
 * omitting it would read as "this thing has no such value", which is an answer,
 * and the suite would carry on against a double that is quietly incomplete.
 */
export const pick = (
  record: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, unknown> => {
  if (fields.length === 0) return { ...record };

  const known = new Set(Object.keys(record));
  const missing = fields.filter(field => !known.has(field));
  if (missing.length > 0)
    throw unmodelled(`--json field(s) ${missing.join(', ')}`);

  return Object.fromEntries(fields.map(field => [field, record[field]]));
};
