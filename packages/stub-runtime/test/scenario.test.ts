/*
 * Tests for finding which seeded world a call is standing in.
 *
 * Every double in every suite resolves its answers through this, so the
 * expensive failure is the one that still returns something: a call answered
 * from the wrong world, or from a default world, hands the code under test
 * state belonging to a scenario it is not in — and every assertion about what
 * it called still passes.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import {
  locateScenario,
  markerFile,
  scenarioByKey,
  scenarioPath,
} from '@gtbuchanan/stub-runtime/scenario';

const scenarios = [{ key: 'open-draft' }, { key: 'merge-stacked' }];

/**
 * A throwaway directory seeded as one scenario, plus a nested path inside it.
 */
const seeded = (key: string): { readonly nested: string; readonly root: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'scenario-'));
  writeFileSync(path.join(root, markerFile), `${key}\n`);
  const nested = path.join(root, 'src', 'deep');
  mkdirSync(nested, { recursive: true });

  return { nested, root };
};

test('a scenario is found by the key its marker names', ({ expect }) => {
  expect(scenarioByKey(scenarios, 'merge-stacked')).toBe(scenarios[1]);
});

test('an unknown key stops rather than resolving to a default world', ({ expect }) => {
  /*
   * Returning the first scenario, or undefined, would have a double answer
   * confidently from a world nobody asked for — far harder to diagnose than a
   * call that fails naming the key.
   */
  expect(() => scenarioByKey(scenarios, 'no-such-world')).toThrow('no-such-world');
});

test('the world is found from a subdirectory, not only from the workspace root', ({ expect }) => {
  /*
   * The whole reason for walking up to a marker rather than reading an
   * environment variable is that the code under test moves around inside its
   * workspace. Resolving only at the root would answer from nowhere the moment
   * it did.
   */
  const { nested, root } = seeded('open-draft');
  const located = locateScenario(scenarios, nested);

  expect(located.scenario.key).toBe('open-draft');
  /* The workspace, not the directory the call was made from — a double keeps
     its state file beside the marker. */
  expect(located.dir).toBe(root);
});

test('a call outside every workspace is refused rather than defaulted', ({ expect }) => {
  const outside = mkdtempSync(path.join(tmpdir(), 'unseeded-'));

  expect(() => locateScenario(scenarios, outside)).toThrow(markerFile);
});

test('a workspace lives under the scenarios directory, keyed by name', ({ expect }) => {
  /* The seed writes here and the checker reads here; they agree only because
     both ask this. */
  expect(scenarioPath('merge-stacked')).toBe('scenarios/merge-stacked');
});
