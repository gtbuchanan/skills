/*
 * The repository the runner runs evals for: the workspace root above the
 * runner's own source, where it finds the suites and keeps their artifacts.
 *
 * Found by walking up for the marker file rather than counting directories,
 * which broke the moment a module moved, silently, because the wrong answer is
 * still a path.
 */
import path from 'node:path';
import { findUpSync } from 'find-up-simple';

/**
 * The workspace root at or above `start`.
 */
export const findRepoRoot = (start: string): string => {
  const marker = findUpSync('pnpm-workspace.yaml', { cwd: start });
  if (marker === undefined)
    throw new Error(
      `no pnpm-workspace.yaml at or above ${start}: the runner finds the suites ` +
      'and keeps their artifacts under the workspace root and cannot find it.',
    );
  return path.dirname(marker);
};

export const repoRoot = findRepoRoot(import.meta.dirname);
