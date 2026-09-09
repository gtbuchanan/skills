/*
 * promptfoo beforeAll/beforeEach extension for this suite.
 *
 * Two shared pieces, composed: `scenarioSetup` owns the parts every suite has
 * — which scenario is under test, emptying its workspace, dropping the marker
 * the doubles read — and `repoScenarioSeeding` fills that workspace, because
 * these scenarios state a history rather than a tree of files.
 *
 * What is this suite's is the worlds and the identity they are authored under.
 *
 * `baselinesPath` is re-exported because the checker reads the manifest the
 * seed writes, and having both derive it from the same call is what stops them
 * disagreeing about where it lives.
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
