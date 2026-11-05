/*
 * Tests for where the recording `git` this suite runs the skill against puts
 * its record.
 *
 * The checker orders a branch delete against the `gh pr merge` from one log,
 * so a git call recorded anywhere but the run's own log is one that ordering
 * never sees.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readCommands } from '@gtbuchanan/cli-doubles/calls';
import { runLogPath, runVar } from '@gtbuchanan/cli-doubles/run-log';
import { test } from 'vitest';

const stub = path.join(import.meta.dirname, '..', 'bin', 'git-stub.ts');

test('a call is recorded in the log of the run that made it', ({ expect }) => {
  const logDir = mkdtempSync(path.join(tmpdir(), 'git-stub-runs-'));
  spawnSync(process.execPath, [stub, '--version'], {
    env: { ...process.env, STUB_LOG_DIR: logDir, [runVar]: 'run-1' },
  });

  expect(readCommands(runLogPath(logDir, 'run-1'), 'git')).toStrictEqual(['--version']);
});

test('a call the agent runtime makes for itself is answered, not recorded', ({ expect }) => {
  /* Claude Code's startup calls are not the agent's, so a rule about what the
     agent did must not be judged on them. */
  const logDir = mkdtempSync(path.join(tmpdir(), 'git-stub-runs-'));
  const result = spawnSync(
    process.execPath,
    [stub, '-c', 'core.hooksPath=/dev/null', '--version'],
    { encoding: 'utf8', env: { ...process.env, STUB_LOG_DIR: logDir, [runVar]: 'run-1' } },
  );

  expect(result.stdout).toContain('git version');
  expect(readCommands(runLogPath(logDir, 'run-1'), 'git')).toStrictEqual([]);
});
