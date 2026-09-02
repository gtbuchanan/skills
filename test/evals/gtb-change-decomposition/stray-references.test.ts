/*
 * Tests for the isolation check's path reasoning.
 *
 * This logic was first exercised by prompting an eval agent to read a sibling
 * scenario, which is a poor way to test it: the agents mostly declined the
 * instruction, so four of five runs made no cross-scenario call at all and the
 * suite went green without the branch ever executing. A green run that proves
 * nothing is the exact failure this check exists to prevent, so the reasoning
 * is pinned here instead — it is pure, and needs no agent to exercise.
 *
 * The cases that matter are the ones a literal `scenarios/<other>` match
 * misses, since that is what this replaced: traversal that resolves into a
 * sibling while naming this scenario, globs that expand across all of them, and
 * a bare `scenarios` that walks the lot.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { strayReferences } from '#evals/gtb-change-decomposition/plan-check.ts';

const own = 'layer-trap';

/**
 * A recorded tool call carrying `command` — the shape a Bash call arrives in.
 */
const bash = (command: string): { input: unknown; name: string } => ({
  input: { command },
  name: 'Bash',
});

test('accepts a path inside the scenario under test', ({ expect }) => {
  expect(strayReferences(bash('find ./scenarios/layer-trap -type f'), own)).toStrictEqual([]);
});

test('accepts an absolute path inside the scenario under test', ({ expect }) => {
  const call = {
    input: {
      file_path: String.raw`C:\Temp\skills-eval-ws-A\scenarios\layer-trap\src\api\reports.ts`,
    },
    name: 'Read',
  };

  expect(strayReferences(call, own)).toStrictEqual([]);
});

test('flags a sibling named outright', ({ expect }) => {
  const found = strayReferences(bash('cat scenarios/leave-whole/src/webhook/types.ts'), own);

  expect(found).toStrictEqual(['Bash → scenarios/leave-whole/src/webhook/types.ts']);
});

test('flags traversal that resolves into a sibling', ({ expect }) => {
  // Names this scenario, reads another. A literal `scenarios/<other>` match
  // never sees it, which is why that approach was replaced.
  const found = strayReferences(
    bash('cat scenarios/layer-trap/../leave-whole/src/webhook/types.ts'),
    own,
  );

  expect(found).toStrictEqual([
    'Bash → scenarios/layer-trap/../leave-whole/src/webhook/types.ts',
  ]);
});

test('flags a glob spanning every scenario', ({ expect }) => {
  expect(strayReferences(bash('cat scenarios/*/src/index.ts'), own)).toStrictEqual([
    'Bash → scenarios/*/src/index.ts',
  ]);
});

test('flags a bare scenarios listing', ({ expect }) => {
  expect(strayReferences(bash('find ./scenarios -type f'), own)).toStrictEqual([
    'Bash → scenarios',
  ]);
});

test('flags traversal that climbs out of the scenarios tree', ({ expect }) => {
  expect(strayReferences(bash('cat scenarios/layer-trap/../../secrets.txt'), own)).toStrictEqual([
    'Bash → scenarios/layer-trap/../../secrets.txt',
  ]);
});

test('reports each distinct reference in one call', ({ expect }) => {
  const found = strayReferences(
    bash('diff scenarios/leave-whole/src/webhook/types.ts scenarios/fog/src/search/rank.ts'),
    own,
  );

  expect(found).toStrictEqual([
    'Bash → scenarios/leave-whole/src/webhook/types.ts',
    'Bash → scenarios/fog/src/search/rank.ts',
  ]);
});

test('ignores a call that names no scenario at all', ({ expect }) => {
  expect(strayReferences(bash('node --version'), own)).toStrictEqual([]);
});
