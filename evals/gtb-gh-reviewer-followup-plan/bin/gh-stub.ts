#!/usr/bin/env node
/*
 * Fake `gh` for this read-path eval. It never touches the network:
 * it appends every invocation (argv) as a JSON line to $STUB_LOG and returns
 * canned data from $SCENARIO_DIR so the skill can proceed. plan-check.ts reads
 * the log to assert the skill stayed read-only and hit the right endpoints.
 *
 * Reached as `gh`: the runner installs a wrapper into STUB_BINDIR, at the front
 * of the eval PATH, that execs this file. The real gh CLI is never reachable
 * from a suite.
 *
 * The identity it reports comes from the scenario module, which the fake `git`
 * reads too — the two describe one world, so an agent that cross-checks them with
 * `git remote` finds the repository `gh repo view` named.
 *
 * The `reviews` call carries a `--jq` that selects the viewer's latest submitted
 * review; jq does not run here, so the stub emulates that selection over
 * reviews.json and returns the resulting object. Scalar `--jq` reads (login,
 * nameWithOwner) are returned as plain strings, matching real gh output.
 *
 * Anything else is refused. Answering an empty `{}` instead would let a
 * mutating call carry on so the checker still sees it as a read-only
 * violation — but logging happens before the response either way, so the
 * violation is caught without that, and the same answer tells an agent that an
 * unknown *read* found nothing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { argv, joined, logCall } from '@gtbuchanan/agent-skills-harness/stub';
import { dispatch } from '@gtbuchanan/github-cli-stub/dispatch';
import {
  readReviews,
  repo,
  scenarioDir,
  selectLastOwnReview,
  viewer,
} from '#src/scenario.ts';

logCall('gh');

const dir = scenarioDir();

/**
 * @returns the viewer's latest submitted review, as gh's --jq would
 */
const lastOwnReview = (): string => {
  const last = selectLastOwnReview(readReviews(dir), viewer);

  return JSON.stringify(
    last
      ? {
          commit_id: last.commit_id,
          state: last.state,
          submitted_at: last.submitted_at,
        }
      : {},
  );
};

const outcome = dispatch({ argv, stdin: '' }, [
  {
    matches: () => joined.includes('api user'),
    name: 'api user',
    respond: () => ({ stdout: `${viewer}\n` }),
  },
  {
    matches: () => joined.includes('repo view'),
    name: 'repo view',
    respond: () => ({ stdout: `${repo}\n` }),
  },
  {
    matches: () => joined.includes('graphql'),
    name: 'api graphql',
    respond: () => ({
      stdout: readFileSync(path.join(dir, 'threads.graphql.json'), 'utf8'),
    }),
  },
  {
    matches: () => /\breviews\b/v.test(joined),
    name: 'reviews',
    respond: () => ({ stdout: `${lastOwnReview()}\n` }),
  },
]);

process.stdout.write(outcome.stdout);
process.stderr.write(outcome.stderr);
process.exit(outcome.code);
