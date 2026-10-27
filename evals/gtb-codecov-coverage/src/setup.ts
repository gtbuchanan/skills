/*
 * promptfoo extension for the gtb-codecov-coverage suite.
 *
 * It points the `curl` double at a fresh directory of call logs, and exports
 * the token the private-repository scenario needs.
 *
 * The token is minted here rather than taken from the environment so the suite
 * owns a value it can assert never appeared in the answer. A real credential
 * would make that assertion unrunnable — nobody checks that a secret stayed out
 * of a transcript by putting the secret into the checker's config.
 *
 * One log file per scenario, so the tests run concurrently: the double keys the
 * file off the repository the request named, which it reads out of the URL
 * rather than off the filesystem. Nothing here has a workspace to seed — the
 * document scenarios are fixtures the agent reads in place, and the two API
 * scenarios reach only the double.
 */
import { suiteRunDir } from '@gtbuchanan/agent-skills-harness/paths';
import { resetRunDir } from '@gtbuchanan/agent-skills-harness/setup';

/**
 * The fake personal access token the private scenario authenticates with. Its
 * shape says what it is to anyone who finds it in a log, and
 * `answer-check.ts` fails the test if it reaches the model's answer.
 */
export const stubApiToken = 'stub-codecov-pat-must-not-be-echoed';

export const extensionHook = (hookName: string): void => {
  if (hookName !== 'beforeAll') return;

  resetRunDir(suiteRunDir(import.meta.url));
  process.env['CODECOV_API_TOKEN'] = stubApiToken;
};
