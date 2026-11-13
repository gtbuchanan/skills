/*
 * Readies one suite to run: an isolated environment and a workspace holding its
 * skills. The steps that touch the filesystem are passed in, so what a failure
 * leaves behind can be tested without minting real directories.
 */
import type { LoadedSuiteConfig } from './suite-config.ts';

/**
 * What a suite's setup produced. A failed setup still names the workspace, so
 * the runner can keep it as evidence.
 */
export type SuiteSetup =
  | { readonly kind: 'failed'; readonly out: string; readonly workspace: string }
  | {
    readonly kind: 'ready';
    readonly env: Record<string, string>;
    readonly workspace: string;
  };

export interface SuiteSetupSteps {
  readonly isolatedEnv: (suite: LoadedSuiteConfig) => { readonly env: Record<string, string> };
  readonly loadConfig: (name: string) => Promise<LoadedSuiteConfig>;
  readonly mintWorkspace: () => string;
  readonly populateWorkspace: (
    workspace: string,
    name: string,
    env: Record<string, string>,
  ) => void;
}

/**
 * Sets up suite `name`, building its env from its eval config. An eval config
 * that will not load, an env it cannot have, or a workspace that cannot be
 * populated fails that suite alone, with the error as its output, rather than
 * the whole run.
 */
export const setUpSuite = async (name: string, steps: SuiteSetupSteps): Promise<SuiteSetup> => {
  const workspace = steps.mintWorkspace();
  try {
    const { env } = steps.isolatedEnv(await steps.loadConfig(name));
    steps.populateWorkspace(workspace, name, env);
    return { env, kind: 'ready', workspace };
  } catch (error) {
    return { kind: 'failed', out: String(error), workspace };
  }
};
