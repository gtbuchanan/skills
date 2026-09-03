/*
 * Tests for what the double remembers between calls.
 *
 * Each `gh` invocation is its own process, so a pull request opened, promoted,
 * retargeted or merged has to outlive the call that did it. Without that the
 * double answers impossibly — a pull request it just reported creating cannot
 * be viewed, one it marked ready is still a draft — and the contradiction is
 * what an agent acts on.
 *
 * The reading cases are about tolerance rather than correctness: a half-written
 * or hand-edited file should cost the call nothing, because the alternative is
 * a suite that fails for a reason having nothing to do with the skill.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { emptyState, readState, writeState } from '@gtbuchanan/github-cli-stub/state';

/**
 * A path in a throwaway directory, holding `contents` when given any.
 */
const statePath = (contents?: string): string => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'gh-state-'));
  const file = path.join(scratch, 'state.json');
  if (contents !== undefined) writeFileSync(file, contents);
  return file;
};

test('a world nothing has happened in reads as empty', ({ expect }) => {
  expect(readState(statePath())).toStrictEqual(emptyState);
});

test('what one call wrote, the next call reads', ({ expect }) => {
  const file = statePath();
  writeState(file, {
    merged: [7],
    opened: {
      101: {
        baseRefName: 'main',
        body: 'Because the cache collided.',
        headRefName: 'fix-cache-key',
        title: 'Key the cache by method',
      },
    },
    ready: [101],
    retargeted: { 8: 'release' },
  });

  expect(readState(file)).toStrictEqual({
    merged: [7],
    opened: {
      101: {
        baseRefName: 'main',
        body: 'Because the cache collided.',
        headRefName: 'fix-cache-key',
        title: 'Key the cache by method',
      },
    },
    ready: [101],
    retargeted: { 8: 'release' },
  });
});

test('a state file naming only some of the world fills in the rest', ({ expect }) => {
  expect(readState(statePath('{"merged":[3]}'))).toStrictEqual({
    ...emptyState,
    merged: [3],
  });
});

test('a half-written file costs the call nothing', ({ expect }) => {
  expect(readState(statePath('{"merged":[3'))).toStrictEqual(emptyState);
});

test('a file whose shape is wrong is refused rather than trusted', ({ expect }) => {
  /* `merged` holding strings is not a world this double produced. Reading it
     anyway would put the wrong type into an answer the agent acts on. */
  expect(readState(statePath('{"merged":["seven"]}'))).toStrictEqual(emptyState);
});
