/*
 * Hosting the fake GitHub for one eval, in promptfoo's own process.
 *
 * The suite's gh spy runs as a separate process and reaches the fake by its
 * port, which this names in the environment every agent, and so every spy,
 * inherits. Hosted here rather than in a process of its own, a suite's worlds
 * are plain functions over its scenarios, with nothing to serialise.
 *
 * Each scenario's world is rebuilt whenever its workspace is seeded, which
 * happens before every test, so no test inherits what an earlier one merged.
 * What the fake refuses lands in the run log of the call that caused it.
 */
import { fakePortVar } from '@gtbuchanan/github-cli-spy/handoff';
import { logRefusalToRun } from '@gtbuchanan/github-cli-spy/refusals';
import { startFakeGitHub } from '@gtbuchanan/github-fake/server';
import type { World } from '@gtbuchanan/github-fake/world';
import type { ScenarioSeeder } from '@gtbuchanan/promptfoo-agent/scenario-setup';

/**
 * A promptfoo extension hook.
 */
export type ExtensionHook = (hookName: string, context: unknown) => Promise<void> | void;

export interface HostingOptions<TScenario> {
  /**
   * Where the port is named for the spies: this process's environment unless
   * given, which the agent and its spies inherit.
   */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * The world a scenario's workspace is answered from, built when it is seeded.
   */
  readonly world: (scenario: TScenario, workspace: string) => World;
}

export interface Hosting<TScenario> {
  /**
   * The suite's extension hook, with the fake started before the eval and
   * stopped after it.
   */
  readonly hooked: (inner: ExtensionHook) => ExtensionHook;
  /**
   * The suite's seeder, with the scenario's world rebuilt after it runs.
   */
  readonly seeding: (seed: ScenarioSeeder<TScenario>) => ScenarioSeeder<TScenario>;
}

export const hostFakeGitHub = <TScenario extends { readonly key: string }>(
  options: HostingOptions<TScenario>,
): Hosting<TScenario> => {
  const { env = process.env, world } = options;
  const worlds = new Map<string, World>();

  const seeding = (seed: ScenarioSeeder<TScenario>): ScenarioSeeder<TScenario> =>
    (scenario, workspace) => {
      seed(scenario, workspace);
      worlds.set(scenario.key, world(scenario, workspace));
    };

  let close: (() => Promise<void>) | undefined;

  const hooked = (inner: ExtensionHook): ExtensionHook => async (hookName, context) => {
    if (hookName === 'beforeAll') {
      const fake = await startFakeGitHub({
        onRefusal: (refusal) => {
          logRefusalToRun(refusal);
        },
        worlds: key => worlds.get(key),
      });
      close = fake.close;
      env[fakePortVar] = String(fake.port);
    }

    await inner(hookName, context);

    if (hookName === 'afterAll') await close?.();
  };

  return { hooked, seeding };
};
