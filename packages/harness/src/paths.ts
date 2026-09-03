/*
 * Shared path resolution for the eval suites.
 *
 * Every suite writes a call log that its checker reads back. Both derive the
 * path from their own location rather than naming the skill, so the writer
 * (setup.ts) and the reader (*-check.ts) cannot disagree: a checker treats a
 * missing log as an empty one, so a mismatched path would not surface as "log
 * not found" but as a pile of "missing call for X" — a skill regression that
 * never happened.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * The workspace root, found by walking up for the file that defines it.
 *
 * Counting directories up from this module is what it used to do, and that
 * broke the moment the module moved — silently, because the wrong answer is
 * still a path. `pnpm-workspace.yaml` marks the root by definition, so this
 * survives the next move as well.
 */
const findWorkspaceRoot = (start: string): string => {
  let dir = start;
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;

    const parent = path.dirname(dir);
    if (parent === dir)
      throw new Error(
        `no pnpm-workspace.yaml at or above ${start}: the harness anchors the ` +
        'shared artifact directory to the workspace root and cannot find it.',
      );
    dir = parent;
  }
};

/**
 * Anchors the shared artifact dir — kept in the repo so call logs stay
 * inspectable — regardless of where a suite's skills live.
 */
export const repoRoot = findWorkspaceRoot(srcDir);

/**
 * The skill tree a suite overlays its test doubles onto, named by
 * EVAL_WORKSPACE. The runner always sets it.
 *
 * Every caller WRITES through this, so there is no safe default. Deriving it
 * from this file's location instead would point a hand-run `promptfoo eval` at
 * the developer's own .claude/skills and overlay mock skills onto a real
 * install. Absent a workspace we fail closed rather than guess.
 */
export const skillsRoot = (): string => {
  const workspace = process.env['EVAL_WORKSPACE'];
  if (workspace === undefined)
    throw new Error(
      'EVAL_WORKSPACE is unset: this suite writes into the workspace the eval ' +
      'runner provides and has no safe fallback. Run it through the runner, ' +
      'which sets it.',
    );
  return workspace;
};

/**
 * A path under the shared eval artifact directory.
 */
export const artifactPath = (...segments: string[]): string =>
  path.join(repoRoot, 'artifacts', 'skill-evals', ...segments);

/**
 * The directory of the calling suite file — pass `import.meta.url`.
 */
export const suiteDir = (metaUrl: string): string =>
  path.dirname(fileURLToPath(metaUrl));

/**
 * The skill a suite exercises. Suite directories are named for their skill
 * (evals/<name>/), which is also what the runners key discovery on, so the
 * name never has to be repeated inside the suite.
 */
export const suiteName = (metaUrl: string): string =>
  path.basename(suiteDir(metaUrl));

/**
 * The append-only stub call log for the calling suite.
 */
export const suiteCallLog = (metaUrl: string): string =>
  artifactPath(`${suiteName(metaUrl)}.calls.jsonl`);

/**
 * The per-run log directory for suites whose doubles key one file per test
 * instead of appending to a single shared log.
 */
export const suiteRunDir = (metaUrl: string): string =>
  artifactPath(`${suiteName(metaUrl)}.runs`);
