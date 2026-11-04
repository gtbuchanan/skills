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
import { useGitHubOrigin } from '@gtbuchanan/git-fixtures/github-origin';
import { resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import {
  type GitRunner,
  captureGit,
  runGit,
  seedHistory,
  writeCommit,
} from '@gtbuchanan/git-fixtures/seed-repo';

const git = resolveRealGit();

const identity = { email: 'taylor@example.com', name: 'Taylor Buchanan' };

const slug = 'acme/widgets';

/**
 * A disposable checkout of `add-rate-limiter`, pushed to a bare repository
 * beside it, with its origin named on GitHub.
 */
const checkout = (): Disposable & { readonly bare: string; readonly runner: GitRunner } => {
  const root = mkdtempSync(path.join(tmpdir(), 'github-origin-'));
  const bare = path.join(root, 'origin.git');
  const runner = { cwd: path.join(root, 'checkout'), git };
  seedHistory({
    author: identity,
    branch: 'add-rate-limiter',
    commits: [
      {
        date: '2026-05-05T09:00:00-05:00',
        key: 'base',
        subject: 'Add the rate limiter',
        tree: { 'src/limiter.ts': 'export const allow = (): boolean => true;\n' },
      },
    ],
    git,
    localIdentity: identity,
    origin: bare,
    workspace: runner.cwd,
  });
  useGitHubOrigin(runner, { bare, slug });

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

test('fetches from the bare repository through the GitHub-named origin', ({ expect }) => {
  using seeded = checkout();
  const tip = captureGit({ cwd: seeded.bare, git }, ['rev-parse', 'add-rate-limiter']);

  expect(captureGit(seeded.runner, ['ls-remote', 'origin', 'add-rate-limiter']))
    .toBe(`${tip}\trefs/heads/add-rate-limiter`);
});

test('pushes to the bare repository through the GitHub-named origin', ({ expect }) => {
  using seeded = checkout();
  writeCommit(seeded.runner, {
    date: '2026-05-06T09:00:00-05:00',
    key: 'reject',
    subject: 'Count a rejection against its window',
    tree: { 'src/limiter.ts': 'export const allow = (): boolean => false;\n' },
  }, identity);
  runGit(seeded.runner, ['push', '-q', 'origin', 'add-rate-limiter']);

  expect(captureGit({ cwd: seeded.bare, git }, ['log', '-1', '--format=%s', 'add-rate-limiter']))
    .toBe('Count a rejection against its window');
});
