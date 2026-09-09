/*
 * Tests for the shared repository seeding helpers.
 *
 * These drive the real git, because the claims worth making are claims about
 * what git and the filesystem actually do with a plan — not about how the
 * helper is written.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import type { SeedCommit } from '@gtbuchanan/git-fixtures/seed-repo';
import { captureGit, runGit, writeCommit } from '@gtbuchanan/git-fixtures/seed-repo';

const git = resolveRealGit();

const author = { email: 'author@example.com', name: 'author' };

const commitOf = (tree: Record<string, string>): SeedCommit => ({
  date: '2026-04-02T09:12:00+00:00',
  key: 'only',
  subject: 'Seed the tree',
  tree,
});

/**
 * A throwaway repository, plus a sibling directory outside it that nothing in
 * a plan has any business reaching.
 */
const scratch = (): { outside: string; workspace: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'seed-repo-test-'));
  const workspace = path.join(root, 'ws');
  const outside = path.join(root, 'outside');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(outside, { recursive: true });

  return { outside, workspace };
};

test('a tree key that escapes the workspace is refused', ({ expect }) => {
  /*
   * The keys come from the caller's own plan rather than anything untrusted,
   * so this is not a sandbox — it is a guard against an authoring slip. Without
   * it the write lands outside the workspace and only the following `git add`
   * objects, by which point the damage is done: a run would silently clobber a
   * file beside the tree it was told to seed.
   */
  const { outside, workspace } = scratch();
  const runner = { cwd: workspace, git };
  runGit(runner, ['init', '-q', '-b', 'main']);
  const victim = path.join(outside, 'victim.txt');
  writeFileSync(victim, 'ORIGINAL\n');

  expect(() => {
    writeCommit(runner, commitOf({ '../outside/victim.txt': 'CLOBBERED\n' }), author);
  }).toThrow(/outside the workspace/v);
  /*
   * The load-bearing assertion. Git does object to an outside path, but only
   * at `git add` — after the file has already been overwritten. Refusing has
   * to happen before anything is written, so this is what distinguishes a
   * guard from git's own late complaint.
   */
  expect(readFileSync(victim, 'utf8')).toBe('ORIGINAL\n');
});

/* Writing one commit spends a run of git processes, and on a loaded machine
   that carries the test past the default per-test budget. It sat in the fast
   bucket and passed there on luck rather than on costing little; the split is
   by cost, so it belongs here. */
test('a nested key inside the workspace still seeds', { tags: ['slow'] }, ({ expect }) => {
  const { workspace } = scratch();
  const runner = { cwd: workspace, git };
  runGit(runner, ['init', '-q', '-b', 'main']);
  runGit(runner, ['config', 'user.name', 'dev']);
  runGit(runner, ['config', 'user.email', 'dev@example.com']);

  writeCommit(runner, commitOf({ 'src/deep/nested.ts': 'export const x = 1;\n' }), author);

  expect(existsSync(path.join(workspace, 'src', 'deep', 'nested.ts'))).toBe(true);
  // Committed, not merely written — that is what writeCommit is for.
  expect(captureGit(runner, ['ls-tree', '-r', '--name-only', 'HEAD'])).toBe(
    'src/deep/nested.ts',
  );
  expect(captureGit(runner, ['log', '-1', '--format=%an'])).toBe(author.name);
});
