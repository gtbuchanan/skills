/*
 * A checkout whose origin is named on GitHub while git reaches a local bare
 * repository.
 *
 * gh decides which repository a checkout belongs to from its origin's URL, so
 * a checkout whose origin is a local path is no repository gh knows. Naming the
 * origin `git@github.localhost:<owner>/<repo>.git` fixes that, and
 * `core.sshCommand` keeps git from dialing anywhere: git hands the would-be ssh
 * connection to bin/local-ssh.ts, which runs the git service it asked for
 * against the bare repository instead.
 *
 * `url.<base>.insteadOf` would be simpler and does not work: `git remote -v`
 * shows the rewritten URL, so gh never sees a GitHub host.
 */
import { fileURLToPath } from 'node:url';
import { type GitRunner, type SeededCheckout, captureGit, runGit } from './seed-repo.ts';

const localSsh = fileURLToPath(new URL('../bin/local-ssh.ts', import.meta.url));

/**
 * A Windows path with forward slashes. git runs `core.sshCommand` through a
 * POSIX shell, where a backslash is an escape.
 */
const posix = (file: string): string => file.replaceAll('\\', '/');

/**
 * The git service local-ssh will run, as git's subcommand, the bare repository
 * to run it in, and the git to run it with.
 */
export interface LocalSshCall {
  readonly bare: string;
  readonly git: string;
  readonly service: 'receive-pack' | 'upload-archive' | 'upload-pack';
}

/**
 * What local-ssh was asked for, from its arguments as git passes them:
 * `<git> <bare> [ssh options] <host> "<service> '<path>'"`. `undefined` when the
 * last one is no git service.
 */
export const localSshCall = (args: readonly string[]): LocalSshCall | undefined => {
  const [git = '', bare = '', ...sshArgs] = args;
  const service = /^git-(?<service>receive-pack|upload-archive|upload-pack) /v
    .exec(sshArgs.at(-1) ?? '')?.groups?.['service'];

  switch (service) {
    case 'receive-pack':
    case 'upload-archive':
    case 'upload-pack': {
      return { bare, git, service };
    }
    default: {
      return undefined;
    }
  }
};

/**
 * A repository on `github.localhost` for an origin to be named after.
 */
export interface GitHubRepository {
  /**
   * The branch pull requests merge into. Put on the origin at the checkout's
   * first commit, because gh checks it out after a merge that deletes the
   * head.
   */
  readonly base: string;
  /**
   * `<owner>/<repo>`.
   */
  readonly slug: string;
}

/**
 * Makes a seeded checkout's origin `repository` on GitHub: the base branch on
 * the origin, and the origin named on `github.localhost`.
 */
export const gitHubOrigin = (repository: GitHubRepository) =>
  ({ branch, origin, runner }: SeededCheckout): void => {
    // A checkout on the base branch has already pushed it.
    if (repository.base !== branch) {
      const root = captureGit(runner, ['rev-list', '--max-parents=0', 'HEAD']);
      runGit(runner, ['push', '-q', 'origin', `${root}:refs/heads/${repository.base}`]);
    }
    useGitHubOrigin(runner, { bare: origin, slug: repository.slug });
  };

/**
 * Names `runner`'s origin `git@github.localhost:<slug>.git`, while every fetch
 * and push through it reaches the bare repository at `bare`.
 */
const useGitHubOrigin = (
  runner: GitRunner,
  options: { readonly bare: string; readonly slug: string },
): void => {
  runGit(runner, ['remote', 'set-url', 'origin', `git@github.localhost:${options.slug}.git`]);
  runGit(runner, [
    'config',
    'core.sshCommand',
    [process.execPath, localSsh, runner.git, options.bare].map(arg => `"${posix(arg)}"`).join(' '),
  ]);
  /* Otherwise git runs the command once with -G to find out which ssh it is,
     and local-ssh refuses that on stderr before every fetch and push. */
  runGit(runner, ['config', 'ssh.variant', 'simple']);
};
