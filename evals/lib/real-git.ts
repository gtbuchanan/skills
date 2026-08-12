/*
 * Finding the real git while a suite's own double shadows it.
 *
 * The runner installs each suite's stubs into STUB_BINDIR at the FRONT of the
 * eval PATH, which is what makes interception deterministic for the agent. A
 * suite that seeds a genuine repository needs the opposite: the real binary,
 * reached past its own stub. Resolving `git` by name would find the double and
 * seed nothing at all, so the search is explicit about which directory to skip.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * A host to search: its PATH, the names git may be spelled with there, the stub
 * directory to skip, and how to tell a file exists.
 */
export interface GitLookup {
  readonly isFile: (candidate: string) => boolean;
  readonly names: readonly string[];
  readonly pathValue: string;
  readonly stubDir?: string | undefined;
}

/**
 * The first git on PATH that is not the stub, or `undefined` when the only one
 * is the stub — which the caller must treat as fatal rather than seed through.
 */
export const findGitOutsideStub = (lookup: GitLookup): string | undefined => {
  const { isFile, names, pathValue, stubDir } = lookup;
  const skip = stubDir === undefined ? undefined : path.resolve(stubDir);

  return pathValue
    .split(path.delimiter)
    .filter(dir => dir !== '' && path.resolve(dir) !== skip)
    .flatMap(dir => names.map(name => path.join(dir, name)))
    .find(candidate => isFile(candidate));
};

/**
 * Names git answers to, in the order a host would resolve them.
 */
const gitNames = process.platform === 'win32'
  ? ['git.exe', 'git.cmd', 'git']
  : ['git'];

/**
 * A git environment that cannot see the developer's own config.
 *
 * Two things ride on this. What leaks in is not obvious — `core.autocrlf`
 * rewrites blobs, `commit.gpgsign` embeds a fresh signature timestamp (or
 * fails for want of a key), `init.templateDir` installs hooks into a new
 * repository — so a seeded checkout is only reproducible without it.
 *
 * And `credential.helper`, which a system config routinely names, would let an
 * agent's `git push` authenticate as the developer against a live repository.
 * The suites shadow `gh` precisely so a skill cannot reach the real service;
 * git holding credentials of its own would walk around that.
 *
 * Repo-local config is untouched, so a seeded checkout keeps its origin,
 * branch and identity.
 */
export const hermeticGitEnv = (
  extra?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  ...extra,
});

/**
 * The real git for this process, or a thrown error naming why there isn't one.
 */
export const resolveRealGit = (): string => {
  const found = findGitOutsideStub({
    isFile: candidate => fs.existsSync(candidate),
    names: gitNames,
    pathValue: process.env['PATH'] ?? '',
    stubDir: process.env['STUB_BINDIR'],
  });
  if (found === undefined)
    throw new Error(
      'no real git on PATH outside STUB_BINDIR: the suite would seed its ' +
      'repository through its own stub and leave an empty one behind.',
    );

  return found;
};
