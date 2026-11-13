/*
 * Where mise keeps its shims, so the runner can look past them for a real tool.
 *
 * A shim is mise itself, and under the bare environment a double gives the
 * tool it runs, mise cannot tell which config files were trusted and exits
 * before the tool does. Where mise has the tool active, the pinned binary
 * already comes before the shims on PATH.
 */
import path from 'node:path';

/**
 * Where mise keeps its shims under `env` on `platform`, as mise locates its
 * data directory, or `undefined` when nothing in `env` locates it.
 */
export const miseShimsDir = (
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string | undefined => {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const home = env['HOME'];
  const dataHome = env['XDG_DATA_HOME'] ?? (home === undefined
    ? undefined
    : paths.join(home, '.local', 'share'));
  const platformData = platform === 'win32' ? env['LOCALAPPDATA'] : dataHome;
  const miseData = platformData === undefined ? undefined : paths.join(platformData, 'mise');
  const dataDir = env['MISE_DATA_DIR'] ?? miseData;

  return dataDir === undefined ? undefined : paths.join(dataDir, 'shims');
};
