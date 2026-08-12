/*
 * Temp-dir lifecycle for one eval run.
 *
 * The container-free runner mints a stub dir, a clean HOME and a workspace per
 * suite. Nothing else reclaims them, and a workspace holds a whole skill tree,
 * so an active branch leaves a growing pile of them in the temp dir.
 *
 * Kept separate from the runner so a host that never sees `pnpm eval` — another
 * repo's harness, a one-off script — can borrow the lifecycle on its own.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * 128 + SIGINT, the shell convention for a run cancelled with Ctrl-C.
 */
const sigintExitCode = 130;

export interface EphemeralRun {
  /**
   * A fresh temp dir under `prefix`, swept when the process exits.
   */
  mintDir: (prefix: string) => string;
  /**
   * Holds `dir` back from the sweep — for evidence worth reading afterwards.
   */
  keep: (dir: string) => void;
}

/**
 * Starts tracking temp dirs for this process and arranges the sweep.
 *
 * The hook runs on exit rather than at the end of the caller's work, so early
 * bail-outs and thrown errors are covered too, and SIGINT routes through it
 * because Ctrl-C mid-run is the likeliest way to strand a dir.
 */
export const beginEphemeralRun = (): EphemeralRun => {
  const dirs: string[] = [];
  const kept = new Set<string>();

  process.on('exit', () => {
    for (const dir of dirs) {
      if (kept.has(dir)) continue;
      try {
        rmSync(dir, { force: true, maxRetries: 2, recursive: true });
      } catch {
        // Best effort: a dir still held open by a dying child is left behind.
      }
    }
  });
  process.on('SIGINT', () => {
    process.exit(sigintExitCode);
  });

  return {
    keep: (dir: string): void => {
      kept.add(dir);
    },
    mintDir: (prefix: string): string => {
      const dir = mkdtempSync(path.join(tmpdir(), prefix));
      dirs.push(dir);
      return dir;
    },
  };
};
