/*
 * What a suite whose GitHub is the fake adds to its eval environment, through
 * its `eval.config.ts`:
 *
 * ```ts
 * export default defineSuite({ env: [fakeGitHubEnv] });
 * ```
 *
 * gh stays shadowed on the scrubbed PATH, so an agent's `gh` always reaches
 * the spy. The spy hands each call to the real gh, which it finds through
 * `GH_REAL` here.
 */
import path from 'node:path';
import { realGhVar } from '@gtbuchanan/github-cli-spy/handoff';
import type { EnvContributor } from '@gtbuchanan/promptfoo-agent/suite-config';

export const fakeGitHubEnv: EnvContributor = {
  env: ({ homeDir, realTool, source }) => {
    const realGh = source[realGhVar] ?? realTool('gh');

    return {
      /* An agent can run GH_REAL itself, past the spy. Left to its default, gh
         on Windows reads its config from APPDATA, which the eval env passes
         on, and finds the developer's login there. */
      GH_CONFIG_DIR: path.join(homeDir, '.config', 'gh'),
      ...(realGh !== undefined && { [realGhVar]: realGh }),
    };
  },
  reads: [realGhVar],
};
