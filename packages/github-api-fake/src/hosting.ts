/*
 * Hosting the fake for one eval, in promptfoo's own process.
 *
 * The suite's doubles run as separate processes and reach the fake by its
 * port, which this names in the environment every agent, and so every double,
 * inherits. Hosted here rather than in a process of its own, a suite's worlds
 * are plain functions over its scenarios, with nothing to serialise.
 *
 * Each scenario's world is rebuilt whenever its workspace is seeded, which
 * happens before every test, so no test inherits what an earlier one merged.
 */
import { fakePortVar } from './gh-env.ts';
import { startFakeGitHub } from './server.ts';
import type { World } from './world.ts';

/**
 * Fills a freshly emptied workspace with whatever a scenario states, as
 * `scenarioSetup` takes one.
 */
export type Seeder<TScenario> = (scenario: TScenario, workspace: string) => void;

/**
 * A promptfoo extension hook.
 */
export type ExtensionHook = (hookName: string, context: unknown) => Promise<void> | void;

export interface HostingOptions<TScenario> {
  /**
   * Where the port is named for the doubles: this process's environment, which
   * the agent and its doubles inherit.
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
  readonly seeding: (seed: Seeder<TScenario>) => Seeder<TScenario>;
}

export const hostFakeGitHub = <TScenario extends { readonly key: string }>(
  options: HostingOptions<TScenario>,
): Hosting<TScenario> => {
  const { env = process.env, world } = options;
  const worlds = new Map<string, World>();

  const seeding = (seed: Seeder<TScenario>): Seeder<TScenario> => (scenario, workspace) => {
    seed(scenario, workspace);
    worlds.set(scenario.key, world(scenario, workspace));
  };

  let close: (() => Promise<void>) | undefined;

  const hooked = (inner: ExtensionHook): ExtensionHook => async (hookName, context) => {
    if (hookName === 'beforeAll') {
      const fake = await startFakeGitHub({ worlds: key => worlds.get(key) });
      close = fake.close;
      env[fakePortVar] = String(fake.port);
    }

    await inner(hookName, context);

    if (hookName === 'afterAll') await close?.();
  };

  return { hooked, seeding };
};
