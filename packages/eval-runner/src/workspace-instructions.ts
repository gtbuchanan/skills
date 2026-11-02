/*
 * Keeping instruction files above an eval workspace from the agent.
 *
 * Claude Code collects CLAUDE.md files from every directory above its working
 * directory and loads them as project memory, so `setting_sources: ['project']`
 * does not stop at the workspace. The native runner mints workspaces in the
 * temp dir, which on Windows sits inside the user profile: the walk passes the
 * profile itself and picks up the developer's own `~/.claude/CLAUDE.md`, with
 * no regard for the clean HOME the run was given. An eval graded under the
 * developer's personal rules measures those rules as much as the skill.
 *
 * The runner hands the agent a `claudeMdExcludes` setting from the workspace's
 * own `.claude/settings.json` instead. The patterns are derived from the
 * workspace's path alone, so they also cover a file created there after the
 * workspace was minted, and nothing has to be looked for first.
 */
import { realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * Characters that are glob syntax rather than literal text, at least where
 * they can occur inside a path: groups, classes, expansions and wildcards. The
 * extglob prefixes (`!`, `@`, `+`) only act before a `(`, so escaping that is
 * enough. A Windows username may hold parentheses and braces.
 */
const globSyntax = /[\(\)\[\{\}*?]/gv;

/**
 * `text` as a glob matching itself. Each special character goes in a class of
 * its own rather than behind a backslash, which a matcher fed Windows paths
 * may take for a separator. An unopened `]` is already literal.
 */
const literalGlob = (text: string): string =>
  text.replaceAll(globSyntax, character => `[${character}]`);

/**
 * Where Claude Code looks for instruction files in each directory it visits.
 */
const instructionFiles = ['CLAUDE.md', 'CLAUDE.local.md', '.claude/**'];

/**
 * Every directory strictly above `dir`, nearest first.
 *
 * Walked with the Windows rules on every host: they accept both separators and
 * stop at a drive root as well as at `/`, where the POSIX rules would carry a
 * Windows path on past `C:/` into `C:` and `.`.
 */
const ancestorsOf = (dir: string): string[] => {
  const parent = path.win32.dirname(dir);
  return parent === dir ? [] : [parent, ...ancestorsOf(parent)];
};

/**
 * `claudeMdExcludes` patterns covering every instruction file in a directory
 * above `workspace`. The workspace's own are left alone: a scenario may ship
 * a CLAUDE.md as part of the world it describes.
 *
 * Separators are turned to `/` because the patterns are globs, where a
 * backslash escapes the character after it.
 */
export const ancestorInstructionExcludes = (workspace: string): string[] =>
  ancestorsOf(workspace).flatMap(ancestor =>
    instructionFiles.map(file =>
      path.posix.join(literalGlob(ancestor.replaceAll('\\', '/')), file)));

/**
 * {@link ancestorInstructionExcludes} for a workspace on disk, named by the
 * path it resolves to.
 *
 * The patterns are matched as text, and the temp dir a workspace is minted in
 * may be reached through an 8.3 short name (`C:\Users\RUNNER~1\…`), a link, or
 * another case than the one the agent works under. Any of those would leave
 * the patterns naming a path nothing is loaded from.
 */
export const workspaceInstructionExcludes = (workspace: string): string[] =>
  ancestorInstructionExcludes(realpathSync.native(workspace));
