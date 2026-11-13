/*
 * The environment an eval's agent runs under, built from scratch.
 *
 * Kept apart from scrubbed-path.ts, which narrows PATH: this decides every
 * other variable, and takes the narrowed PATH as given.
 */
import path from 'node:path';
import { resolveRealTool } from '@gtbuchanan/cli-doubles/real-tool';
import { hermeticGitConfig } from '@gtbuchanan/git-fixtures/hermetic-git';
import type { EvalAgent } from '@gtbuchanan/promptfoo-agent/eval-agent';
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
const osEssentialVars =
  process.platform === 'win32' ? windowsEssentialVars : posixEssentialVars;
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
 * GH_REAL, naming the real gh, where the caller has one.
 *
 * gh stays shadowed on the scrubbed PATH, so an agent's `gh` always reaches a
 * double. A double that hands calls on to the real gh, against a fake GitHub,
 * finds it here instead: the first gh on the caller's PATH outside mise's
 * shims, which is mise's pinned one wherever mise is active, unless the caller
 * names one outright.
 */
const realGhVar = (sourceEnv: NodeJS.ProcessEnv): Record<string, string> => {
  const shims = miseShimsDir(sourceEnv, process.platform);
  const realGh = sourceEnv['GH_REAL'] ??
    resolveRealTool('gh', sourceEnv, shims === undefined ? [] : [shims]);
  return realGh === undefined ? {} : { GH_REAL: realGh };
};

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
 */
export const buildEvalEnv = ({
  scrubbedPath,
  stubDir,
  homeDir,
  sourceEnv = process.env,
  agents = evalAgents,
}: {
  scrubbedPath: string;
  stubDir: string;
  homeDir: string;
  sourceEnv?: NodeJS.ProcessEnv;
  agents?: readonly EvalAgent[];
}): Record<string, string> => {
  const env: Record<string, string> = {
    ...hermeticGitConfig,
    ...Object.fromEntries(agents.map(({ executable }) =>
      [executable.envVar, agentExecutable(executable, sourceEnv)])),
    ...realGhVar(sourceEnv),
    /* An agent can run GH_REAL itself, past the double. Left to its default,
       gh on Windows reads its config from APPDATA, which is passed on below,
       and finds the developer's login there. */
    GH_CONFIG_DIR: path.join(homeDir, '.config', 'gh'),
    HOME: homeDir,
    PATH: scrubbedPath,
    STUB_BINDIR: stubDir,
  };
  const authVars = agents.flatMap(agent => agent.auth.envVars);
  for (const name of [...osEssentialVars, ...networkVars, ...authVars]) {
    const value = sourceEnv[name];
    if (value !== undefined) env[name] = value;
  }
  if (process.platform !== 'win32')
    for (const [name, value] of Object.entries(sourceEnv))
      if (value !== undefined && name.startsWith('LC_')) env[name] = value;
  if (process.platform === 'win32') {
    env['USERPROFILE'] = homeDir;
    env['HOMEDRIVE'] = homeDir.slice(0, winDrivePrefixLength);
    env['HOMEPATH'] = homeDir.slice(winDrivePrefixLength);
  }
  return env;
};
