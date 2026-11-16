/*
 * Tests for where the gh spy sends a call.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { markerFile } from '@gtbuchanan/cli-doubles/scenario';
import { test } from 'vitest';
import { type Handoff, fakePortVar, handoff, realGhVar } from '@gtbuchanan/github-cli-spy/handoff';

const realGh = path.join(path.sep, 'opt', 'gh', 'gh');

/**
 * A disposable workspace seeded as `world`, or not seeded at all, with a
 * directory nested inside it to call from.
 */
const workspace = (world?: string): Disposable & { readonly nested: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'handoff-test-'));
  if (world !== undefined) writeFileSync(path.join(root, markerFile), `${world}\n`);
  const nested = path.join(root, 'src');
  mkdirSync(nested);

  return {
    nested,
    [Symbol.dispose]: () => {
      rmSync(root, { force: true, recursive: true });
    },
  };
};

const hostEnv = { [fakePortVar]: '4000', [realGhVar]: realGh };

/**
 * Why `handoff` refused, or `undefined` when it handed the call on.
 */
const refusalOf = (handed: Handoff): string | undefined =>
  handed.kind === 'refused' ? handed.reason : undefined;

test('a call goes to the real gh and the fake, for its workspace\'s world', ({ expect }) => {
  using dir = workspace('merge-clean');

  expect(handoff(dir.nested, hostEnv)).toStrictEqual({
    kind: 'handed',
    port: 4000,
    realGh,
    world: 'merge-clean',
  });
});

test('a call outside every workspace is refused', ({ expect }) => {
  using dir = workspace();

  expect(refusalOf(handoff(dir.nested, hostEnv))).toContain(markerFile);
});

test('a call with no real gh to hand it to is refused', ({ expect }) => {
  using dir = workspace('merge-clean');

  expect(refusalOf(handoff(dir.nested, { [fakePortVar]: '4000' }))).toContain(realGhVar);
});

test('a call with no fake to point gh at is refused', ({ expect }) => {
  using dir = workspace('merge-clean');

  expect(refusalOf(handoff(dir.nested, { [realGhVar]: realGh }))).toContain(fakePortVar);
});

test('a call naming no usable port is refused', ({ expect }) => {
  using dir = workspace('merge-clean');

  const env = { [fakePortVar]: '0', [realGhVar]: realGh };

  expect(refusalOf(handoff(dir.nested, env))).toContain(fakePortVar);
});
