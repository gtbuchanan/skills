/*
 * Tests for how the runner finds the repository it runs evals for.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { findRepoRoot } from '#src/repo-root.ts';

test('finds the workspace root above a directory nested in it', ({ expect }) => {
  const root = mkdtempSync(path.join(tmpdir(), 'repo-root-'));
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  const nested = path.join(root, 'packages', 'runner', 'src');
  mkdirSync(nested, { recursive: true });

  expect(findRepoRoot(nested)).toBe(root);
});

test('refuses a directory with no workspace root above it', ({ expect }) => {
  /* The temp dir is the nearest thing to a directory with nothing above it;
     a stray marker there would make this pass by accident, so it is checked. */
  const stray = mkdtempSync(path.join(tmpdir(), 'no-repo-root-'));

  expect(() => findRepoRoot(stray)).toThrow(/no pnpm-workspace\.yaml at or above/v);
});
