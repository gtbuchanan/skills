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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findUpSync } from 'find-up-simple';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * The nearest directory at or above `start` holding `marker`.
 *
 * Counting directories up is what this used to do, and that broke the moment a
 * module moved — silently, because the wrong answer is still a path. A marker
 * file names the directory by definition, so it survives the next move too.
 *
 * The walk itself is `find-up-simple`; what stays here is the part it has no
 * opinion on. It answers with the marker's own path and `undefined` for "not
 * found", where every caller wants the containing directory and none can do
 * anything useful without one — so `purpose` completes the sentence "…and
 * cannot find it" and the miss is raised rather than returned.
 */
const findUp = (start: string, marker: string, purpose: string): string => {
  const found = findUpSync(marker, { cwd: start });
  if (found === undefined)
    throw new Error(`no ${marker} at or above ${start}: ${purpose}`);

  return path.dirname(found);
};

/**
 * Anchors the shared artifact dir — kept in the repo so call logs stay
 * inspectable — regardless of where a suite's skills live.
 */
export const repoRoot = findUp(
  srcDir,
  'pnpm-workspace.yaml',
  'the harness anchors the shared artifact directory to the workspace root ' +
  'and cannot find it.',
);

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
 * The variable naming the eval artifact directory. The runner always sets it.
 */
export const artifactsVar = 'EVAL_ARTIFACTS_DIR';

/**
 * A path under the eval artifact directory the runner names.
 *
 * Where artifacts go is the runner's to decide: this package cannot know the
 * layout of the repository it runs in, and installed from npm the workspace it
 * would otherwise walk up to is the consumer's, or none. Unset, it fails closed
 * as skillsRoot does, since a guess would scatter call logs where no checker
 * reads them.
 */
export const artifactPath = (...segments: string[]): string => {
  const dir = process.env[artifactsVar];
  if (dir === undefined)
    throw new Error(
      `${artifactsVar} is unset: this suite writes its call logs into the ` +
      'artifact directory the eval runner names. Run it through the runner, ' +
      'which sets it.',
    );
  return path.join(dir, ...segments);
};

/**
 * The root of the calling file's suite — pass `import.meta.url`.
 *
 * Found by walking up for the promptfoo config, which is exactly what both
 * runners key suite discovery on, so a directory is a suite here if and only
 * if it is one to them. The calling file's own directory was the answer while
 * every suite file sat at the suite root; a file under `src/` or `bin/` would
 * have resolved to that subdirectory instead, and the failure would have
 * surfaced as call logs named `src` rather than as anything pointing here.
 */
export const suiteDir = (metaUrl: string): string =>
  findUp(
    path.dirname(fileURLToPath(metaUrl)),
    'promptfooconfig.yaml',
    'this file is not part of an eval suite, and the suite is what names its ' +
    'call log and locates its fixtures.',
  );

/**
 * The skill a suite exercises. Suite directories are named for their skill
 * (evals/<name>/), which is also what the runners key discovery on, so the
 * name never has to be repeated inside the suite.
 */
export const suiteName = (metaUrl: string): string =>
  path.basename(suiteDir(metaUrl));

/**
 * The directory of the calling suite's run logs (see run-log.ts).
 */
export const suiteRunDir = (metaUrl: string): string =>
  artifactPath(`${suiteName(metaUrl)}.runs`);
