/*
 * promptfoo beforeAll/beforeEach extension for the gtb-pr-review-diff suite.
 *
 * Two things have to exist before the skill runs: a checkout of the PR, and
 * canned GitHub data that agrees with it. The checkout is seeded for real
 * (seed.ts), so the object names are not knowable until it exists — which is
 * why the reviews fixture names commits by plan key and is resolved here,
 * into a scenario directory the fake gh reads via SCENARIO_DIR.
 *
 * It also sets STUB_LOG (fresh each run) so the recording gh/git log their
 * calls where diff-check.ts reads them. The stubs are installed into
 * STUB_BINDIR, at the front of PATH, by the runner — so this suite runs only
 * under the harness, where interception is deterministic and the real CLIs are
 * unreachable.
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readTemplate, resolveShas } from './scenario.ts';
import { seedRepository } from './seed.ts';
import { artifactPath, skillsRoot, suiteCallLog, suiteDir } from '#lib/paths.ts';
import { resolveRealGit } from '#lib/real-git.ts';
import { resetCallLog, truncateCallLog } from '#lib/setup.ts';

const logPath = suiteCallLog(import.meta.url);
const fixtures = path.join(suiteDir(import.meta.url), 'fixtures', 'scenario');

/**
 * Writes the canned GitHub data with the object names seeding produced.
 */
const resolveScenario = (shas: Record<string, string>): string => {
  const resolved = artifactPath('gtb-pr-review-diff.scenario');
  rmSync(resolved, { force: true, recursive: true });
  mkdirSync(resolved, { recursive: true });
  writeFileSync(
    path.join(resolved, 'reviews.json'),
    resolveShas(readTemplate(fixtures, 'reviews.json'), shas),
  );
  /*
  No commit names in the threads, so it is copied rather than resolved.
  */
  copyFileSync(
    path.join(fixtures, 'threads.graphql.json'),
    path.join(resolved, 'threads.graphql.json'),
  );

  return resolved;
};

export const extensionHook = (hookName: string): void => {
  /*
   * diff-check.ts asserts with `some`/`every` over the whole log, so the log
   * has to start empty for each test — otherwise a `--repeat` run's later
   * repeats can be satisfied by an earlier repeat's calls. The suite runs
   * serially (maxConcurrency 1), so a per-test truncation is race-free.
   */
  if (hookName === 'beforeEach') {
    truncateCallLog(logPath);
    return;
  }
  if (hookName !== 'beforeAll') return;

  resetCallLog(logPath);
  const shas = seedRepository({
    git: resolveRealGit(),
    origin: artifactPath('gtb-pr-review-diff.origin.git'),
    workspace: skillsRoot(),
  });
  process.env['SCENARIO_DIR'] = resolveScenario(shas);
};
