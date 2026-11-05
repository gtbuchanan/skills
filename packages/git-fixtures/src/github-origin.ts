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
import { type GitRunner, runGit } from './seed-repo.ts';

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
 * Names `runner`'s origin `git@github.localhost:<slug>.git`, while every fetch
 * and push through it reaches the bare repository at `bare`.
 */
export const useGitHubOrigin = (
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
