/*
 * Tests for the shadow mounts that keep the container off the host's layout.
 *
 * The glob reading is driven against a workspace built in a temp directory, so
 * a case can describe a layout this repo does not have — a negated pattern in
 * particular, which the repo's own globs never exercise. One case does read
 * the real workspace, because the scan has to find this repo's packages and a
 * fixture cannot promise that.
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { repoRoot } from '@gtbuchanan/agent-skills-harness/paths';
import { test } from 'vitest';
import {
  nodeModulesShadows,
  workspaceGlobs,
  workspacePackageDirs,
} from '#src/workspace-mounts.ts';

/**
 * Writes a workspace declaring `patterns`, with a manifest in every directory
 * of `packageDirs`, and answers with its root.
 */
const workspaceWith = (
  patterns: readonly string[],
  packageDirs: readonly string[],
): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'workspace-mounts-'));
  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    `packages:\n${patterns.map(pattern => `  - '${pattern}'\n`).join('')}`,
  );
  for (const dir of packageDirs) {
    mkdirSync(path.join(root, dir), { recursive: true });
    writeFileSync(path.join(root, dir, 'package.json'), '{}\n');
  }
  return root;
};

test('globs for the manifest that makes a directory a package', ({
  expect,
}) => {
  expect(workspaceGlobs("packages:\n  - 'packages/*'\n")).toStrictEqual({
    exclude: [],
    include: ['packages/*/package.json'],
  });
});

test('reads a negated pattern as an exclusion', ({ expect }) => {
  expect(
    workspaceGlobs("packages:\n  - 'packages/*'\n  - '!packages/legacy'\n"),
  ).toStrictEqual({
    exclude: ['packages/legacy/package.json'],
    include: ['packages/*/package.json'],
  });
});

test('negates only on a leading !', ({ expect }) => {
  /*
   * A `!` anywhere else is an ordinary character in a directory name, and
   * stripping it would glob a directory that does not exist — admitting
   * nothing, silently.
   */
  expect(workspaceGlobs("packages:\n  - 'apps/!vendored/*'\n")).toStrictEqual({
    exclude: [],
    include: ['apps/!vendored/*/package.json'],
  });
});

test('rejects a workspace file declaring no packages', ({ expect }) => {
  /*
   * Failing loudly matters more here than it looks: answering "no packages"
   * shadows nothing, which is the state this whole module exists to leave.
   */
  expect(() => workspaceGlobs('hoist: false\n')).toThrow(/"packages"/v);
});

test('finds a package the globs admit', ({ expect }) => {
  const root = workspaceWith(['packages/*'], ['packages/alpha']);

  expect(workspacePackageDirs(root)).toStrictEqual(['packages/alpha']);
});

test('skips a directory carrying no manifest', ({ expect }) => {
  const root = workspaceWith(['packages/*'], ['packages/alpha']);
  mkdirSync(path.join(root, 'packages', 'notes'));

  expect(workspacePackageDirs(root)).toStrictEqual(['packages/alpha']);
});

test('skips a package a negated pattern subtracts', ({ expect }) => {
  const root = workspaceWith(
    ['packages/*', '!packages/legacy'],
    ['packages/alpha', 'packages/legacy'],
  );

  expect(workspacePackageDirs(root)).toStrictEqual(['packages/alpha']);
});

test('skips manifests inside an installed dependency tree', ({ expect }) => {
  /*
   * A recursive pattern reaches into `node_modules`, where every dependency
   * carries a manifest — so the scan would answer with the install itself and
   * the runner would shadow a mount per dependency. pnpm ignores those
   * directories when it resolves the same globs, and a workspace declaring
   * `packages/**` is what makes the difference visible.
   */
  const root = workspaceWith(
    ['packages/**'],
    ['packages/alpha', 'packages/alpha/node_modules/some-dep'],
  );

  expect(workspacePackageDirs(root)).toStrictEqual(['packages/alpha']);
});

test('names packages relative to the root, separated by /', ({ expect }) => {
  const root = workspaceWith(['nested/*/*'], ['nested/one/two']);

  expect(workspacePackageDirs(root)).toStrictEqual(['nested/one/two']);
});

test("finds this repo's own workspace packages", ({ expect }) => {
  const dirs = workspacePackageDirs(repoRoot);
  const withManifest = dirs.filter(dir =>
    existsSync(path.join(repoRoot, dir, 'package.json')),
  );

  expect(dirs).toContain('packages/eval-runner');
  expect(withManifest).toStrictEqual(dirs);
});

test('shadows a package with an anonymous volume', ({ expect }) => {
  expect(nodeModulesShadows('/work', ['packages/harness'])).toStrictEqual([
    '-v',
    '/work/packages/harness/node_modules',
  ]);
});

test('shadows every package it is given', ({ expect }) => {
  expect(nodeModulesShadows('/work', ['evals/a', 'packages/b'])).toStrictEqual([
    '-v',
    '/work/evals/a/node_modules',
    '-v',
    '/work/packages/b/node_modules',
  ]);
});

test('shadows nothing when there are no packages', ({ expect }) => {
  expect(nodeModulesShadows('/work', [])).toStrictEqual([]);
});
