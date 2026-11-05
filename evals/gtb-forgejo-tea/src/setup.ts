/*
 * promptfoo beforeAll/beforeEach extension for this suite.
 *
 * Seeds nothing: a workspace is an empty directory holding only the marker,
 * which is the point. Outside a checkout tea cannot infer a login or a
 * repository, and the skill's rule about passing both is only tested there.
 */
import { scenarioSetup } from '@gtbuchanan/agent-skills-harness/scenario-setup';
import { scenarios } from './scenarios.ts';

const setup = scenarioSetup({
  metaUrl: import.meta.url,
  scenarios,
  /* eslint-disable-next-line @typescript-eslint/no-empty-function --
     The world lives in the double; a workspace holds only the marker. */
  seed: () => {},
});

export const extensionHook = setup.extensionHook;
