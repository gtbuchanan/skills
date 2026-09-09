/*
 * promptfoo beforeAll/beforeEach extension for this suite.
 *
 * `scenarioSetup` owns the parts every suite has, and `repoScenarioSeeding`
 * fills the workspace, because these scenarios state a history: the branch
 * being merged, and the trailers and authorship a squash message has to carry
 * out of it.
 *
 * `baselinesPath` is re-exported for symmetry with the other repository-backed
 * suites even though nothing here counts commits — a merge scenario asks what
 * the branch became, not how many commits reached it.
 */
import { repoScenarioSeeding } from '@gtbuchanan/agent-skills-harness/repo-scenario';
import { scenarioSetup } from '@gtbuchanan/agent-skills-harness/scenario-setup';
import type { Scenario } from '@gtbuchanan/github-cli-stub/scenario-world';
import { author } from './repository.ts';
import { scenarios } from './scenarios.ts';

const seeding = repoScenarioSeeding<Scenario>({
  author,
  metaUrl: import.meta.url,
});

const setup = scenarioSetup({
  metaUrl: import.meta.url,
  scenarios,
  seed: seeding.seed,
});

export const baselinesPath = seeding.baselinesPath;
export const extensionHook = setup.extensionHook;
