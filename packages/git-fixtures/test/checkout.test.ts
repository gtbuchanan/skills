/*
 * Tests for asking a checkout what branch it is on.
 *
 * A double uses this to decide which pull request a bare command means, so the
 * answers for the cases that are not a checkout matter as much as the answer
 * for one: throwing would fail a call the caller has a fallback for, and
 * inventing a branch name would put it into a pull request URL.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { branchAt } from '@gtbuchanan/git-fixtures/checkout';
import { resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { runGit, seedHistory } from '@gtbuchanan/git-fixtures/seed-repo';

const git = resolveRealGit();

const identity = { email: 'taylor@example.com', name: 'Taylor Buchanan' };

const scratch = (): string => mkdtempSync(path.join(tmpdir(), 'branch-at-'));

test('a seeded checkout reports the branch its history is on', { tags: ['slow'] }, ({
  expect,
}) => {
  const workspace = scratch();
  seedHistory({
    author: identity,
    branch: 'fix-retry-backoff',
    commits: [
      {
        date: '2026-05-01T09:00:00-05:00',
        key: 'base',
        subject: 'Add the scheduler retry helper',
        tree: { 'src/scheduler.ts': 'export const backoff = (): number => 1000;\n' },
      },
    ],
    git,
    localIdentity: identity,
    workspace,
  });

  expect(branchAt(workspace)).toBe('fix-retry-backoff');
});

test('a branch with no commits yet answers empty', ({ expect }) => {
  /*
   * `git init -b <name>` points HEAD at a branch that does not exist until
   * something is committed, and `rev-parse` refuses an unborn one. Every
   * checkout a double meets has history, so this is a limit worth stating
   * rather than a case worth handling — and stating it is what stops the
   * empty string being read as "not a repository".
   */
  const workspace = scratch();
  runGit({ cwd: workspace, git }, ['init', '-q', '-b', 'fix-retry-backoff']);

  expect(branchAt(workspace)).toBe('');
});

test('a directory that is not a repository answers empty rather than throwing', ({ expect }) => {
  /*
   * `git --version` from outside every checkout is a legitimate call, and a
   * double asking this on its own behalf has a fallback ready. Failing here
   * would turn a question the double asked itself into the caller's error.
   */
  expect(branchAt(scratch())).toBe('');
});
