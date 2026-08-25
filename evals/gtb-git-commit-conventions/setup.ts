/*
 * promptfoo beforeAll/beforeEach extension for the gtb-git-commit-conventions suite.
 *
 * Every scenario is seeded fresh before EACH test, not once per run. The
 * checker measures what the agent added on top of a known baseline tip, so a
 * repository carrying a previous test's (or a previous `--repeat`'s) commits
 * would make those commits look like this run's work. Re-seeding is cheap —
 * local git, a handful of commits — and it is what makes repeats independent
 * samples. Per-test re-seeding is race-free only because the suite is serial
 * (maxConcurrency 1).
 *
 * It also records each scenario's baseline: the tip the agent starts from, and
 * every planned commit's object name, since seeding is what mints them. The
 * checker reads that manifest rather than re-deriving it, so the two cannot
 * disagree about where the baseline ended and the agent's work began.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { author, branch, committer, scenarioPath, scenarios } from './scenarios.ts';
import { artifactPath, skillsRoot } from '#lib/paths.ts';
import { resolveRealGit } from '#lib/real-git.ts';
import { captureGit, seedHistory } from '#lib/seed-repo.ts';
import { requireHarness } from '#lib/setup.ts';

/**
 * What a scenario looked like before the agent touched it.
 */
export interface Baseline {
  /**
   * Planned commit object names, by plan key — how a test names the commit it
   * is about (the one to revert, say) without hardcoding a sha.
   */
  readonly shas: Record<string, string>;
  /**
   * The commit the agent starts from. Anything reachable from HEAD but not
   * from this is the agent's own work.
   */
  readonly tip: string;
}

/**
 * Where the recorded baselines live, for the checker to read back. Named for
 * the suite, as the other suites name their call logs, so it stays inspectable
 * under a stable path after a run.
 */
export const baselinesPath = (): string =>
  artifactPath('gtb-git-commit-conventions.baselines.json');

const seedAll = (): Record<string, Baseline> => {
  const git = resolveRealGit();
  const root = skillsRoot();
  const baselines: Record<string, Baseline> = {};

  for (const scenario of scenarios) {
    const workspace = path.join(root, ...scenarioPath(scenario.key).split('/'));
    /* A scenario owns its directory outright, so it is removed rather than
     * reset — a leftover file from a previous run is indistinguishable from
     * pending work the agent was meant to find. */
    rmSync(workspace, { force: true, recursive: true });

    const shas = seedHistory({
      author,
      branch,
      commits: scenario.baseline,
      git,
      localIdentity: committer,
      workspace,
    });

    /* Written after the history, and never staged: this is the pending work
     * the agent is asked to deal with, so it has to show up in `git status`. */
    for (const [relative, contents] of Object.entries(scenario.pending)) {
      const file = path.join(workspace, ...relative.split('/'));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, contents);
    }

    baselines[scenario.key] = {
      shas,
      tip: captureGit({ cwd: workspace, git }, ['rev-parse', 'HEAD']),
    };
  }

  return baselines;
};

/**
 * Indentation for the recorded manifest, which is read by hand as often as
 * by the checker when a scenario misbehaves.
 */
const jsonIndent = 2;

const record = (baselines: Record<string, Baseline>): void => {
  const file = baselinesPath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(baselines, undefined, jsonIndent)}\n`);
};

export const extensionHook = (hookName: string): void => {
  if (hookName !== 'beforeAll' && hookName !== 'beforeEach') return;

  /* Seeding writes repositories into the runner's workspace. Outside the
   * harness there is no workspace to write into — skillsRoot() throws rather
   * than guess — and this keeps the failure explicit either way. */
  requireHarness('scenario repositories');
  record(seedAll());
};
