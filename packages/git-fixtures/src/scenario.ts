/*
 * Which seeded world a call is standing in.
 *
 * A double runs as its own process with nothing but a working directory to go
 * on, so the seed drops a marker naming the scenario at the root of each
 * checkout and every double walks up to it. Walking rather than reading an
 * environment variable is what lets the code under test move around inside its
 * checkout without the answers changing, and it is what lets several checkouts
 * exist at once — which is the whole of how these tests run concurrently.
 *
 * Generic over the scenario, because what a world states is the caller's
 * business and only the key is this module's. A scenario is anything with one.
 *
 * Loaded by stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Names the scenario a checkout was seeded as. Read by the doubles, written by
 * the seed — neither derives it, so they cannot disagree.
 */
export const markerFile = '.eval-scenario';

/**
 * Where a scenario's checkout lives, relative to the workspace holding them.
 */
export const scenarioPath = (key: string): string => `scenarios/${key}`;

/**
 * The minimum a scenario has to be for this module to find it.
 */
export interface Keyed {
  readonly key: string;
}

/**
 * A located checkout: which world it is, and where it lives.
 *
 * The directory matters because a double sometimes has to remember something
 * between calls — an asynchronous merge pending in one process and finished in
 * the next — and the checkout is the only place both can see.
 */
export interface Located<TScenario> {
  readonly dir: string;
  readonly scenario: TScenario;
}

/**
 * The scenario with this key, or a thrown error rather than a silent default —
 * a double serving the wrong world is far harder to diagnose than one that
 * stops.
 */
export const scenarioByKey = <TScenario extends Keyed>(
  scenarios: readonly TScenario[],
  key: string,
): TScenario => {
  const found = scenarios.find(scenario => scenario.key === key);
  if (found === undefined)
    throw new Error(
      `no scenario named "${key}": the marker file names a world this suite ` +
      'does not define.',
    );

  return found;
};

/**
 * The scenario whose checkout contains `start`.
 *
 * Refuses rather than guessing: a call made outside every checkout cannot be
 * answered at all, and answering it from some default world would hand the
 * code under test state belonging to a scenario it is not in.
 */
export const locateScenario = <TScenario extends Keyed>(
  scenarios: readonly TScenario[],
  start: string,
): Located<TScenario> => {
  let dir = path.resolve(start);
  for (;;) {
    const marker = path.join(dir, markerFile);
    if (existsSync(marker))
      return {
        dir,
        scenario: scenarioByKey(scenarios, readFileSync(marker, 'utf8').trim()),
      };

    const parent = path.dirname(dir);
    if (parent === dir)
      throw new Error(
        `no ${markerFile} at or above ${start}: this call was made outside ` +
        'every seeded checkout, and there is no world to answer it from.',
      );
    dir = parent;
  }
};
