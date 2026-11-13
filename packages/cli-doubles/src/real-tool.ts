/*
 * Finding the real binary for a tool while a double shadows it.
 *
 * A double installed at the front of PATH is what makes interception
 * deterministic, and whatever hands a call on to the real tool wants the
 * opposite: the binary behind it. So the search skips the double's directory,
 * `STUB_BINDIR`, and any other directory the caller names: a version manager's
 * shims, say, which only the caller knows to be there.
 *
 * The search itself is `which`, told to look only at what is left of PATH.
 * On Windows it takes only an `.exe`, because a binary handed on is spawned
 * without a shell, which refuses a `.cmd` and cannot run an extensionless file.
 */
import path from 'node:path';
import which from 'which';

/**
 * `pathValue` without any of `dirs`, as `platform` compares paths.
 */
export const pathWithout = (
  pathValue: string,
  dirs: readonly (string | undefined)[],
  platform: NodeJS.Platform,
): string => {
  const isWindows = platform === 'win32';
  const paths = isWindows ? path.win32 : path.posix;
  // Windows paths ignore case, and PATH need not spell a directory as a caller does.
  const key = (dir: string): string => {
    const resolved = paths.resolve(dir);
    return isWindows ? resolved.toLowerCase() : resolved;
  };
  const skipped = new Set(dirs.flatMap(dir => (dir === undefined ? [] : key(dir))));

  return pathValue
    .split(paths.delimiter)
    .filter(dir => dir !== '' && !skipped.has(key(dir)))
    .join(paths.delimiter);
};

/**
 * The real binary for `name` under `env`, past the double and every directory
 * in `skip`, or `undefined` when there is none.
 */
export const resolveRealTool = (
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  skip: readonly string[] = [],
): string | undefined => {
  const found = which.sync(name, {
    nothrow: true,
    path: pathWithout(env['PATH'] ?? '', [env['STUB_BINDIR'], ...skip], process.platform),
    ...(process.platform === 'win32' && { pathExt: '.exe' }),
  });

  return found ?? undefined;
};

/**
 * The real binary for `name`, or a thrown error naming why there isn't one, for
 * a caller with no fallback: running the double instead would record the
 * caller's own calls as the code under test's, or do nothing at all.
 */
export const requireRealTool = (
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  skip: readonly string[] = [],
): string => {
  const found = resolveRealTool(name, env, skip);
  if (found === undefined)
    throw new Error(
      `no real ${name} on PATH outside STUB_BINDIR and the directories skipped: ` +
      'running the double instead would answer nothing real.',
    );

  return found;
};
