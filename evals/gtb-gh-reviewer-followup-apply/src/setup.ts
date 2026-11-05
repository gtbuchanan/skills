// promptfoo beforeAll/beforeEach extension: one workspace per test.
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import type { Keyed } from '@gtbuchanan/cli-doubles/scenario';
import { suiteDir } from '@gtbuchanan/promptfoo-agent/paths';
import { scenarioSetup } from '@gtbuchanan/promptfoo-agent/scenario-setup';
import { scenarios } from './scenarios.ts';

/**
 * A seed that copies a scenario's approved action list into its workspace.
 */
export const seedFromFixtures = (
  fixturesDir: string,
): ((scenario: Keyed, workspace: string) => void) =>
  (scenario, workspace) => {
    copyFileSync(
      path.join(fixturesDir, scenario.key, 'actions.json'),
      path.join(workspace, 'actions.json'),
    );
  };

const fixturesDir = path.join(suiteDir(import.meta.url), 'fixtures');

const setup = scenarioSetup({
  metaUrl: import.meta.url,
  scenarios,
  seed: seedFromFixtures(fixturesDir),
});

export const extensionHook = setup.extensionHook;
