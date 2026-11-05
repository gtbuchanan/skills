/*
 * Tests for where the script double records its calls.
 *
 * The checker reads a test's script calls from the log of the run that made
 * them, so a call recorded anywhere else is one the checker never sees, and
 * the test fails as though the skill had never run its script.
 *
 * Driven as a subprocess: the double is overlaid standalone and run as a file,
 * so its environment is the only thing it can read the run from.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readJsonl } from '@gtbuchanan/cli-doubles/calls';
import { runLogPath, runVar } from '@gtbuchanan/cli-doubles/run-log';
import * as v from 'valibot';
import { test } from 'vitest';

const stub = path.join(import.meta.dirname, '..', 'bin', 'script-stub.cjs');

/**
 * Runs the double with `args`, under run `runId` when one is given, and
 * returns the directory its logs go to.
 */
const runScript = (runId: string | undefined, ...args: readonly string[]): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'script-stub-'));
  const logDir = path.join(root, 'runs');
  const { [runVar]: _inherited, ...env } = process.env;
  spawnSync(process.execPath, [stub, ...args], {
    env: { ...env, STUB_LOG_DIR: logDir, ...runId !== undefined && { [runVar]: runId } },
  });
  return logDir;
};

test('a call is recorded in the log of the run that made it', ({ expect }) => {
  const logDir = runScript('run-1', '-PipelineId', '900001', '-WhatIf');

  expect(readJsonl(runLogPath(logDir, 'run-1'), v.unknown())).toStrictEqual([
    expect.objectContaining({ cmd: 'script', pipelineId: 900_001, whatIf: true }),
  ]);
});

test('a call made outside any run is passed over', ({ expect }) => {
  const logDir = runScript(undefined, '-PipelineId', '900001', '-WhatIf');

  expect(existsSync(logDir) ? readdirSync(logDir) : []).toStrictEqual([]);
});
