/*
 * Shared promptfoo `beforeAll` plumbing.
 *
 * Two guarantees the suites depend on: run logs that start empty every eval
 * (checkers assert on presence, so leftovers from a previous eval would be read
 * as this one's evidence), and a refusal to run outside the eval harness for
 * suites that overlay files into .claude/skills.
 */
import fs from 'node:fs';

/**
 * Recreates the directory of run logs and points the stubs at it.
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
