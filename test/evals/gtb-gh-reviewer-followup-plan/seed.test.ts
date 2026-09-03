/*
 * Tests for seeding this suite's checkout.
 *
 * These drive the real git, because every claim worth making here is a claim
 * about what git actually does with the seed: that the object names come out
 * the same every run (so the canned reviews can name commits and mean it),
 * that the diff since the baseline is the change the fixture promises, and
 * that `fetch` and a clean `status` work without a network.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, vi } from 'vitest';
import { author, user, viewer } from '#evals/gtb-gh-reviewer-followup-plan/scenario.ts';
import { commitPlan, seedRepository } from '#evals/gtb-gh-reviewer-followup-plan/seed.ts';
import { resolveRealGit } from '@gtbuchanan/agent-skills-harness/real-git';

const git = resolveRealGit();

/**
 * A seeded checkout in a throwaway directory, with its own bare origin.
 */
const seedInTemp = (): { shas: Record<string, string>; workspace: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'seed-test-'));
  const workspace = path.join(root, 'ws');
  const shas = seedRepository({
    git,
    origin: path.join(root, 'origin.git'),
    workspace,
  });

  return { shas, workspace };
};

const inRepo = (workspace: string, ...args: string[]): string =>
  spawnSync(git, args, { cwd: workspace, encoding: 'utf8' }).stdout.trim();

/**
 * Headroom for any case that waits on a seed: a seed spawns a dozen git
 * processes, which outruns the default timeout on a slower host.
 *
 * Carried by the cases that share the file-scoped checkout as well as the ones
 * that seed their own, because whichever of them runs first is the one that
 * pays for the shared seed — and which that is depends on ordering and on
 * which bucket is running. Budgeting only today's first case would leave the
 * next reordering to rediscover this.
 */
const seedTimeout = { timeout: 60_000 };

/**
 * One seeded checkout for every case that only reads it — seeding spawns a
 * dozen git processes, so the read-only cases share a file-scoped one rather
 * than paying for it each.
 */
const testSeeded = test.extend<{ seeded: { shas: Record<string, string>; workspace: string } }>({
  seeded: [
    async ({}, use) => {
      await use(seedInTemp());
    },
    { scope: 'file' },
  ],
});

testSeeded(
  'the same plan seeds the same object names twice over',
  { tags: ['slow'] },
  ({ expect, seeded }) => {
    /*
     * Reproducible on a given host, which is what debugging a run needs: the
     * SHA in a call log means the same commit an hour later.
     *
     * NOT a cross-platform guarantee: the same plan seeds different object
     * names under the container runner than on a Windows host. Nothing depends
     * on it being stable across hosts — setup seeds and resolves the fixtures
     * against each other in one process, so a run is self-consistent whatever
     * the names come out as.
     */
    expect(seedInTemp().shas).toStrictEqual(seeded.shas);
  },
);

test('a hostile global config cannot reach the seed', seedTimeout, ({ expect }) => {
  /*
   * The developer's own ~/.gitconfig is the thing most likely to vary between
   * two hosts, and it can change what git commits: `autocrlf` rewrites the
   * blobs, `gpgsign` embeds a fresh signature timestamp (or fails outright for
   * want of a key), `templateDir` installs hooks into the new repository.
   *
   * Config that would visibly change the result, ignored.
   */
  const root = mkdtempSync(path.join(tmpdir(), 'seed-hostile-'));
  const hostile = path.join(root, 'hostile.gitconfig');
  /* Forward slashes: a backslash is an escape in git's config format, so a
   * Windows path would fail to parse and the case would pass for the wrong
   * reason — a config git rejected is not a config git ignored. */
  writeFileSync(
    hostile,
    '[core]\n\tautocrlf = true\n' +
    '[commit]\n\tgpgsign = true\n' +
    `[init]\n\ttemplateDir = ${root.replaceAll('\\', '/')}/template\n`,
  );
  vi.stubEnv('GIT_CONFIG_GLOBAL', hostile);
  vi.stubEnv('GIT_CONFIG_SYSTEM', hostile);

  try {
    expect(
      seedRepository({
        git,
        origin: path.join(root, 'origin.git'),
        workspace: path.join(root, 'ws'),
      }),
    ).toStrictEqual(seedInTemp().shas);
  } finally {
    vi.unstubAllEnvs();
  }
});

testSeeded('the checkout answers the identity probe gh agrees with', seedTimeout, (
  { expect, seeded },
) => {
  /*
   * An agent asks git who it is before doing anything. The commits carry their
   * own author in the environment, so this repo-local identity is not what
   * makes them work — it is the only place left to answer that probe once
   * global config is disabled, and it has to name the viewer `gh api user`
   * does rather than leaving git with no identity at all.
   */
  expect(inRepo(seeded.workspace, 'config', 'user.name')).toBe(viewer);
  expect(inRepo(seeded.workspace, 'config', '--get', 'user.email')).toBe(user.email);
});

