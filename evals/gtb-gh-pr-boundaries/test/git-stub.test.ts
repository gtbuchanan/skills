/*
 * Tests for where the recording `git` this suite runs the skill against puts
 * its record.
 *
 * The checker orders commits against pull request creates from one log, so a
 * git call recorded anywhere but the run's own log is one that ordering never
 * sees.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readCommands } from '@gtbuchanan/stub-runtime/calls';
import { runLogPath, runVar } from '@gtbuchanan/stub-runtime/run-log';
import { test } from 'vitest';

const stub = path.join(import.meta.dirname, '..', 'bin', 'git-stub.ts');

test('a call is recorded in the log of the run that made it', ({ expect }) => {
  const logDir = mkdtempSync(path.join(tmpdir(), 'git-stub-runs-'));
  spawnSync(process.execPath, [stub, '--version'], {
    env: { ...process.env, STUB_LOG_DIR: logDir, [runVar]: 'run-1' },
  });

  expect(readCommands(runLogPath(logDir, 'run-1'), 'git')).toStrictEqual(['--version']);
});
