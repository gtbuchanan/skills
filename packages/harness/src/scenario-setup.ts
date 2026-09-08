/*
 * The promptfoo beforeAll/beforeEach extension for a suite that seeds a real
 * repository per scenario.
 *
 * The scenario under test is seeded fresh before EACH test, because a suite
 * that lets the agent commit and push for real would otherwise show a previous
 * test's — or a previous `--repeat`'s — work as this run's. Seeding is cheap:
 * local git, a couple of commits, a bare origin beside it so `push` succeeds
 * with no network and no credential.
 *
 * Only the scenario under test is seeded, which is what the beforeEach context
 * is read for. Checkouts are disjoint, so distinct tests do not collide — but a
 * test and its own `--repeat` runs share one, which is why `--repeat` still
 * wants `--max-concurrency 1`.
 *
 * The baseline tip is recorded per scenario because a checker counting what the
 * agent added reads a manifest the seed wrote rather than re-deriving it, so
 * the two cannot disagree about where the baseline ended.
 *
 * Parameterised rather than copied because three suites want exactly this and
 * differ only in which worlds they state. What stays theirs is the scenario
 * list and the identity the commits are attributed to.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { markerFile, scenarioByKey, scenarioPath } from '@gtbuchanan/git-fixtures/scenario';
import {
  type GitRunner,
  type SeedCommit,
  type SeedIdentity,
  captureGit,
  runGit,
  seedHistory,
} from '@gtbuchanan/git-fixtures/seed-repo';
import { parseJson } from '@gtbuchanan/stub-runtime/calls';
import * as v from 'valibot';
import { artifactPath, skillsRoot, suiteName, suiteRunDir } from './paths.ts';
import { requireHarness, resetRunDir } from './setup.ts';

/**
 * An extra commit written after the history is seeded and pushed.
 *
 * What {@link seedHistory} cannot express, and what some scenario always needs:
 * a commit that exists locally but not on the origin, a message carrying
 * trailers, and a commit somebody else wrote.
 */
export interface SeedExtra {
  readonly author?: SeedIdentity | undefined;
  readonly push: boolean;
  readonly subject: string;
  readonly trailers: readonly string[];
  readonly tree: Readonly<Record<string, string>>;
}

/**
 * The seeding half of a scenario — all this module reads of one.
 */
export interface SeededScenario {
  readonly branch: string;
  readonly commits: readonly SeedCommit[];
  readonly extra?: SeedExtra | undefined;
  readonly key: string;
}

/**
 * What a suite supplies: the worlds, who authored them, and where its own
 * files live.
 */
export interface ScenarioSetupOptions<TScenario extends SeededScenario> {
  /**
   * Who the seeded commits are attributed to, and the repo-local identity the
   * checkout reports.
   */
  readonly author: SeedIdentity;
  /**
   * `import.meta.url` of the suite module calling this, which is what names the
   * suite and therefore its artifacts.
   */
  readonly metaUrl: string;
  readonly scenarios: readonly TScenario[];
}

/**
 * The date every seeded commit carries, so object names are reproducible.
 */
const seedDate = '2026-05-08T09:00:00-05:00';

/**
 * Indentation for the recorded manifest, which is read by hand as often as by
 * a checker when a scenario misbehaves.
 */
const jsonIndent = 2;

const TipsSchema = v.record(v.string(), v.string());

/**
 * The scenario a beforeEach is firing for. Parsed rather than trusted: an
 * unnamed scenario means nothing is seeded and every later failure is about a
 * checkout that was never written.
 */
const HookVarsSchema = v.object({ scenario: v.string() });
const HookTestSchema = v.object({ vars: HookVarsSchema });
const HookContextSchema = v.object({ test: HookTestSchema });

/**
 * Writes the extra commit a scenario asks for.
 *
 * The shared seeder commits with `-m <subject>`, attributes everything to one
 * identity and pushes it all, which leaves all three of those unexpressible —
 * and each is the point of the scenario that asks for one.
 */
