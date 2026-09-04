/*
 * Which world a call is standing in.
 *
 * The doubles run as separate processes with nothing but a working directory to
 * go on, so the seed drops a marker naming the scenario at the root of each
 * checkout and they walk up to it. Walking rather than reading an environment
 * variable is what lets the agent `cd` around inside its checkout without the
 * answers changing under it.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type Scenario, scenarioByKey } from './scenarios.ts';

/**
 * Names the scenario a checkout was seeded as. Read by the doubles, written by
 * the seed — neither derives it, so they cannot disagree.
 */
export const markerFile = '.eval-scenario';

/**
 * The checkout a call is inside, and the world it states.
 *
 * Refuses rather than guessing: a `gh` call outside every checkout cannot be
 * answered at all, and answering it from some default world would hand the
 * agent a pull request belonging to a scenario it is not in.
 */
export const locateScenario = (
  start: string,
): { readonly dir: string; readonly scenario: Scenario } => {
  let dir = start;
  for (;;) {
    const marker = path.join(dir, markerFile);
    if (existsSync(marker))
      return { dir, scenario: scenarioByKey(readFileSync(marker, 'utf8').trim()) };

    const parent = path.dirname(dir);
    if (parent === dir)
      throw new Error(
        `no ${markerFile} at or above ${start}: this call is outside every ` +
        'seeded checkout, and there is no world to answer it from.',
      );
    dir = parent;
  }
};
