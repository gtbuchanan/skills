/*
 * Tests for where this suite's doubles record their calls.
 *
 * plan-check.ts judges a run on that record alone: whether it stayed read-only,
 * which endpoints it asked, which range it diffed. A call recorded anywhere but
 * the run's own log is one the checker never sees.
 *
 * Driven as subprocesses, since each double is a script that reads its run
 * from the environment.
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

/**
 * Runs the double `name` with `args` inside run `run-1`, and returns that
 * run's log.
 */
const runDouble = (name: string, args: readonly string[]): string => {
  const logDir = mkdtempSync(path.join(tmpdir(), `${name}-runs-`));
  const double = path.join(import.meta.dirname, '..', 'bin', `${name}.ts`);
  spawnSync(process.execPath, [double, ...args], {
    env: { ...process.env, STUB_LOG_DIR: logDir, [runVar]: 'run-1' },
  });
  return runLogPath(logDir, 'run-1');
};

test('a gh call is recorded in the log of the run that made it', ({ expect }) => {
  expect(readCommands(runDouble('gh-stub', ['api', 'user']), 'gh')).toStrictEqual(['api user']);
});

test('a git call is recorded in the log of the run that made it', ({ expect }) => {
  expect(readCommands(runDouble('git-stub', ['--version']), 'git')).toStrictEqual(['--version']);
});

test('a git call the agent runtime makes for itself is not recorded', ({ expect }) => {
  /* Claude Code's startup calls are not the agent's, so a rule about what the
     agent did must not be judged on them. */
  const log = runDouble('git-stub', ['-c', 'core.hooksPath=/dev/null', '--version']);

  expect(readCommands(log, 'git')).toStrictEqual([]);
});
