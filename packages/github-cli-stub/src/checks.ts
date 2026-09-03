/*
 * What `gh pr checks` reports.
 *
 * A model rather than a dispatch: the double decides which question was asked,
 * and this decides what the check list looks like in the world it was asked
 * about.
 *
 * The values come from a live pull request rather than from invention. An
 * automated reviewer reports with no `workflow`, and its check passes both for
 * a review that finished and for a draft it declined to read — which is why a
 * reader is told to go by the description rather than the colour.
 *
 * Loaded by stubs running under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */

/**
 * One entry in `gh pr checks`.
 *
 * `workflow` is what an agent reads to tell a check that ran in CI from one an
 * automated reviewer posted, so a reviewer's entry states it as empty rather
 * than omitting it — the field being absent and the field being blank are
 * different answers, and only the second is what gh sends.
 */
export interface CheckEntry {
  readonly bucket: 'cancel' | 'fail' | 'pass' | 'pending' | 'skipping';
  /**
   * What the check says about itself — where a reviewer distinguishes a queued
   * review from one under way, this is where it says so.
   */
  readonly description: string;
  readonly name: string;
  readonly workflow: string;
}

/**
 * gh reports `state` beside `bucket`, and an agent may ask for either, so they
 * have to agree: `pending` in one field and `SUCCESS` in the other is a world
 * no repository produces.
 */
export const checkState = (bucket: CheckEntry['bucket']): string => {
  if (bucket === 'pass') return 'SUCCESS';
  if (bucket === 'fail') return 'FAILURE';
  if (bucket === 'pending') return 'PENDING';
  if (bucket === 'skipping') return 'SKIPPED';
  return 'CANCELLED';
};

/**
 * A check as `gh pr checks --json` returns it.
 *
 * The repository is a parameter because the link names it, and which
 * repository a double is pretending to be is the caller's business rather than
 * this package's.
 */
export const checkRecord = (
  check: CheckEntry,
  options: { readonly repoSlug: string },
): Record<string, unknown> => ({
  bucket: check.bucket,
  description: check.description,
  link: `https://github.com/${options.repoSlug}/runs/1`,
  name: check.name,
  state: checkState(check.bucket),
  workflow: check.workflow,
});
