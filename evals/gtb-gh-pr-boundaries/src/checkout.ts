/*
 * What branch a scenario's checkout is standing on.
 *
 * Pull request identity lives in `@gtbuchanan/github-cli-stub/pulls`, which
 * takes this as a function rather than running git itself. That split is the
 * point: the double records what the skill asked for, and a question the double
 * asked on its own behalf has no business in that log.
 *
 * Resolved through the real git binary rather than the name on PATH, for the
 * same reason — the recorder shadowing `git` would otherwise log this as though
 * the skill had run it.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import { hermeticGitEnv, resolveRealGit } from '@gtbuchanan/agent-skills-harness/real-git';
import spawn from 'cross-spawn';

/**
 * The checkout's branch, or an empty string where there is no checkout to ask.
 */
export const branchAt = (dir: string): string => {
  const result = spawn.sync(
    resolveRealGit(),
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    { cwd: dir, encoding: 'utf8', env: hermeticGitEnv() },
  );

  return result.status === 0 ? result.stdout.trim() : '';
};
