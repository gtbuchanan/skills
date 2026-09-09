/*
 * Tests for seeding a scenario's workspace as a git repository.
 *
 * What this does exists because some scenario turns on it, and each part is
 * invisible when wrong. A commit left local is what gives a scenario something
 * to push — pushed by mistake and the skill has nothing to do. A teammate's
 * commit is what a squash has to find credit in that no trailer states —
 * attributed to the suite's own author and the scenario proves nothing. And
 * the recorded tip is where commit counting starts — recorded wrongly and the
 * seeded history counts as the agent's work.
 *
 * Every case spawns several git processes, so they are tagged `slow`.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { captureGit } from '@gtbuchanan/git-fixtures/seed-repo';
import { markerFile } from '@gtbuchanan/stub-runtime/scenario';
import * as v from 'valibot';
import { test } from 'vitest';
import { fakeSuite } from './fake-suite.ts';
import {
  type RepoScenario,
  type RepoScenarioSeeding,
  repoScenarioSeeding,
} from '@gtbuchanan/agent-skills-harness/repo-scenario';

const git = resolveRealGit();

const author = { email: 'taylor@example.com', name: 'Taylor Buchanan' };

const baseCommit = {
  date: '2026-05-05T09:00:00-05:00',
  key: 'base',
  subject: 'Add the rate limiter',
  tree: { 'src/limiter.ts': 'export const allow = (): boolean => true;\n' },
};

/**
 * A workspace to seed into. Named for a scenario key that no other test uses,
 * because the origin and the baselines manifest are keyed by it under the
 * shared artifact directory.
 */
const scratch = (): string => mkdtempSync(path.join(tmpdir(), 'repo-scenario-'));

const TipsSchema = v.record(v.string(), v.string());

const seedingFor = (): RepoScenarioSeeding<RepoScenario> =>
  repoScenarioSeeding<RepoScenario>({ author, metaUrl: fakeSuite().metaUrl });

test('the history lands on the named branch, with an origin to push to', {
  tags: ['slow'],
}, ({ expect }) => {
  const workspace = scratch();
  const seeding = seedingFor();

  seeding.seed(
    { branch: 'add-rate-limiter', commits: [baseCommit], key: 'repo-basic' },
    workspace,
  );

  const runner = { cwd: workspace, git };

  expect(captureGit(runner, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe(
    'add-rate-limiter',
  );
  expect(captureGit(runner, ['log', '--format=%s'])).toBe('Add the rate limiter');
  /*
  An origin the branch tracks, so `push` and `fetch` work with no network.
  */
  expect(captureGit(runner, ['rev-parse', '--abbrev-ref', '@{upstream}'])).toBe(
    'origin/add-rate-limiter',
  );
});

test('the recorded tip is the seeded head, not what the extra commit left', {
  tags: ['slow'],
}, ({ expect }) => {
  /*
   * Counting starts here. Record the tip after the extra commit and that
   * commit stops counting as part of the world the agent was handed.
   */
  const workspace = scratch();
  const seeding = seedingFor();
  const key = 'repo-tip';

  seeding.seed(
    {
      branch: 'add-rate-limiter',
      commits: [baseCommit],
      extra: {
        push: true,
        subject: 'Count a rejection against its window',
        trailers: [],
        tree: { 'src/limiter.ts': 'export const allow = (): boolean => false;\n' },
      },
      key,
    },
    workspace,
  );

  const runner = { cwd: workspace, git };
  const recorded = readFileSync(seeding.baselinesPath(), 'utf8');
  const tips = v.parse(TipsSchema, JSON.parse(recorded));
  const head = captureGit(runner, ['rev-parse', 'HEAD']);

  expect(tips[key]).toBe(head);
});

test('a commit marked local stays off the origin', { tags: ['slow'] }, ({ expect }) => {
  /*
   * This is the whole of what gives a push-watching scenario something to
   * push. Pushed here and the skill is asked to push work that is already
   * there.
   */
  const workspace = scratch();
  const seeding = seedingFor();

  seeding.seed(
    {
      branch: 'fix-cache-key',
      commits: [baseCommit],
      extra: {
        push: false,
        subject: 'Key the cache by method as well as url',
        trailers: [],
        tree: { 'src/cache.ts': 'export const key = (): string => "";\n' },
      },
      key: 'repo-local',
    },
    workspace,
  );

  const runner = { cwd: workspace, git };

  expect(captureGit(runner, ['log', '--format=%s', '-1'])).toBe(
    'Key the cache by method as well as url',
  );
  /*
  The origin still stops at the seeded history.
  */
  expect(captureGit(runner, ['log', '--format=%s', '-1', 'origin/fix-cache-key'])).toBe(
    'Add the rate limiter',
  );
});

test('a teammate authors their own commit, and trailers survive onto it', {
  tags: ['slow'],
}, ({ expect }) => {
  /*
   * A squash has to credit two people it learns about differently: one named
   * by a trailer, one only by having authored a commit. Attribute this to the
   * suite's own author and the second half of that scenario disappears.
   */
  const workspace = scratch();
  const seeding = seedingFor();

  seeding.seed(
    {
      branch: 'add-rate-limiter',
      commits: [baseCommit],
      extra: {
        author: { email: 'sam@example.com', name: 'Sam Okafor' },
        push: true,
        subject: 'Count a rejection against its window',
        trailers: ['Co-authored-by: Dana Reyes <dana@example.com>'],
        tree: { 'src/limiter.ts': 'export const allow = (): boolean => false;\n' },
      },
      key: 'repo-teammate',
    },
    workspace,
  );

  const runner = { cwd: workspace, git };

  expect(captureGit(runner, ['log', '--format=%aN <%aE>', '-1'])).toBe(
    'Sam Okafor <sam@example.com>',
  );
  expect(captureGit(runner, ['log', '--format=%(trailers:only,unfold)', '-1'])).toContain(
    'Co-authored-by: Dana Reyes <dana@example.com>',
  );
});

test('the marker is excluded before it exists', { tags: ['slow'] }, ({ expect }) => {
  /*
   * The hook writes the marker after this returns. Excluding it here is what
   * keeps test scaffolding out of the diff the agent is reviewed on.
   */
  const workspace = scratch();
  seedingFor().seed(
    { branch: 'add-rate-limiter', commits: [baseCommit], key: 'repo-exclude' },
    workspace,
  );

  const exclude = readFileSync(
    path.join(workspace, '.git', 'info', 'exclude'),
    'utf8',
  );

  expect(exclude).toContain(markerFile);
});
