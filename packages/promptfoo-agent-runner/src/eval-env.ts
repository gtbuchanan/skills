/*
 * The environment an eval's agent runs under, built from scratch.
 *
 * Kept apart from scrubbed-path.ts, which narrows PATH: this decides every
 * other variable, and takes the narrowed PATH as given.
 */
import { resolveRealTool } from '@gtbuchanan/cli-doubles/real-tool';
import { hermeticGitConfig } from '@gtbuchanan/git-fixtures/hermetic-git';
import type { EvalAgent } from '@gtbuchanan/promptfoo-agent/eval-agent';
import type { EnvContributor } from '@gtbuchanan/promptfoo-agent/suite-config';
import { evalAgents } from './agents.ts';
import { miseShimsDir } from './mise-shims.ts';
import { agentExecutable } from './scrubbed-path.ts';

/*
 * OS plumbing the child chain (node → promptfoo → the agent → Git Bash) needs
 * to run at all — Docker gets these from its Linux base image; on the host we
 * forward them by name so nothing behavioral rides along. HOME is set separately
 * to a clean dir, so the home-pointing vars here are deliberately omitted.
 */
const windowsEssentialVars = [
  'APPDATA', 'COMPUTERNAME', 'ComSpec', 'LOCALAPPDATA',
  'NUMBER_OF_PROCESSORS', 'OS', 'PATHEXT', 'PROCESSOR_ARCHITECTURE',
  'PROCESSOR_ARCHITEW6432', 'PROGRAMDATA', 'ProgramFiles', 'ProgramFiles(x86)',
  'ProgramW6432', 'SESSIONNAME', 'SystemRoot', 'TEMP', 'TMP', 'USERDOMAIN',
  'USERNAME', 'windir',
];
const posixEssentialVars = [
  'ANDROID_DATA', 'ANDROID_ROOT', 'LANG', 'LANGUAGE', 'LD_LIBRARY_PATH',
  'LD_PRELOAD', 'LOGNAME', 'PREFIX', 'SHELL', 'TERM', 'TMPDIR', 'TZ', 'USER',
];
/**
 * Network config the SDK needs to reach the API; forwarded only if set, as is
 * each agent's auth.
 */
const networkVars = [
  'HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy',
  'NODE_EXTRA_CA_CERTS', 'NO_PROXY', 'no_proxy',
];
/**
 * Length of a Windows drive prefix (`C:`) when splitting HOME into drive+path.
 */
const winDrivePrefixLength = 2;

/**
 * The real binary for `name` on `sourceEnv`'s PATH, past the doubles and
 * mise's shims: a shim is mise itself, which cannot start under the bare
 * environment a double gives the tool. Where mise has the tool active, its
 * pinned binary already comes before the shims.
 */
const realToolIn = (sourceEnv: NodeJS.ProcessEnv) => (name: string): string | undefined => {
  const shims = miseShimsDir(sourceEnv, process.platform);
  return resolveRealTool(name, sourceEnv, shims === undefined ? [] : [shims]);
};

/**
 * The variables `contributors` add. A contributor sees only the caller
 * variables it declared, and may not set one in `taken`: what the runner sets
 * is the isolation, and a suite does not get to move it.
 */
const contributedEnv = (
  contributors: readonly EnvContributor[],
  context: {
    readonly homeDir: string;
    readonly sourceEnv: NodeJS.ProcessEnv;
    readonly taken: ReadonlySet<string>;
  },
): Record<string, string> => {
  const realTool = realToolIn(context.sourceEnv);
  const added = contributors.flatMap((contributor) => {
    const source = Object.fromEntries(
      contributor.reads.map(name => [name, context.sourceEnv[name]]),
    );
    return Object.entries(contributor.env({ homeDir: context.homeDir, realTool, source }));
  });
  const clash = added.find(([name]) => context.taken.has(name));
  if (clash !== undefined)
    throw new Error(`a suite's eval config may not set ${clash[0]}: the runner sets it`);

  return Object.fromEntries(added);
};

interface EvalEnvOptions {
  readonly scrubbedPath: string;
  readonly stubDir: string;
  readonly homeDir: string;
  readonly sourceEnv?: NodeJS.ProcessEnv;
  readonly agents?: readonly EvalAgent[];
  readonly contributors?: readonly EnvContributor[];
  /**
   * The platform the agent runs on; the host's unless a test names another.
   */
  readonly platform?: NodeJS.Platform;
}

/**
 * The variables of `sourceEnv` among `names` that are set.
 */
const forwarded = (
  names: readonly string[],
  sourceEnv: NodeJS.ProcessEnv,
): Record<string, string> => Object.fromEntries(names.flatMap((name): [string, string][] => {
  const value = sourceEnv[name];
  return value === undefined ? [] : [[name, value]];
}));

/**
 * What `platform` needs beyond the common variables: its OS plumbing, plus on
 * Windows the clean HOME under the names Windows reads it by, and elsewhere
 * the locale categories.
 */
const platformEnv = (
  platform: NodeJS.Platform,
  homeDir: string,
  sourceEnv: NodeJS.ProcessEnv,
): Record<string, string> => {
  if (platform === 'win32')
    return {
      ...forwarded(windowsEssentialVars, sourceEnv),
      HOMEDRIVE: homeDir.slice(0, winDrivePrefixLength),
      HOMEPATH: homeDir.slice(winDrivePrefixLength),
      USERPROFILE: homeDir,
    };

  const localeVars = Object.keys(sourceEnv).filter(name => name.startsWith('LC_'));
  return forwarded([...posixEssentialVars, ...localeVars], sourceEnv);
};

/**
 * What the runner itself puts in the eval env; see {@link buildEvalEnv}.
 */
const runnerEnv = ({
  scrubbedPath,
  stubDir,
  homeDir,
  sourceEnv = process.env,
  agents = evalAgents,
  platform = process.platform,
}: EvalEnvOptions): Record<string, string> => ({
  ...hermeticGitConfig,
  ...Object.fromEntries(agents.map(({ executable }) =>
    [executable.envVar, agentExecutable(executable, sourceEnv)])),
  ...forwarded([...networkVars, ...agents.flatMap(agent => agent.auth.envVars)], sourceEnv),
  ...platformEnv(platform, homeDir, sourceEnv),
  HOME: homeDir,
  PATH: scrubbedPath,
  STUB_BINDIR: stubDir,
});
/**
 * Constructs the eval env from scratch (allowlist), rather than inheriting the
 * caller's. Only OS plumbing, auth/network config, PATH/STUB_BINDIR, and a clean
 * HOME go in — so behavioral vars from the surrounding session never reach the
 * eval agent. Policy-free: nothing here depends on which tools are admitted.
 *
 * Git's config files sit outside that allowlist: it reads a system config from
 * a path it compiled in, and Git for Windows ships one naming a credential
 * helper. Left readable, a `git push` to a live remote would authenticate as
 * the developer, so the agent's git reads its repository's config and nothing
 * else.
 *
 * Whatever a suite's tools need beyond that, its eval config contributes; see
 * {@link EnvContributor}.
 */
export const buildEvalEnv = (options: EvalEnvOptions): Record<string, string> => {
  const env = runnerEnv(options);
  const added = contributedEnv(options.contributors ?? [], {
    homeDir: options.homeDir,
    sourceEnv: options.sourceEnv ?? process.env,
    taken: new Set(Object.keys(env)),
  });

  return { ...env, ...added };
};
