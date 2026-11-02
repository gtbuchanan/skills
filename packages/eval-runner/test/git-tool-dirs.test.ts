/*
 * Tests for which dirs under a Git for Windows install root are admitted.
 *
 * Git itself lives in the MSYS2 environment's `bin`, whose name has changed
 * across releases: `mingw64` on older x64 installs, `ucrt64` from 2.56, and
 * `clangarm64` on ARM64. Missing it fails the runner's self-test with "git
 * must be present", because the `Git\bin` launcher it would otherwise fall
 * back to translates to `/bin` inside Git Bash, which MSYS mounts onto
 * `usr\bin`. The layouts are described rather than read from the host, so
 * every case runs on any platform.
 */
import path from 'node:path';
import { test } from 'vitest';
import { gitToolDirsAt } from '#src/scrubbed-path.ts';

const root = path.join(path.sep, 'Git');
const usrBin = path.join(root, 'usr', 'bin');

/**
 * An `isDir` answering for exactly the dirs a layout holds.
 */
const layout = (...dirs: string[]) => (candidate: string): boolean =>
  dirs.includes(candidate);

test.for(['mingw64', 'ucrt64', 'clangarm64'])(
  'admits git from the %s environment',
  (environment, { expect }) => {
    const gitBin = path.join(root, environment, 'bin');

    expect(gitToolDirsAt(root, layout(usrBin, gitBin))).toStrictEqual([usrBin, gitBin]);
  },
);

test('admits the shell alone where no environment dir exists', ({ expect }) => {
  expect(gitToolDirsAt(root, layout(usrBin))).toStrictEqual([usrBin]);
});

test('does not take a dir without usr/bin for an install root', ({ expect }) => {
  const gitBin = path.join(root, 'ucrt64', 'bin');

  expect(gitToolDirsAt(root, layout(gitBin))).toBeUndefined();
});
