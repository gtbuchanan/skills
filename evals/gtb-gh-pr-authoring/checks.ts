/*
 * What `gh pr checks` reports for a scenario.
 *
 * Split from bin/gh-stub.ts because it is a model rather than a dispatch: the
 * stub decides which question was asked, and this decides what the check list
 * looks like in the world it was asked about.
 *
 * The values come from a live pull request rather than from invention. An
 * automated reviewer reports with no `workflow`, and its check passes both for
 * a review that finished and for a draft it declined to read — which is why the
 * skill tells a reader to go by the description rather than the colour.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import { repoSlug } from './repository.ts';
import type { CheckEntry, Scenario } from './shapes.ts';

/**
 * The check list the scenario states, or the single CI check every other
 * scenario has always been served.
 */
export const checksFor = (scenario: Scenario): readonly CheckEntry[] =>
  scenario.checks ?? [
    {
      bucket: scenario.checksPending === true ? 'pending' : 'pass',
      description: '',
      name: 'build',
      workflow: 'CI',
    },
  ];

/**
 * gh reports `state` beside `bucket`, and an agent may ask for either, so they
 * have to agree: `pending` in one field and `SUCCESS` in the other is a world
 * no repository produces.
 */
export const checkState = (bucket: CheckEntry['bucket']): string => {
  if (bucket === 'pass') return 'SUCCESS';
  if (bucket === 'fail') return 'FAILURE';
  if (bucket === 'pending') return 'PENDING';
  return bucket.toUpperCase();
};

export const checkRecord = (check: CheckEntry): Record<string, unknown> => ({
  bucket: check.bucket,
  description: check.description,
  link: `https://github.com/${repoSlug}/runs/1`,
  name: check.name,
  state: checkState(check.bucket),
  workflow: check.workflow,
});
