/*
 * Building a scenario's workspace as a git repository.
 *
 * One `seed` a suite can hand `scenarioSetup`, for scenarios that state a
 * history rather than a tree of files. Kept apart from the hook itself because
 * a repository is a choice: a suite whose scenarios are fixtures, documents or
 * configuration builds its workspace some other way and never reaches this
 * module — nor `git-fixtures`, which only this pulls in.
 *
 * Seeding is cheap: local git, a couple of commits, and a bare origin beside it
 * so `push` and `fetch` succeed with no network and no credential.
 *
 * The baseline tip is recorded per scenario because whatever counts what the
 * agent added reads the manifest written here rather than re-deriving it, so
 * the two cannot disagree about where the baseline ended.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import {
  type GitRunner,
  type SeedCommit,
  type SeedIdentity,
  captureGit,
  runGit,
  seedHistory,
} from '@gtbuchanan/git-fixtures/seed-repo';
import { parseJson } from '@gtbuchanan/stub-runtime/calls';
import { markerFile } from '@gtbuchanan/stub-runtime/scenario';
import * as v from 'valibot';
import { artifactPath, suiteName } from './paths.ts';
import type { ScenarioSeeder } from './scenario-setup.ts';

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
 * The history half of a scenario — all this module reads of one.
 */
export interface RepoScenario {
  readonly branch: string;
  readonly commits: readonly SeedCommit[];
  readonly extra?: SeedExtra | undefined;
  readonly key: string;
}

/**
 * What a suite supplies to seed repositories: who authored them, and which
 * suite's artifact directory the origins and baselines belong to.
 */
export interface RepoScenarioOptions {
  /**
   * Who the seeded commits are attributed to, and the repo-local identity the
   * checkout reports.
   */
  readonly author: SeedIdentity;
  /**
   * `import.meta.url` of the suite module calling this.
   */
  readonly metaUrl: string;
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
 * What a suite gets back: the seeder to hand `scenarioSetup`, and where the
 * baselines it records can be read.
 */
export interface RepoScenarioSeeding<TScenario extends RepoScenario> {
  readonly baselinesPath: () => string;
  readonly seed: ScenarioSeeder<TScenario>;
}

export const repoScenarioSeeding = <TScenario extends RepoScenario>(
  options: RepoScenarioOptions,
): RepoScenarioSeeding<TScenario> => {
  const { author, metaUrl } = options;
  const suite = suiteName(metaUrl);

  const baselinesPath = (): string => artifactPath(`${suite}.baselines.json`);

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

  const seed: ScenarioSeeder<TScenario> = (scenario, workspace) => {
    const git = resolveRealGit();

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

    /* The marker is written by the hook after this returns, and committing it
       would put test scaffolding into the diff under review — so it is excluded
       here, while the repository exists and the hook's file does not yet. */
    writeFileSync(path.join(workspace, '.git', 'info', 'exclude'), `/${markerFile}\n`);

    recordTip(scenario.key, captureGit(runner, ['rev-parse', 'HEAD']));
  };

  return { baselinesPath, seed };
};
