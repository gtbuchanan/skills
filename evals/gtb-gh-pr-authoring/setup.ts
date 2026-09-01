/*
 * promptfoo beforeAll/beforeEach extension for the gtb-gh-pr-authoring suite.
 *
 * The scenario under test is seeded fresh before EACH test. Three of them let
 * the agent commit and push for real, so a checkout carrying a previous test's
 * — or a previous `--repeat`'s — work would make that work look like this
 * run's. Seeding is cheap: local git, a couple of commits, a bare origin beside
 * it so `push` succeeds with no network and no credential.
 *
 * Only that scenario is seeded, not all of them, which is what the beforeEach
 * context is read for. The checkouts are disjoint, so tests do not collide with
 * each other — but a test and its own `--repeat` runs share one, which is why
 * `--repeat` still wants `--max-concurrency 1`. Distinct tests do not need it:
 * they own separate checkouts and, since the stubs key one log file per
 * scenario, separate records of what was asked.
 *
 * The baseline tip is recorded per scenario because the checker counts what the
 * agent added on top of it — reading a manifest the seed wrote rather than
 * re-deriving it, so the two cannot disagree about where the baseline ended.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { author } from './repository.ts';
import type { ExtraCommit, Scenario } from './shapes.ts';
import { markerFile, scenarioByKey, scenarioPath } from './world.ts';
import { parseJson } from '#lib/calls.ts';
import { artifactPath, skillsRoot, suiteRunDir } from '#lib/paths.ts';
import { resolveRealGit } from '#lib/real-git.ts';
import { type GitRunner, captureGit, runGit, seedHistory } from '#lib/seed-repo.ts';
import { requireHarness, resetRunDir } from '#lib/setup.ts';

const logDir = suiteRunDir(import.meta.url);

/**
 * Where the recorded baselines live, for the checker to read back.
 */
export const baselinesPath = (): string =>
  artifactPath('gtb-gh-pr-authoring.baselines.json');

/**
 * The scenario a beforeEach is firing for. Parsed rather than trusted: an
 * unnamed scenario means the suite would seed nothing and every later failure
 * would be about a checkout that was never written.
 */
const HookVarsSchema = v.object({ scenario: v.string() });
const HookTestSchema = v.object({ vars: HookVarsSchema });
const HookContextSchema = v.object({ test: HookTestSchema });

const seedDate = '2026-05-08T09:00:00-05:00';

/**
 * Writes the extra commit a scenario asks for.
 *
 * The shared seeder commits with `-m <subject>` and pushes everything, which
 * leaves two things unexpressible: a commit that exists locally but not on the
 * origin, and a message carrying trailers. Both are the point of the scenarios
 * that ask for one.
 */
const writeExtra = (runner: GitRunner, extra: ExtraCommit, branch: string): void => {
  for (const [relative, contents] of Object.entries(extra.tree)) {
    const file = path.join(runner.cwd, ...relative.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  runGit(runner, ['add', '--', ...Object.keys(extra.tree)]);
  runGit(
    runner,
    [
      'commit',
      '-q',
      '-m',
      extra.subject,
      ...extra.trailers.flatMap(trailer => ['--trailer', trailer]),
    ],
    {
      env: {
        GIT_AUTHOR_DATE: seedDate,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_AUTHOR_NAME: author.name,
        GIT_COMMITTER_DATE: seedDate,
        GIT_COMMITTER_EMAIL: author.email,
        GIT_COMMITTER_NAME: author.name,
      },
    },
  );
  if (extra.push) runGit(runner, ['push', '-q', 'origin', branch]);
};

/**
 * Seeds one scenario's checkout and returns the tip the agent starts from.
 */
const seedOne = (scenario: Scenario, git: string, root: string): string => {
  const workspace = path.join(root, ...scenarioPath(scenario.key).split('/'));
  /* A scenario owns its directory outright, so it is removed rather than reset
   * — a leftover file from a previous run is indistinguishable from work the
   * agent was meant to find. */
  rmSync(workspace, { force: true, recursive: true });

  seedHistory({
    author,
    branch: scenario.branch,
    commits: scenario.commits,
    git,
    localIdentity: author,
    origin: artifactPath(`gtb-gh-pr-authoring.${scenario.key}.origin.git`),
    workspace,
  });

  const runner = { cwd: workspace, git };
  if (scenario.extra) writeExtra(runner, scenario.extra, scenario.branch);

  /* Untracked and never committed: it identifies the world to the stubs, and
   * committing it would put eval scaffolding into the diff under review. */
  writeFileSync(path.join(workspace, '.git', 'info', 'exclude'), `/${markerFile}\n`);
  writeFileSync(path.join(workspace, markerFile), `${scenario.key}\n`);

  return captureGit(runner, ['rev-parse', 'HEAD']);
};

/**
 * Indentation for the recorded manifest, which is read by hand as often as by
 * the checker when a scenario misbehaves.
 */
const jsonIndent = 2;

const TipsSchema = v.record(v.string(), v.string());

/**
 * Records one scenario's baseline, keeping the others. Each test seeds only its
 * own, so rewriting the file wholesale would erase the tips the checker still
 * needs for the tests already run.
 */
const recordTip = (key: string, tip: string): void => {
  const file = baselinesPath();
  mkdirSync(path.dirname(file), { recursive: true });

  let existing: Record<string, string> = {};
  try {
    const recorded = parseJson(readFileSync(file, 'utf8')) ?? {};
    existing = v.parse(TipsSchema, recorded);
  } catch {
    /* No manifest yet, or one this suite did not write: start over rather than
       fail — the tips are rewritten on every run anyway. */
  }

  writeFileSync(
    file,
    `${JSON.stringify({ ...existing, [key]: tip }, undefined, jsonIndent)}\n`,
  );
};

export const extensionHook = (hookName: string, context: unknown): void => {
  /* Seeding writes repositories into the runner's workspace. Outside the
   * harness there is no workspace to write into — skillsRoot() throws rather
   * than guess — and this keeps the failure explicit either way. */
  if (hookName === 'beforeAll') {
    requireHarness('scenario repositories');
    /* Cleared once for the run, not once per test: each scenario writes its
     * own file, so a test never has to empty a log another one is writing to.
     * That is what lets distinct tests run at the same time. */
    resetRunDir(logDir);
    return;
  }
  if (hookName !== 'beforeEach') return;

  const key = v.parse(HookContextSchema, context).test.vars.scenario;
  const scenario = scenarioByKey(key);
  recordTip(key, seedOne(scenario, resolveRealGit(), skillsRoot()));
};
