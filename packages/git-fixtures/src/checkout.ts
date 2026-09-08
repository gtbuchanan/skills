/*
 * Asking a checkout what branch it is on.
 *
 * Small enough to inline anywhere, and duplicated in every double that needed
 * it before it lived here. It is separate from seeding because it is the one
 * question asked of a repository somebody else seeded.
 *
 * Resolved through the real git binary rather than the name on PATH: where a
 * recorder is shadowing `git`, asking by name would log this as though the code
 * under test had run it, and a question the double asked on its own behalf has
 * no business in that record.
 *
 * Loaded by stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import { resolveRealGit } from './real-git.ts';
import { probeGit } from './seed-repo.ts';

/**
 * The checkout's branch, or an empty string where there is no checkout to ask.
 *
 * Empty rather than thrown because the caller is usually a double deciding
 * which pull request a bare command refers to: it has a fallback of its own,
 * and a directory that is not a repository is one of the cases it handles
 * rather than an error it can act on.
 */
export const branchAt = (dir: string): string => {
  const result = probeGit(
    { cwd: dir, git: resolveRealGit() },
    ['rev-parse', '--abbrev-ref', 'HEAD'],
  );

  return result.status === 0 ? result.stdout.trim() : '';
};
