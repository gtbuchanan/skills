/*
 * Shared promptfoo `beforeAll` plumbing.
 *
 * Two guarantees the suites depend on: a call log that starts empty every run
 * (checkers assert on presence, so leftovers from a previous run would be read
 * as this run's evidence), and a refusal to run outside the eval harness for
 * suites that overlay files into .claude/skills.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Empties the log, leaving it in place.
 *
 * For suites whose checkers assert over the whole file, this belongs in
 * `beforeEach` as well: promptfoo fires `beforeAll` once per eval, so under
 * `--repeat N` every repeat would otherwise append to one log and a later
 * repeat could be satisfied by an earlier repeat's calls — the repeats would
 * not be independent samples. Truncating per test is race-free only for a
 * serial suite (`maxConcurrency: 1`).
 */
export const truncateCallLog = (logPath: string): void => {
  fs.writeFileSync(logPath, '');
};

/**
 * Truncates the log, creating its directory, and points the stubs at it.
 */
export const resetCallLog = (logPath: string): void => {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  truncateCallLog(logPath);
  process.env['STUB_LOG'] = logPath;
};

/**
 * Recreates a per-run directory of logs and points the stubs at it. Used by
 * suites whose doubles key one file per test instead of sharing one log.
 */
export const resetRunDir = (runDir: string): void => {
  fs.rmSync(runDir, { force: true, recursive: true });
  fs.mkdirSync(runDir, { recursive: true });
  process.env['STUB_LOG_DIR'] = runDir;
};

/**
 * Overlaying test doubles onto .claude/skills is only safe inside the harness's
 * ephemeral per-suite context, which the runner marks with STUB_BINDIR. This
 * stops a hand-run `promptfoo eval` from overwriting a developer's real skill
 * install.
 * @param what the overlay being performed, for the error message
 */
export const requireHarness = (what: string): void => {
  if (process.env['STUB_BINDIR']) return;
  throw new Error(
    `this eval overlays ${what} onto .claude/skills; run it through the eval ` +
    'runner, which sets STUB_BINDIR, so it never overwrites your real skill ' +
    'install.',
  );
};
