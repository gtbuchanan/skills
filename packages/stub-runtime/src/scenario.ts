/*
 * Which seeded world a call is standing in.
 *
 * A double runs as its own process with nothing but a working directory to go
 * on, so the seed drops a marker naming the scenario at the root of each
 * workspace and every double walks up to it. Walking rather than reading an
 * environment variable is what lets the code under test move around inside its
 * workspace without the answers changing, and it is what lets several
 * workspaces exist at once — which is the whole of how these tests run
 * concurrently.
 *
 * A workspace is a directory and nothing more. Seeding one as a git repository
 * is what the suites here happen to do, not what this requires: a marker file
 * and a walk upwards work the same for a tree of fixtures, a config directory,
 * or anything else a skill is run against. That is why this sits beside the
 * rest of a double's plumbing rather than beside the git helpers.
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
 * Names the scenario a workspace was seeded as. Read by the doubles, written by
 * the seed — neither derives it, so they cannot disagree.
 */
export const markerFile = '.eval-scenario';

/**
 * Where a scenario's workspace lives, relative to the root holding them.
 */
export const scenarioPath = (key: string): string => `scenarios/${key}`;

/**
 * The minimum a scenario has to be for this module to find it.
 */
export interface Keyed {
  readonly key: string;
}

/**
 * A located workspace: which world it is, and where it lives.
 *
 * The directory matters because a double sometimes has to remember something
 * between calls — an asynchronous merge pending in one process and finished in
 * the next — and the workspace is the only place both can see.
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
 * The scenario whose workspace contains `start`.
 *
 * Refuses rather than guessing: a call made outside every workspace cannot be
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
        'every seeded workspace, and there is no world to answer it from.',
      );
    dir = parent;
  }
};
