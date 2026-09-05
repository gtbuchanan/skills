/*
 * promptfoo beforeAll/beforeEach extension for this suite.
 *
 * The scenario under test is seeded fresh before EACH test, because the agent
 * commits, branches and pushes for real: a checkout carrying a previous test's
 * work — or a previous `--repeat`'s — would make that work look like this run's,
 * and this suite counts what the run produced.
 *
 * Only the scenario the test names is seeded, which is what the beforeEach
 * context is read for. The checkouts are disjoint, so tests do not collide; a
 * test and its own repeats share one, which is why `--repeat` wants
 * `--max-concurrency 1`.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  artifactPath,
  skillsRoot,
  suiteName,
  suiteRunDir,
} from '@gtbuchanan/agent-skills-harness/paths';
import { resolveRealGit } from '@gtbuchanan/agent-skills-harness/real-git';
import { seedHistory } from '@gtbuchanan/agent-skills-harness/seed-repo';
import { requireHarness, resetRunDir } from '@gtbuchanan/agent-skills-harness/setup';
import * as v from 'valibot';
import { author } from './repository.ts';
import { type Scenario, scenarioByKey } from './scenarios.ts';
import { markerFile } from './world.ts';

const suite = suiteName(import.meta.url);
const logDir = suiteRunDir(import.meta.url);

const seedDate = '2026-05-08T09:00:00-05:00';

/**
 * The scenario a beforeEach is firing for. Parsed rather than trusted: an
 * unnamed scenario would seed nothing, and every later failure would be about
 * a checkout that was never written.
 */
const HookVarsSchema = v.object({ scenario: v.string() });
const HookTestSchema = v.object({ vars: HookVarsSchema });
const HookContextSchema = v.object({ test: HookTestSchema });

/**
 * Where a scenario's checkout lives, relative to the agent's workspace. Named
 * so the prompt can point at it without the suite and the prompt agreeing by
 * coincidence.
 */
export const scenarioPath = (key: string): string => `scenarios/${key}`;

/**
 * Writes a tree into the checkout, creating directories as it goes.
 */
const writeTree = (workspace: string, tree: Readonly<Record<string, string>>): void => {
  for (const [relative, contents] of Object.entries(tree)) {
    const file = path.join(workspace, ...relative.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
};

/**
 * Seeds one scenario: a committed baseline pushed to a local bare origin, then
 * the uncommitted work the agent is asked to ship left in the tree.
 */
const seedOne = (scenario: Scenario, git: string, root: string): void => {
  const workspace = path.join(root, ...scenarioPath(scenario.key).split('/'));
  /* A scenario owns its directory outright, so it is removed rather than reset
     — a leftover file from a previous run is indistinguishable from work the
     agent was meant to find. */
  rmSync(workspace, { force: true, recursive: true });

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
    git,
    localIdentity: author,
    origin: artifactPath(`${suite}.${scenario.key}.origin.git`),
    workspace,
  });

  /* The work under test: present in the tree, absent from history. What the
     agent decides to do with it is the whole measurement. */
  writeTree(workspace, scenario.uncommitted);

  /* Untracked and never committed: it identifies the world to the stubs, and
     committing it would put eval scaffolding into the diff under review. */
  writeFileSync(path.join(workspace, '.git', 'info', 'exclude'), `/${markerFile}\n`);
  writeFileSync(path.join(workspace, markerFile), `${scenario.key}\n`);
};

export const extensionHook = (hookName: string, context: unknown): void => {
  if (hookName === 'beforeEach') {
    const { test } = v.parse(HookContextSchema, context);
    seedOne(scenarioByKey(test.vars.scenario), resolveRealGit(), skillsRoot());
    return;
  }

  if (hookName !== 'beforeAll') return;

  requireHarness(suite);
  resetRunDir(logDir);
};