testSeeded('the commits are the author\'s, not the reviewer\'s', seedTimeout, (
  { expect, seeded },
) => {
  expect(inRepo(seeded.workspace, 'log', '-1', '--format=%an')).toBe(author);
});

testSeeded('every planned commit lands in the history', seedTimeout, ({ expect, seeded }) => {
  const names = inRepo(seeded.workspace, 'rev-list', '--reverse', 'HEAD').split('\n');

  expect(names).toStrictEqual(commitPlan.map(commit => seeded.shas[commit.key]));
});

testSeeded('the diff since the baseline is the fix under review', seedTimeout, (
  { expect, seeded },
) => {
  const changed = inRepo(
    seeded.workspace,
    'diff',
    '--name-only',
    `${seeded.shas['baseline'] ?? ''}..HEAD`,
  ).split('\n');

  expect(changed.toSorted((left, right) => left.localeCompare(right))).toStrictEqual([
    'api/user.py',
    'src/auth.ts',
  ]);
});

testSeeded('the unaddressed thread\'s file is untouched by it', seedTimeout, (
  { expect, seeded },
) => {
  /*
   * api/order.py is the thread the author resolved without fixing. If the diff
   * ever touched it the fixture would stop being unambiguous.
   */
  const patch = inRepo(
    seeded.workspace,
    'diff',
    `${seeded.shas['baseline'] ?? ''}..HEAD`,
  );

  expect(patch).not.toContain('api/order.py');
  expect(inRepo(seeded.workspace, 'cat-file', '-e', 'HEAD:api/order.py')).toBe('');
});

testSeeded('the fix is real code, not a moved line', seedTimeout, ({ expect, seeded }) => {
  const patch = inRepo(
    seeded.workspace,
    'diff',
    `${seeded.shas['baseline'] ?? ''}..HEAD`,
  );

  expect(patch).toContain('timingSafeEqual(actual, wanted)');
  expect(patch).toContain('+    if user is not None:');
});

testSeeded('the exact-fix thread\'s fix survives reading the file', seedTimeout, (
  { expect, seeded },
) => {
  /*
   * The agent judges the working tree, not just the hunk. A fix that used
   * timingSafeEqual without importing it, or that let it throw on a length
   * mismatch, is a real defect — and the thread stops being an unambiguous
   * exact-fix, which is the whole job of this fixture.
   */
  const source = readFileSync(path.join(seeded.workspace, 'src', 'auth.ts'), 'utf8');

  expect(source).toContain("import { createHash, timingSafeEqual } from 'node:crypto';");
  expect(source).toContain('actual.length === wanted.length && timingSafeEqual(');
});

testSeeded('the batch path keeps the defect that makes it partial', seedTimeout, (
  { expect, seeded },
) => {
  const patch = inRepo(
    seeded.workspace,
    'diff',
    `${seeded.shas['baseline'] ?? ''}..HEAD`,
  );

  /*
   * In the DIFF, not merely in the file: whether the partial verdict is
   * reachable must not depend on a run happening to read past the hunk.
   */
  expect(patch).toContain('+    notify_batch([u.email for u in users])');
  expect(patch).not.toMatch(/\+.*is not None.*\n.*notify_batch/v);
});

test('the checkout is clean, despite what shares the workspace', seedTimeout, ({ expect }) => {
  /*
   * Its own checkout: the one case that writes into the tree. The runners put
   * different things beside the PR — the native one installs skills and
   * stages fixtures, the container one seeds in /work where the whole repo is
   * mounted — so both shapes are represented here.
   */
  const { workspace } = seedInTemp();
  mkdirSync(path.join(workspace, '.claude', 'skills'), { recursive: true });
  writeFileSync(path.join(workspace, '.claude', 'skills', 'SKILL.md'), 'installed\n');
  mkdirSync(path.join(workspace, 'node_modules', 'left-pad'), { recursive: true });
  writeFileSync(path.join(workspace, 'node_modules', 'left-pad', 'index.js'), 'x\n');
  for (const file of ['package.json', 'pnpm-lock.yaml', '.pnpmfile.cjs'])
    writeFileSync(path.join(workspace, file), '{}\n');

  expect(inRepo(workspace, 'status', '--porcelain')).toBe('');
});

test('a new file in a path the PR owns is still seen', seedTimeout, ({ expect }) => {
  /*
   * The exclusion inverts — everything but the PR's own roots — so the case
   * worth pinning is that it did not also blind the checkout to real work.
   */
  const { workspace } = seedInTemp();
  writeFileSync(path.join(workspace, 'src', 'untracked.ts'), 'export const x = 1;\n');

  expect(inRepo(workspace, 'status', '--porcelain')).toContain('src/untracked.ts');
});

testSeeded('fetch reaches the origin without a network', seedTimeout, ({ expect, seeded }) => {
  const result = spawnSync(git, ['fetch', '--quiet'], {
    cwd: seeded.workspace,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(inRepo(seeded.workspace, 'status', '--short', '--branch')).toContain(
    '...origin/',
  );
});
