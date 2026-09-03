/*
 * Finding the world a call was made in.
 *
 * The fake `gh` is a fresh process per invocation and the agent may run it from
 * anywhere inside the tree, so the scenario cannot come from an environment
 * variable set once. The seed drops a marker file in each checkout instead, and
 * a call walks up from its working directory to find it — which resolves to the
 * world the agent is actually standing in rather than the one the suite last
 * set up.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { scenarios } from './scenarios.ts';
import type { Scenario } from './shapes.ts';

/**
 * The file a seeded checkout is identified by, holding the scenario's key.
 */
export const markerFile = '.eval-scenario';

/**
 * Where a scenario's checkout lives, relative to the eval workspace.
 */
export const scenarioPath = (key: string): string => `scenarios/${key}`;

/**
 * The scenario with this key, or a thrown error rather than a silent default —
 * a stub serving the wrong world is far harder to diagnose than one that stops.
 */
export const scenarioByKey = (key: string): Scenario => {
  const found = scenarios.find(scenario => scenario.key === key);
  if (found === undefined)
    throw new Error(
      `no scenario named "${key}": the marker file names a world this suite ` +
      'does not define.',
    );

  return found;
};

/**
 * A located checkout: which world it is, and where it lives. The directory
 * matters because a double sometimes has to remember something between calls —
 * an asynchronous merge is pending in one process and finished in the next —
 * and the checkout is the only place both can see.
 */
export interface Located {
  readonly dir: string;
  readonly scenario: Scenario;
}

/**
 * The scenario whose checkout contains `start`.
 */
export const locateScenario = (start: string): Located => {
  let dir = path.resolve(start);
  for (;;) {
    const marker = path.join(dir, markerFile);
    if (existsSync(marker))
      return { dir, scenario: scenarioByKey(readFileSync(marker, 'utf8').trim()) };

    const parent = path.dirname(dir);
    if (parent === dir)
      throw new Error(
        `no ${markerFile} at or above ${start}: the call was made outside ` +
        'every seeded scenario checkout.',
      );
    dir = parent;
  }
};
