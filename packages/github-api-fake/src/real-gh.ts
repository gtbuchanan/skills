/*
 * Finding the real gh past mise's shims.
 *
 * gh runs against the fake under a bare environment: no HOME, and its state
 * directory moved into the call's own. A mise shim on PATH is mise itself, and
 * mise cannot start there, since what it trusted is recorded in the state
 * directory gh was just given. It fails before gh runs, so the search skips
 * mise's shims directory and takes the binary behind it.
 *
 * Wherever mise has gh active (`mise x`, `mise activate`, CI), the pinned
 * binary comes before the shims on PATH, so that is what the search finds.
 * Where it is not, as on Termux, whose gh mise cannot install, the search
 * falls through to the host's own.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * A host to search: its PATH, its platform, mise's shims directory to skip,
 * and how to tell a file is there.
 */
export interface GhLookup {
  readonly isFile: (candidate: string) => boolean;
  readonly pathValue: string;
  readonly platform: NodeJS.Platform;
  readonly shimsDir?: string | undefined;
}

/**
 * The first gh on PATH outside mise's shims, or `undefined` when there is none.
 */
export const findGhOutsideShims = (lookup: GhLookup): string | undefined => {
  const { isFile, pathValue, platform, shimsDir } = lookup;
  const isWindows = platform === 'win32';
  const paths = isWindows ? path.win32 : path.posix;
  // Windows paths ignore case, and PATH need not spell one as mise does.
  const key = (dir: string): string => {
    const resolved = paths.resolve(dir);
    return isWindows ? resolved.toLowerCase() : resolved;
  };
  const skip = shimsDir === undefined ? undefined : key(shimsDir);
  // spawn without a shell refuses a .cmd and cannot run an extensionless file.
  const name = isWindows ? 'gh.exe' : 'gh';

  return pathValue
    .split(paths.delimiter)
    .filter(dir => dir !== '' && key(dir) !== skip)
    .map(dir => paths.join(dir, name))
    .find(candidate => isFile(candidate));
};

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

/**
 * The real gh under `env`: the one GH_REAL names, else the first on its PATH
 * outside mise's shims, or `undefined` when there is neither.
 */
export const resolveRealGh = (env: NodeJS.ProcessEnv): string | undefined =>
  env['GH_REAL'] ?? findGhOutsideShims({
    isFile: candidate => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile() ?? false,
    pathValue: env['PATH'] ?? '',
    platform: process.platform,
    shimsDir: miseShimsDir(env, process.platform),
  });
