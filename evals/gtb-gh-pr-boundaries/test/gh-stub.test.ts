/*
 * Tests for the fake gh this suite runs the skill against.
 *
 * This suite asks how many pull requests the work became, so the double's one
 * job that matters is telling them apart. A double that answered every
 * `pr create` with the same pull request would make an agent that opened two
 * indistinguishable from one that opened the same one twice.
 *
 * Driven as a subprocess: the double's contract is its stdout and the state
 * it persists beside the scenario's marker.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readCommands } from '@gtbuchanan/stub-runtime/calls';
import { runLogPath, runVar } from '@gtbuchanan/stub-runtime/run-log';
import { markerFile } from '@gtbuchanan/stub-runtime/scenario';
import { test } from 'vitest';

const stub = path.join(import.meta.dirname, '..', 'bin', 'gh-stub.ts');

/**
 * A throwaway checkout seeded as one scenario, its own directory per case so
 * the state one case persists never answers another.
 */
const worldFor = (key: string): string => {
  const dir = mkdtempSync(path.join(tmpdir(), `gh-stub-${key}-`));
  writeFileSync(path.join(dir, markerFile), key);
  return dir;
};

/**
 * Opens a pull request from `head`, the way the skill does, and returns what
 * gh printed.
 */
const create = (dir: string, head: string): string =>
  spawnSync(
    process.execPath,
    [stub, 'pr', 'create', '--draft', '--head', head, '--title', head, '--body', ''],
    { cwd: dir, encoding: 'utf8' },
  ).stdout.trim();

test('a call is recorded in the log of the run that made it', ({ expect }) => {
  /* The checker orders creates against commits from that log alone, so a
     create recorded anywhere else is one it never sees. */
  const logDir = mkdtempSync(path.join(tmpdir(), 'gh-stub-runs-'));
  spawnSync(process.execPath, [stub, 'pr', 'create', '--draft', '--head', 'fix-parser'], {
    cwd: worldFor('two-units'),
    env: { ...process.env, STUB_LOG_DIR: logDir, [runVar]: 'run-1' },
  });

  expect(readCommands(runLogPath(logDir, 'run-1'), 'gh'))
    .toStrictEqual(['pr create --draft --head fix-parser']);
});

test('each pull request opened gets a number of its own', ({ expect }) => {
  const dir = worldFor('two-units');

  const first = create(dir, 'fix-parser');
  const second = create(dir, 'fix-retry');

  expect(first).toMatch(/\/pull\/\d+$/v);
  expect(second).toMatch(/\/pull\/\d+$/v);
  expect(second).not.toBe(first);
});