const writeExtra = (
  runner: GitRunner,
  extra: SeedExtra,
  branch: string,
  fallbackAuthor: SeedIdentity,
): void => {
  const identity = extra.author ?? fallbackAuthor;
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
        GIT_AUTHOR_EMAIL: identity.email,
        GIT_AUTHOR_NAME: identity.name,
        GIT_COMMITTER_DATE: seedDate,
        GIT_COMMITTER_EMAIL: identity.email,
        GIT_COMMITTER_NAME: identity.name,
      },
    },
  );
  if (extra.push) runGit(runner, ['push', '-q', 'origin', branch]);
};

/**
 * What a suite gets back: the hook promptfoo calls, and where the baselines it
 * records can be read.
 */
export interface ScenarioSetup {
  readonly baselinesPath: () => string;
  readonly extensionHook: (hookName: string, context: unknown) => void;
}

export const scenarioSetup = <TScenario extends SeededScenario>(
  options: ScenarioSetupOptions<TScenario>,
): ScenarioSetup => {
  const { author, metaUrl, scenarios } = options;
  const suite = suiteName(metaUrl);
  const logDir = suiteRunDir(metaUrl);

  const baselinesPath = (): string => artifactPath(`${suite}.baselines.json`);

  /**
   * Seeds one scenario's checkout and returns the tip the agent starts from.
   */
  const seedOne = (scenario: TScenario, git: string, root: string): string => {
    const workspace = path.join(root, ...scenarioPath(scenario.key).split('/'));
    /* A scenario owns its directory outright, so it is removed rather than
       reset — a leftover file from a previous run is indistinguishable from
       work the agent was meant to find. */
    rmSync(workspace, { force: true, recursive: true });

    seedHistory({
      author,
      branch: scenario.branch,
      commits: scenario.commits,
      git,
      localIdentity: author,
      origin: artifactPath(`${suite}.${scenario.key}.origin.git`),
      workspace,
    });

    const runner = { cwd: workspace, git };
    if (scenario.extra) writeExtra(runner, scenario.extra, scenario.branch, author);

    /* Untracked and never committed: it identifies the world to the doubles,
       and committing it would put test scaffolding into the diff under
       review. */
    writeFileSync(path.join(workspace, '.git', 'info', 'exclude'), `/${markerFile}\n`);
    writeFileSync(path.join(workspace, markerFile), `${scenario.key}\n`);

    return captureGit(runner, ['rev-parse', 'HEAD']);
  };

  /**
   * Records one scenario's baseline, keeping the others. Each test seeds only
   * its own, so rewriting the file wholesale would erase the tips a checker
   * still needs for the tests already run.
   */
  const recordTip = (key: string, tip: string): void => {
    const file = baselinesPath();
    mkdirSync(path.dirname(file), { recursive: true });

    let existing: Record<string, string> = {};
    try {
      const recorded = parseJson(readFileSync(file, 'utf8')) ?? {};
      existing = v.parse(TipsSchema, recorded);
    } catch {
      /* No manifest yet, or one this suite did not write: start over rather
         than fail — the tips are rewritten on every run anyway. */
    }

    writeFileSync(
      file,
      `${JSON.stringify({ ...existing, [key]: tip }, undefined, jsonIndent)}\n`,
    );
  };

  const extensionHook = (hookName: string, context: unknown): void => {
    /* Seeding writes repositories into the runner's workspace. Outside the
       harness there is no workspace to write into — skillsRoot() throws rather
       than guess — and this keeps the failure explicit either way. */
    if (hookName === 'beforeAll') {
      requireHarness('scenario repositories');
      /* Cleared once for the run, not once per test: each scenario writes its
         own file, so a test never has to empty a log another one is writing
         to. That is what lets distinct tests run at the same time. */
      resetRunDir(logDir);
      return;
    }
    if (hookName !== 'beforeEach') return;

    const key = v.parse(HookContextSchema, context).test.vars.scenario;
    const scenario = scenarioByKey(scenarios, key);
    recordTip(key, seedOne(scenario, resolveRealGit(), skillsRoot()));
  };

  return { baselinesPath, extensionHook };
};
