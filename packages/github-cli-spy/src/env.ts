/*
 * The whole environment the gh spy hands the real gh.
 *
 * Built from an allowlist rather than inherited, so that nothing the caller
 * carries (a token, a host, a proxy exemption) can point gh anywhere but the
 * fake. A spike test that inherited the developer's environment reached
 * api.github.com with real credentials.
 */
import path from 'node:path';
import { hermeticGitConfig } from '@gtbuchanan/git-fixtures/hermetic-git';
import type { Caller } from '@gtbuchanan/github-fake/caller';
import { fakeGhEnv } from '@gtbuchanan/github-fake/gh-env';

/**
 * What gh needs from the caller to start, and nothing that could carry a
 * credential or point it anywhere. Windows needs SystemRoot to open a socket,
 * and the temporary directories are where gh and git write scratch files.
 */
const inherited = ['HOME', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE'];

export interface RealGhEnvOptions {
  /**
   * The call, the context its host finds it by, and the world it is answered
   * from.
   */
  readonly caller: Caller;
  /**
   * A directory this call owns, for gh's config, cache, state and data.
   */
  readonly dir: string;
  /**
   * The port the fake listens on.
   */
  readonly port: number;
  /**
   * The real git, which gh's own git calls reach first.
   */
  readonly realGit: string;
  /**
   * The environment the spy was started with.
   */
  readonly sourceEnv: NodeJS.ProcessEnv;
}

export const realGhEnv = (options: RealGhEnvOptions): Record<string, string> => {
  const { caller, dir, port, realGit, sourceEnv } = options;

  return {
    ...Object.fromEntries(inherited.flatMap((name): [string, string][] => {
      const value = sourceEnv[name];
      return value === undefined ? [] : [[name, value]];
    })),
    ...hermeticGitConfig,
    ...fakeGhEnv({ caller, dir, port }),
    /* The real git first, so gh's own git calls (remotes, branches) reach it
       rather than the recording double, and are not logged as the agent's. */
    PATH: [path.dirname(realGit), sourceEnv['PATH'] ?? ''].join(path.delimiter),
  };
};
