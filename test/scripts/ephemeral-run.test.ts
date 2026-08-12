/*
 * Tests for the temp-dir lifecycle.
 *
 * The sweep runs from a process exit hook, so it cannot be observed from the
 * process that registered it. These drive a real child and then inspect the
 * filesystem it left behind, which is the only way to prove the directories
 * are reclaimed rather than merely tracked.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { beginEphemeralRun } from '#scripts/ephemeral-run.ts';

/* A file URL, since the child resolves by path rather than through the
 * package's `#scripts/*` imports. */
const moduleUrl = new URL('../../scripts/ephemeral-run.ts', import.meta.url).href;

/**
 * Lines the kept-directory case prints: the swept dir, then the kept one.
 */
const printedDirs = 2;

/**
 * Runs `body` in a child that imports the module, returning its stdout.
 * `expectStatus` is asserted so a child that died for the wrong reason cannot
 * masquerade as a swept directory.
 */
const inChild = (body: string, expectStatus = 0): string => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const { beginEphemeralRun } = await import(${JSON.stringify(moduleUrl)});
       ${body}`,
    ],
    { encoding: 'utf8' },
  );

  if (result.status !== expectStatus)
    throw new Error(`child exited ${String(result.status)}: ${result.stderr}`);

  return result.stdout.trim();
};

test('mints a directory that exists while the run is live', ({ expect }) => {
  const dir = beginEphemeralRun().mintDir('ephemeral-test-');

  expect(existsSync(dir)).toBe(true);
  expect(path.basename(dir).startsWith('ephemeral-test-')).toBe(true);
});

test('mints distinct directories for the same prefix', ({ expect }) => {
  const { mintDir } = beginEphemeralRun();

  expect(mintDir('ephemeral-test-')).not.toBe(mintDir('ephemeral-test-'));
});

test('sweeps a minted directory when the process exits', ({ expect }) => {
  const dir = inChild(`
    const { mintDir } = beginEphemeralRun();
    console.log(mintDir('ephemeral-swept-'));
  `);

  expect(dir).not.toBe('');
  expect(existsSync(dir)).toBe(false);
});

test('sweeps even when the process exits by throwing', ({ expect }) => {
  /*
   * The hook is registered on exit rather than after the caller's work, so an
   * early bail-out or an uncaught error is covered too.
   */
  const dir = inChild(
    `const { mintDir } = beginEphemeralRun();
     console.log(mintDir('ephemeral-threw-'));
     process.on('uncaughtException', () => { process.exit(1); });
     setImmediate(() => { throw new Error('boom'); });`,
    1,
  );

  expect(existsSync(dir)).toBe(false);
});

test('holds a kept directory back from the sweep', ({ expect }) => {
  /*
   * A failed suite's workspace is the evidence for why it failed, so it
   * deliberately survives the run that produced it.
   */
  const [swept, kept] = inChild(`
    const { keep, mintDir } = beginEphemeralRun();
    const a = mintDir('ephemeral-swept-');
    const b = mintDir('ephemeral-kept-');
    keep(b);
    console.log(a); console.log(b);
  `).split('\n', printedDirs);

  expect(existsSync(String(swept))).toBe(false);
  expect(existsSync(String(kept))).toBe(true);
});
