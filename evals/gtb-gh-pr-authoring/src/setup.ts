/*
 * promptfoo beforeAll/beforeEach extension for this suite.
 *
 * All of the work is `@gtbuchanan/agent-skills-harness/scenario-setup`, which
 * seeds the scenario under test fresh before each test and records the tip the
 * agent starts from. What is this suite's is the worlds and the identity they
 * are authored under; everything else is shared with every other suite that
 * runs against a real repository.
 *
 * `baselinesPath` is re-exported because the checker reads the manifest the
 * seed writes, and having both derive it from the same call is what stops them
 * disagreeing about where it lives.
 */
import { scenarioSetup } from '@gtbuchanan/agent-skills-harness/scenario-setup';
import { author } from './repository.ts';
import { scenarios } from './scenarios.ts';

const setup = scenarioSetup({
  author,
  metaUrl: import.meta.url,
  scenarios,
});

export const baselinesPath = setup.baselinesPath;
export const extensionHook = setup.extensionHook;
