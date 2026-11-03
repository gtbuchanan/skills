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
import type { StubResponse } from '@gtbuchanan/stub-runtime/dispatch';
import { pick, requestedFields } from './selection.ts';

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
 * The state gh reports beside each bucket.
 *
 * A table rather than a chain of tests, so that adding a bucket fails to
 * compile until it is given a state. The chain this replaced ended in an
 * unguarded fallback, which would have answered `CANCELLED` for a bucket
 * nobody had mapped — a state the agent acts on, from the one package that
 * exists to refuse rather than guess.
 */
const stateOf: Record<CheckEntry['bucket'], string> = {
  cancel: 'CANCELLED',
  fail: 'FAILURE',
  pass: 'SUCCESS',
  pending: 'PENDING',
  skipping: 'SKIPPED',
};

/**
 * gh reports `state` beside `bucket`, and an agent may ask for either, so they
 * have to agree: `pending` in one field and `SUCCESS` in the other is a world
 * no repository produces.
 */
export const checkState = (bucket: CheckEntry['bucket']): string => stateOf[bucket];

/**
 * Where a check's run lives. One run for every check, since no double here
 * serves the run itself.
 */
const checkLink = (repoSlug: string): string => `https://github.com/${repoSlug}/runs/1`;

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
  link: checkLink(options.repoSlug),
  name: check.name,
  state: checkState(check.bucket),
  workflow: check.workflow,
});

/**
 * gh's documented exit status for checks that have not finished.
 */
const checksPendingExit = 8;

/**
 * The exit status gh's table reports: failures first, then anything still
 * running. A cancelled check counts as neither.
 */
const tableExit = (checks: readonly CheckEntry[]): number => {
  if (checks.some(check => check.bucket === 'fail')) return 1;
  if (checks.some(check => check.bucket === 'pending')) return checksPendingExit;

  return 0;
};

/**
 * One row of the table gh prints when its output is not a terminal, which is
 * what an agent's shell gives it: name, status, elapsed, link, description.
 *
 * gh folds `cancel` into `fail` in the status column, and prints `0` for an
 * elapsed time it cannot compute. No double here models timings.
 */
const tableRow = (check: CheckEntry, link: string): string =>
  [
    check.name,
    check.bucket === 'cancel' ? 'fail' : check.bucket,
    '0',
    link,
    check.description,
  ].join('\t');

/**
 * What `gh pr checks` answers for `checks`, on the branch the call is about.
 *
 * Taken from gh's own source (`pkg/cmd/pr/checks`) rather than from what a
 * terminal shows, because a terminal is the one place an agent never sees it:
 * the summary line and the coloured marks are printed only to a TTY.
 */
export const checksAnswer = (
  checks: readonly CheckEntry[],
  options: {
    readonly argv: readonly string[];
    readonly branch: string;
    readonly repoSlug: string;
  },
): StubResponse => {
  if (checks.length === 0) {
    /* An empty list is a failure to gh, not a pass: it says so on stderr and
       exits 1. Tested first, because `[].every()` is true and the success
       branch below would otherwise claim it. */
    return {
      code: 1,
      stderr: `no checks reported on the '${options.branch}' branch\n`,
      stdout: '',
    };
  }

  const selection = requestedFields(options.argv);

  if (selection.kind !== 'all') {
    /* gh writes the export and returns before it looks at the counts, so a
       `--json` call exits 0 whatever the checks say.

       `--jq` is not evaluated — no double here runs jq — so a call that asked
       for one gets the selected fields and reads them itself. That is more
       than it asked for, which a double normally must not answer; it is
       allowed only because the alternative is guessing at an expression the
       skill does not fix, and the fields themselves are still narrowed. */
    const records = checks.map(check => pick(checkRecord(check, options), selection));
    return { code: 0, stdout: `${JSON.stringify(records)}\n` };
  }

  /* A scenario whose task says the checks are still running has to say so
     here too, or the agent reads the contradiction and acts on the world. */
  return {
    code: tableExit(checks),
    stdout: checks
      .map(check => `${tableRow(check, checkLink(options.repoSlug))}\n`)
      .join(''),
  };
};
