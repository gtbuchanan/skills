/*
 * Running git with no sight of the host's own config.
 *
 * Which git to run is the caller's: a caller shadowing `git` with a double
 * resolves the real binary itself and hands it over.
 */

/**
 * The variables that keep git from reading any config but a repository's own.
 *
 * Two things ride on this. What leaks in is not obvious — `core.autocrlf`
 * rewrites blobs, `commit.gpgsign` embeds a fresh signature timestamp (or
 * fails for want of a key), `init.templateDir` installs hooks into a new
 * repository — so a seeded checkout is only reproducible without it.
 *
 * And `credential.helper`, which a system config routinely names, would let a
 * `git push` under test authenticate as the developer against a live
 * repository. A harness that shadows the network-reaching tools to keep a test
 * offline gains nothing while git still holds credentials of its own.
 *
 * Repo-local config is untouched, so a seeded checkout keeps its origin,
 * branch and identity.
 */
export const hermeticGitConfig = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
} as const satisfies Record<string, string>;

/**
 * This process's environment, with {@link hermeticGitConfig} over it.
 */
export const hermeticGitEnv = (
  extra?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => ({
  ...process.env,
  ...hermeticGitConfig,
  ...extra,
});
