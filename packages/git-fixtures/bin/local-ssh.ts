#!/usr/bin/env node
/*
 * `core.sshCommand` for a seeded checkout whose origin looks like GitHub.
 *
 * gh decides which repository a checkout belongs to from its remote's URL, so
 * a checkout whose origin is a local path is no repository gh knows. Naming
 * the origin `git@github.localhost:<owner>/<repo>.git` fixes that, and this is
 * what keeps git from dialing anywhere: git hands the would-be ssh connection
 * here, and the git service it asked for runs against the local bare origin
 * named as the first argument instead.
 *
 * The real git, resolved past any double, so the transport's own calls are not
 * recorded as the agent's.
 *
 * git calls it as: <this> <bare> [ssh options] <host> "git-upload-pack '<path>'"
 */
import { spawnSync } from 'node:child_process';
import { hermeticGitEnv, resolveRealGit } from '../src/real-git.ts';

/**
 * `process.argv` leads with the node binary and this script.
 */
const cliArgsIndex = 2;

const [bare = '', ...sshArgs] = process.argv.slice(cliArgsIndex);
const remoteCommand = sshArgs.at(-1) ?? '';
const service = /^git-(?<service>upload-pack|receive-pack|upload-archive) /v
  .exec(remoteCommand)?.groups?.['service'];

if (service === undefined) {
  process.stderr.write(`local-ssh: refusing "${remoteCommand}"\n`);
  process.exitCode = 1;
} else {
  const result = spawnSync(resolveRealGit(), [service, bare], {
    env: hermeticGitEnv(),
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}
