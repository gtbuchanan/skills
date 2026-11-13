/*
 * Tests for a checkout whose origin is named on GitHub while git reaches a
 * local bare repository.
 *
 * The URL is what gh reads to decide which repository it is in, and the bare
 * repository is what keeps every fetch and push off the network. A checkout
 * that gets the first wrong is invisible to gh; one that gets the second wrong
 * either fails or dials a host that does not exist.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 *
 * @module-tag slow
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { gitHubOrigin } from '@gtbuchanan/git-fixtures/github-origin';
import {
  type GitRunner,
  captureGit,
  runGit,
  seedHistory,
  writeCommit,
} from '@gtbuchanan/git-fixtures/seed-repo';

// Nothing shadows git while these run, so it is reached by name.
const git = 'git';

const identity = { email: 'taylor@example.com', name: 'Taylor Buchanan' };

const baseCommit = {
  date: '2026-05-05T09:00:00-05:00',
  key: 'base',
  subject: 'Add the rate limiter',
  tree: { 'src/limiter.ts': 'export const allow = (): boolean => true;\n' },
};

const rejectCommit = {
  date: '2026-05-06T09:00:00-05:00',
  key: 'reject',
  subject: 'Count a rejection against its window',
  tree: { 'src/limiter.ts': 'export const allow = (): boolean => false;\n' },
};

/**
 * A disposable checkout of `branch` holding both commits, pushed to a bare
 * repository beside it, with its origin named on GitHub over a base of `main`.
 */
const checkout = (
  branch = 'add-rate-limiter',
): Disposable & { readonly bare: string; readonly runner: GitRunner } => {
  const root = mkdtempSync(path.join(tmpdir(), 'github-origin-'));
  const bare = path.join(root, 'origin.git');
  const runner = { cwd: path.join(root, 'checkout'), git };
  seedHistory({
    author: identity,
    branch,
    commits: [baseCommit, rejectCommit],
    git,
    localIdentity: identity,
    origin: bare,
    workspace: runner.cwd,
  });
  gitHubOrigin({ base: 'main', slug: 'acme/widgets' })({ branch, origin: bare, runner });

  return {
    bare,
    runner,
    [Symbol.dispose]: () => {
      rmSync(root, { force: true, recursive: true });
    },
  };
};

test('names the origin on github.localhost', ({ expect }) => {
  using seeded = checkout();

  expect(captureGit(seeded.runner, ['remote', 'get-url', 'origin']))
    .toBe('git@github.localhost:acme/widgets.git');
});

test('puts the base branch on the origin at the first commit', ({ expect }) => {
  /*
   * gh checks the base branch out after a merge that deletes the head, and
   * fails where the origin has none.
   */
  using seeded = checkout();

  expect(captureGit({ cwd: seeded.bare, git }, ['log', '-1', '--format=%s', 'main']))
    .toBe(baseCommit.subject);
});

test('leaves the base branch at its tip when the checkout is on it', ({ expect }) => {
  /*
   * A scenario whose work sits on the base branch has already pushed it, and
   * moving it back to the first commit is a push git refuses.
   */
  using seeded = checkout('main');

  expect(captureGit({ cwd: seeded.bare, git }, ['log', '-1', '--format=%s', 'main']))
    .toBe(rejectCommit.subject);
});

test('fetches from the bare repository through the GitHub-named origin', ({ expect }) => {
  using seeded = checkout();
  const tip = captureGit({ cwd: seeded.bare, git }, ['rev-parse', 'add-rate-limiter']);

  expect(captureGit(seeded.runner, ['ls-remote', 'origin', 'add-rate-limiter']))
    .toBe(`${tip}\trefs/heads/add-rate-limiter`);
});

test('pushes to the bare repository through the GitHub-named origin', ({ expect }) => {
  using seeded = checkout();
  writeCommit(seeded.runner, {
    date: '2026-05-07T09:00:00-05:00',
    key: 'window',
    subject: 'Reset the window on the hour',
    tree: { 'src/limiter.ts': 'export const allow = (): boolean => true;\n' },
  }, identity);
  runGit(seeded.runner, ['push', '-q', 'origin', 'add-rate-limiter']);

  expect(captureGit({ cwd: seeded.bare, git }, ['log', '-1', '--format=%s', 'add-rate-limiter']))
    .toBe('Reset the window on the hour');
});
