/*
 * Tests for running git with no sight of the host's own config.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, vi } from 'vitest';
import { hermeticGitEnv } from '@gtbuchanan/git-fixtures/hermetic-git';

/**
 * What git resolves `credential.helper` to under a given environment.
 */
const credentialHelper = (env: NodeJS.ProcessEnv): string =>
  spawnSync('git', ['config', '--get', 'credential.helper'], {
    encoding: 'utf8',
    env,
  }).stdout.trim();

test.for(['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM'])(
  'no credential helper reaches the hermetic environment via %s',
  (variable, { expect }) => {
    /*
     * A developer's config names one (Git Credential Manager, on Windows), and
     * code under test shelling out to `git push` against a real URL would
     * otherwise authenticate as them and write to a live repository. A harness
     * shadows the network-reaching tools for exactly this reason; git reaching
     * the same service through a credential helper would walk around that.
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
