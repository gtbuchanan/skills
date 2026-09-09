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
 * The checkout's branch, or an empty string where there is no branch to name —
 * no repository, or a detached checkout.
 *
 * Empty rather than thrown because the caller is usually a double deciding
 * which pull request a bare command refers to: it has a fallback of its own,
 * and a directory that is not a repository is one of the cases it handles
 * rather than an error it can act on. Both answers collapse to the same empty
 * string for the same reason — neither names a branch, so neither is something
 * a caller should put in front of the code under test.
 */
export const branchAt = (dir: string): string => {
  const result = probeGit(
    { cwd: dir, git: resolveRealGit() },
    ['rev-parse', '--abbrev-ref', 'HEAD'],
  );
  if (result.status !== 0) return '';

  /* A detached checkout answers `HEAD`, which is not a branch and would go
     into a pull request URL as though it were one. Git refuses to name a
     branch `HEAD`, so treating it as the sentinel it is costs nothing. */
  const branch = result.stdout.trim();
  return branch === 'HEAD' ? '' : branch;
};
