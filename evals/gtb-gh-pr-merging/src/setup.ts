/*
 * promptfoo beforeAll/beforeEach extension for this suite.
 *
 * `scenarioSetup` owns the parts every suite has, and `repoScenarioSeeding`
 * fills the workspace, because these scenarios state a history: the branch
 * being merged, and the trailers and authorship a squash message has to carry
 * out of it.
 *
 * Spike: the GitHub side is the fake GitHub, started once in this process for
 * the eval, with each scenario's world rebuilt whenever its workspace is. The
 * checkout's origin names the scenario's repository on `github.localhost`, so
 * the real gh recognises it, while git still reaches the local bare origin.
 *
 * `baselinesPath` is re-exported for symmetry with the other repository-backed
 * suites even though nothing here counts commits — a merge scenario asks what
 * the branch became, not how many commits reached it.
 */
import { artifactPath, suiteName } from '@gtbuchanan/agent-skills-harness/paths';
import { repoScenarioSeeding } from '@gtbuchanan/agent-skills-harness/repo-scenario';
import { scenarioSetup } from '@gtbuchanan/agent-skills-harness/scenario-setup';
import { resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { captureGit, runGit } from '@gtbuchanan/git-fixtures/seed-repo';
import { startFakeGitHub } from '@gtbuchanan/github-api-fake/server';
import type { World } from '@gtbuchanan/github-api-fake/world';
import type { Scenario } from '@gtbuchanan/github-cli-stub/scenario-world';
import { author, repoSlug } from './repository.ts';
import { scenarios } from './scenarios.ts';
import { mergingWorld } from './world.ts';

const suite = suiteName(import.meta.url);

const seeding = repoScenarioSeeding<Scenario>({
  author,
  metaUrl: import.meta.url,
  remote: repoSlug,
});

/**
 * Each scenario's world, replaced whenever its workspace is reseeded so no
 * test inherits what an earlier one merged.
 */
const worlds = new Map<string, World>();

const setup = scenarioSetup({
  metaUrl: import.meta.url,
  scenarios,
  seed: (scenario, workspace) => {
    seeding.seed(scenario, workspace);
    const origin = artifactPath(`${suite}.${scenario.key}.origin.git`);

    /* The base branch has to exist on the remote: gh checks it out after a
       merge that deletes the head. The seeder pushes only the scenario's
       branch, so main is its root commit. */
    const runner = { cwd: origin, git: resolveRealGit() };
    const root = captureGit(runner, ['rev-list', '--max-parents=0', scenario.branch]);
    runGit(runner, ['update-ref', 'refs/heads/main', root]);
    runGit({ cwd: workspace, git: runner.git }, ['fetch', '-q', 'origin']);

    worlds.set(scenario.key, mergingWorld(scenario, origin));
  },
});

export const baselinesPath = seeding.baselinesPath;

export const extensionHook = async (hookName: string, context: unknown): Promise<void> => {
  if (hookName === 'beforeAll') {
    const fake = await startFakeGitHub({ worlds: key => worlds.get(key) });
    process.env['GITHUB_FAKE_PORT'] = String(fake.port);
  }

  setup.extensionHook(hookName, context);
};
