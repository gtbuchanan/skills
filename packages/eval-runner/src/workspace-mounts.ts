/*
 * Which `node_modules` the container must resolve through its own install.
 *
 * The runner bind-mounts `packages/` and `evals/` so a container executes the
 * source on disk. Those trees carry each workspace package's `node_modules`
 * along with them, and every link in one was created by the HOST: it names a
 * path in the host's `.pnpm` layout, which the container's Linux install does
 * not share. pnpm shortens a `.pnpm` directory name past a length limit on
 * Windows, so the same package sits at two different paths on the two sides
 * and the mounted link dangles — the agent SDK's native binary went missing
 * exactly this way, on a package whose name was merely long enough. Every
 * other package escaped it by having short dependency names, which is not a
 * property anything maintains.
 *
 * Shadowing each one with an anonymous volume hands the container back the
 * directory the image built, because Docker seeds a fresh anonymous volume
 * from whatever the image holds at its mount point. The bind mount underneath
 * is untouched, so a host edit is still what runs.
 *
 * The packages are derived rather than listed here, so a new one joins by
 * existing rather than by remembering to enrol. `pnpm-lock.yaml` names the
 * same set outright, in its importers, and is the file the image's own install
 * read — but it is where a package is *recorded*, while the workspace file is
 * where one is declared, and reaching those few keys means parsing the whole
 * dependency graph above them.
 */
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { parse } from 'yaml';

/**
 * The globs a pnpm workspace declares, as patterns over manifests.
 *
 * Split because a glob runner takes its exclusions separately, where pnpm
 * writes them inline as `!`-prefixed entries.
 */
export interface WorkspaceGlobs {
  readonly exclude: string[];
  readonly include: string[];
}

/*
 * Only `packages:` is read. Everything else in the file configures the install
 * — catalogs, hoisting, peer rules — and none of it names a directory.
 */
const WorkspaceSchema = v.object({
  packages: v.array(v.string()),
});

/**
 * Marks an entry as subtracting from the set, per pnpm's workspace globs.
 */
const negationPrefix = '!';

/**
 * What makes a directory a workspace package, and so what the globs match on.
 * pnpm globs for the manifest rather than the directory for the same reason:
 * a directory that holds no manifest is not a package, whatever it is named.
 */
const manifest = 'package.json';

/**
 * Whether a workspace pattern subtracts from the set rather than adding to it.
 */
const isNegated = (pattern: string): boolean =>
  pattern.startsWith(negationPrefix);

/**
 * The manifest glob a workspace pattern names, negated or not.
 *
 * The prefix is sliced rather than replaced: `!` only negates in the leading
 * position, and a replace would take one out of the middle of a pattern too.
 */
const globFor = (pattern: string): string => {
  const directories = isNegated(pattern)
    ? pattern.slice(negationPrefix.length)
    : pattern;

  return `${directories}/${manifest}`;
};

/**
 * The `packages:` globs a `pnpm-workspace.yaml` declares.
 */
export const workspaceGlobs = (workspaceYaml: string): WorkspaceGlobs => {
  const { packages } = v.parse(WorkspaceSchema, parse(workspaceYaml));

  return {
    exclude: packages.filter(isNegated).map(globFor),
    include: packages.filter(pattern => !isNegated(pattern)).map(globFor),
  };
};

/**
 * Never a workspace package, however a pattern reaches it.
 *
 * Every installed dependency carries a manifest, so a recursive pattern like
 * `packages/**` matches the install rather than the workspace — and the runner
 * would then shadow one mount per dependency. pnpm ignores these directories
 * when it resolves the same globs; matching that is what keeps this function's
 * answer the same as the one the image was built from.
 */
const installedTrees = '**/node_modules/**';

/**
 * Every workspace package under `root`, as a `/`-separated path relative to it.
 *
 * Sorted, so the argv a run is launched with reads the same twice.
 */
export const workspacePackageDirs = (root: string): string[] => {
  const { exclude, include } = workspaceGlobs(
    readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'),
  );
  return globSync(include, { cwd: root, exclude: [...exclude, installedTrees] })
    .map(hit => path.dirname(hit).replaceAll('\\', '/'))
    .toSorted((left, right) => left.localeCompare(right));
};

/**
 * `docker run` arguments shadowing each package's `node_modules` under
 * `containerRoot` with an anonymous volume.
 *
 * A `-v` naming only a container path is what asks for one. Argument order
 * carries no meaning: Docker sorts mounts by destination depth, so each shadow
 * lands on top of the bind mount that covers it however these are passed.
 */
export const nodeModulesShadows = (
  containerRoot: string,
  packageDirs: readonly string[],
): string[] =>
  packageDirs.flatMap(dir => ['-v', `${containerRoot}/${dir}/node_modules`]);
