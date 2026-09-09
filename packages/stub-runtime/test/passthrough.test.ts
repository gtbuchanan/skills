/*
 * Tests for handing a call to the real binary a double is shadowing.
 *
 * A passthrough double is trusted precisely because it invents nothing, so the
 * two ways it can quietly stop being one are what the cases below pin: an exit
 * status that does not survive the handover, and an environment that does not
 * reach the child. Both fail silently — the code under test reads a success it
 * never earned, or reaches config the caller went out of its way to shut out —
 * and neither is visible in the output the stub passes along.
 *
 * The cases that spawn a real process are tagged `slow` and sit out the fast
 * bucket; what stays behind is the status mapping, which needs no child.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { exitCodeFrom, passThrough } from '@gtbuchanan/stub-runtime/passthrough';

/**
 * A node script, as the `-e` argument that runs it.
 */
const script = (source: string): string[] => ['-e', source];

test('the status the child returned is the status to leave with', ({ expect }) => {
  expect(exitCodeFrom(0)).toBe(0);
  expect(exitCodeFrom(3)).toBe(3);
});

test('a child that returned no status at all is a failure', ({ expect }) => {
  /* A child killed by a signal reports a null status. Reading that as 0 would
     tell the code under test its `git push` succeeded. */

  /* eslint-disable-next-line unicorn/no-null --
     null is the value node reports here, so the case cannot be stated without
     one */
  expect(exitCodeFrom(null)).toBe(1);
});

test('the exit status of the real binary is passed back', { tags: ['slow'] }, ({
  expect,
}) => {
  const code = passThrough({
    argv: script('process.exit(3)'),
    binary: process.execPath,
  });

  expect(code).toBe(3);
});

test('the environment given is the environment the child runs under', {
  tags: ['slow'],
}, ({ expect }) => {
  /* Written to a file rather than read off stdout: the child inherits the
     caller's streams, which is what lets a passthrough's output reach whoever
     ran it, and leaves nothing here to capture. */
  const dir = mkdtempSync(path.join(tmpdir(), 'passthrough-'));
  const out = path.join(dir, 'probe');

  const code = passThrough({
    argv: script(
      "require('node:fs').writeFileSync(process.env.PROBE_OUT, process.env.PROBE)",
    ),
    binary: process.execPath,
    env: { ...process.env, PROBE: 'from the caller', PROBE_OUT: out },
  });

  expect(code).toBe(0);
  expect(readFileSync(out, 'utf8')).toBe('from the caller');
});
