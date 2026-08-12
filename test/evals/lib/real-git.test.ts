/*
 * Tests for finding the real git while a stub is shadowing it.
 *
 * The runner puts STUB_BINDIR at the front of PATH, so a suite that seeds a
 * genuine repository has to reach PAST its own double to do it. Getting this
 * wrong is quiet: the seed would "succeed" against a stub that does nothing,
 * and the suite would then run against an empty repository — the same shape of
 * silent lie the fake world was fixed to stop telling. So the cases that matter
 * are the ones where a wrong answer looks like a right one.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, vi } from 'vitest';
import { findGitOutsideStub, hermeticGitEnv, resolveRealGit } from '#evals/lib/real-git.ts';

const stubDir = path.join(path.sep, 'tmp', 'stub-bin');
const realDir = path.join(path.sep, 'usr', 'bin');
const otherDir = path.join(path.sep, 'opt', 'bin');

/**
 * A host whose `git` lives in every one of `dirs`.
 */
const hostWithGitIn = (...dirs: string[]) =>
  (candidate: string): boolean =>
    dirs.some(dir => candidate === path.join(dir, 'git'));

/**
 * What real git resolves `credential.helper` to under a given environment.
 */
const credentialHelper = (env: NodeJS.ProcessEnv): string =>
  spawnSync(resolveRealGit(), ['config', '--get', 'credential.helper'], {
    encoding: 'utf8',
    env,
  }).stdout.trim();

test('reaches past the stub that shadows git on PATH', ({ expect }) => {
  expect(
    findGitOutsideStub({
      isFile: hostWithGitIn(stubDir, realDir),
      names: ['git'],
      pathValue: [stubDir, realDir].join(path.delimiter),
      stubDir,
    }),
  ).toBe(path.join(realDir, 'git'));
});

test('finds nothing when only the stub has a git to offer', ({ expect }) => {
  /*
   * The caller must fail here rather than seed through the double — a stub
   * that accepts `git init` and does nothing leaves an empty repository that
   * every later command answers about honestly and uselessly.
   */
  expect(
    findGitOutsideStub({
      isFile: hostWithGitIn(stubDir),
      names: ['git'],
      pathValue: [stubDir, realDir].join(path.delimiter),
      stubDir,
    }),
  ).toBeUndefined();
});

test('takes the first real directory that has one', ({ expect }) => {
  expect(
    findGitOutsideStub({
      isFile: hostWithGitIn(realDir, otherDir),
      names: ['git'],
      pathValue: [realDir, otherDir].join(path.delimiter),
      stubDir,
    }),
  ).toBe(path.join(realDir, 'git'));
});

test('tries each name a host may spell git with', ({ expect }) => {
  expect(
    findGitOutsideStub({
      isFile: (candidate: string) => candidate === path.join(realDir, 'git.exe'),
      names: ['git', 'git.exe'],
      pathValue: realDir,
      stubDir,
    }),
  ).toBe(path.join(realDir, 'git.exe'));
});

test('skips the empty entries a PATH picks up', ({ expect }) => {
  expect(
    findGitOutsideStub({
      isFile: hostWithGitIn(realDir),
      names: ['git'],
      pathValue: ['', realDir, ''].join(path.delimiter),
      stubDir,
    }),
  ).toBe(path.join(realDir, 'git'));
});

test.for(['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM'])(
  'no credential helper reaches the hermetic environment via %s',
  (variable, { expect }) => {
    /*
     * A developer's config names one (Git Credential Manager, on Windows), and
     * an eval agent shelling out to `git push` against a real URL would
     * otherwise authenticate as them and write to a live repository. The suites
     * shadow `gh` for exactly this reason; git reaching the same service
     * through a credential helper would walk around that.
     *
     * The helper is planted rather than borrowed from the host: reading the
     * developer's own config would make this assert a property of the machine,
     * and pass vacuously on a CI runner that configures none. Both variables
     * are covered because git resolves them by separate paths.
     *
     * Asserted against real git rather than the returned object, since what
     * matters is the config git actually resolves.
     */
    const root = mkdtempSync(path.join(tmpdir(), 'hermetic-git-'));
    const hostile = path.join(root, 'hostile.gitconfig');
    writeFileSync(hostile, '[credential]\n\thelper = manager\n');
    vi.stubEnv(variable, hostile);

    try {
      expect(credentialHelper(process.env)).toBe('manager');
      expect(credentialHelper(hermeticGitEnv())).toBe('');
    } finally {
      vi.unstubAllEnvs();
    }
  },
);

test('the hermetic environment keeps additions the caller makes', ({ expect }) => {
  expect(hermeticGitEnv({ GIT_AUTHOR_NAME: 'author' })['GIT_AUTHOR_NAME']).toBe('author');
});

test('works on a host with no stub in play at all', ({ expect }) => {
  expect(
    findGitOutsideStub({
      isFile: hostWithGitIn(realDir),
      names: ['git'],
      pathValue: realDir,
    }),
  ).toBe(path.join(realDir, 'git'));
});
