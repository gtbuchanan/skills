/*
 * Readies one suite to run: an isolated environment and a workspace holding its
 * skills. The steps that touch the filesystem are passed in, so what a failure
 * leaves behind can be tested without minting real directories.
 */

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
  readonly isolatedEnv: () => { readonly env: Record<string, string> };
  readonly mintWorkspace: () => string;
  readonly populateWorkspace: (
    workspace: string,
    name: string,
    env: Record<string, string>,
  ) => void;
}

/**
 * Sets up suite `name`. A workspace that cannot be populated fails that suite
 * alone, with the error as its output, rather than the whole run.
 */
export const setUpSuite = (name: string, steps: SuiteSetupSteps): SuiteSetup => {
  const { env } = steps.isolatedEnv();
  const workspace = steps.mintWorkspace();
  try {
    steps.populateWorkspace(workspace, name, env);
  } catch (error) {
    return { kind: 'failed', out: String(error), workspace };
  }

  return { env, kind: 'ready', workspace };
};
