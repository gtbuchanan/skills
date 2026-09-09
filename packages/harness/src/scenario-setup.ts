/*
 * The promptfoo beforeAll/beforeEach extension for a suite whose scenarios each
 * get a workspace of their own.
 *
 * The scenario under test is built fresh before EACH test, because a suite that
 * lets the agent write for real would otherwise show a previous test's — or a
 * previous `--repeat`'s — work as this run's. Only the scenario under test is
 * built, which is what the beforeEach context is read for. Workspaces are
 * disjoint, so distinct tests do not collide; a test and its own `--repeat`
 * runs share one, which is why `--repeat` still wants `--max-concurrency 1`.
 *
 * What goes into a workspace is the caller's, supplied as `seed`. This owns
 * only what every suite shares whatever its scenarios are made of: which
 * scenario the hook is firing for, emptying its directory first, and dropping
 * the marker that tells the doubles which world they are answering from.
 *
 * Seeding a workspace as a git repository is one thing a caller may do —
 * `repo-scenario.ts` is that seeder — but nothing here assumes it. A suite
 * whose scenarios are a tree of fixtures, a config directory or a set of
 * documents supplies its own `seed` and never touches git.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  type Keyed,
  markerFile,
  scenarioByKey,
  scenarioPath,
} from '@gtbuchanan/stub-runtime/scenario';
import * as v from 'valibot';
import { skillsRoot, suiteRunDir } from './paths.ts';
import { requireHarness, resetRunDir } from './setup.ts';

/**
 * Fills a freshly emptied workspace with whatever the scenario states.
 *
 * The marker file is written afterwards and is not this function's business,
 * which is what lets a seeder that creates a repository decide for itself
 * whether to keep that marker out of the diff under review.
 */
export type ScenarioSeeder<TScenario> = (
  scenario: TScenario,
  workspace: string,
) => void;

/**
 * What a suite supplies: the worlds, how to build one, and where its own files
 * live.
 */
export interface ScenarioSetupOptions<TScenario extends Keyed> {
  /**
   * `import.meta.url` of the suite module calling this, which is what names the
   * suite and therefore its call logs.
   */
  readonly metaUrl: string;
  readonly scenarios: readonly TScenario[];
  readonly seed: ScenarioSeeder<TScenario>;
}

/**
 * The scenario a beforeEach is firing for. Parsed rather than trusted: an
 * unnamed scenario means nothing is built, and every later failure is about a
 * workspace that was never written.
 */
const HookVarsSchema = v.object({ scenario: v.string() });
const HookTestSchema = v.object({ vars: HookVarsSchema });
const HookContextSchema = v.object({ test: HookTestSchema });

export const scenarioSetup = <TScenario extends Keyed>(
  options: ScenarioSetupOptions<TScenario>,
): { readonly extensionHook: (hookName: string, context: unknown) => void } => {
  const logDir = suiteRunDir(options.metaUrl);

  const buildOne = (scenario: TScenario, root: string): void => {
    const workspace = path.join(root, ...scenarioPath(scenario.key).split('/'));
    /* A scenario owns its directory outright, so it is removed rather than
       reset — a leftover file from a previous run is indistinguishable from
       work the agent was meant to find. */
    rmSync(workspace, { force: true, recursive: true });
    mkdirSync(workspace, { recursive: true });

    options.seed(scenario, workspace);

    writeFileSync(path.join(workspace, markerFile), `${scenario.key}\n`);
  };

  const extensionHook = (hookName: string, context: unknown): void => {
    /* Building writes into the runner's workspace. Outside the harness there is
       none to write into — skillsRoot() throws rather than guess — and this
       keeps the failure explicit either way. */
    if (hookName === 'beforeAll') {
      requireHarness('scenario workspaces');
      /* Cleared once for the run, not once per test: each scenario writes its
         own file, so a test never has to empty a log another one is writing to.
         That is what lets distinct tests run at the same time. */
      resetRunDir(logDir);
      return;
    }
    if (hookName !== 'beforeEach') return;

    const key = v.parse(HookContextSchema, context).test.vars.scenario;
    buildOne(scenarioByKey(options.scenarios, key), skillsRoot());
  };

  return { extensionHook };
};
