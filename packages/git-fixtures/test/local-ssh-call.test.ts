/*
 * Tests for reading what git asked local-ssh for.
 *
 * Anything that is no git service is refused, so the transport serves the bare
 * repository and nothing else an ssh could be asked to run.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { localSshCall } from '@gtbuchanan/git-fixtures/github-origin';

test('names the git service and bare repository git asked for', ({ expect }) => {
  const args = [
    '/usr/bin/git',
    '/srv/origin.git',
    'git@github.localhost',
    "git-upload-pack 'acme/widgets.git'",
  ];

  expect(localSshCall(args)).toStrictEqual({
    bare: '/srv/origin.git',
    git: '/usr/bin/git',
    service: 'upload-pack',
  });
});

test('refuses a command that is no git service', ({ expect }) => {
  // What git sends when it probes which ssh it was given.
  expect(localSshCall(['/usr/bin/git', '/srv/origin.git', '-G', 'github.localhost']))
    .toBeUndefined();
});
