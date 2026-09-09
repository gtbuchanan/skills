/*
 * promptfoo beforeAll/beforeEach extension for this suite.
 *
 * `scenarioSetup` owns the parts every suite has — which scenario is under
 * test, emptying its workspace, dropping the marker the doubles read. What is
 * seeded into that workspace is this suite's own, and deliberately not what
 * `repoScenarioSeeding` does: a scenario here is a committed baseline plus the
 * work the agent is asked to ship, left uncommitted in the tree. What it
 * decides to do with that work is the whole measurement, so the history stops
 * at the baseline and nothing records a tip to count from.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { artifactPath, suiteName } from '@gtbuchanan/agent-skills-harness/paths';
import { scenarioSetup } from '@gtbuchanan/agent-skills-harness/scenario-setup';
import { resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { seedHistory } from '@gtbuchanan/git-fixtures/seed-repo';
import { markerFile } from '@gtbuchanan/stub-runtime/scenario';
import { author } from './repository.ts';
import type { Scenario } from './scenarios.ts';
import { scenarios } from './scenarios.ts';

const suite = suiteName(import.meta.url);

const seedDate = '2026-05-08T09:00:00-05:00';

/**
 * Writes a tree into the workspace, creating directories as it goes.
 */
const writeTree = (workspace: string, tree: Readonly<Record<string, string>>): void => {
  for (const [relative, contents] of Object.entries(tree)) {
    const file = path.join(workspace, ...relative.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
};

const seed = (scenario: Scenario, workspace: string): void => {
  seedHistory({
    author,
    branch: scenario.branch,
    commits: [
      {
        date: seedDate,
        key: 'baseline',
        subject: 'Add the pieces this change touches',
        tree: scenario.committed,
      },
    ],
    git: resolveRealGit(),
    localIdentity: author,
    origin: artifactPath(`${suite}.${scenario.key}.origin.git`),
    workspace,
  });

  /*
  The work under test: present in the tree, absent from history.
  */
  writeTree(workspace, scenario.uncommitted);

  /* The marker the hook writes next would otherwise show up as work the agent
     left behind, and this suite is counting exactly that. */
  writeFileSync(path.join(workspace, '.git', 'info', 'exclude'), `/${markerFile}\n`);
};

const setup = scenarioSetup({ metaUrl: import.meta.url, scenarios, seed });

export const extensionHook = setup.extensionHook;

/* Re-exported so the checker resolves a scenario's workspace through the same
   call the seed wrote it with, rather than spelling the layout a second time
   and agreeing with the seed only by coincidence. */
export { scenarioPath } from '@gtbuchanan/stub-runtime/scenario';
