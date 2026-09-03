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
 * The identity it reports comes from ../scenario.ts, which the fake `git` reads
 * too — the two describe one world, so an agent that cross-checks them with
 * `git remote` finds the repository `gh repo view` named.
 *
 * The `reviews` call carries a `--jq` that selects the viewer's latest submitted
 * review; jq does not run here, so the stub emulates that selection over
 * reviews.json and returns the resulting object. Scalar `--jq` reads (login,
 * nameWithOwner) are returned as plain strings, matching real gh output.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  readReviews,
  repo,
  scenarioDir,
  selectLastOwnReview,
  viewer,
} from '../scenario.ts';
import { joined, logCall, writeLine } from '@gtbuchanan/agent-skills-harness/stub';

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

if (joined.includes('api user')) {
  writeLine(viewer);
} else if (joined.includes('repo view')) {
  writeLine(repo);
} else if (joined.includes('graphql')) {
  writeLine(readFileSync(path.join(dir, 'threads.graphql.json'), 'utf8'));
} else if (/\breviews\b/v.test(joined)) {
  writeLine(lastOwnReview());
} else {
  /* Unknown/mutating call: it was logged above, so the checker still catches a
     read-only violation. Return empty success so the skill doesn't crash. */
  writeLine('{}');
}

process.exit(0);
