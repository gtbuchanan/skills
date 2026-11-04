#!/usr/bin/env node
/* v8 ignore file -- git runs this as its ssh, in a process coverage does not
   see; the tests drive it through real fetches and pushes. */
/*
 * `core.sshCommand` for a checkout whose origin is named on GitHub.
 *
 * git hands the would-be ssh connection here, and the git service it asked for
 * runs against the bare repository named as the first argument instead, so
 * nothing dials out. Anything else git might ask an ssh for is refused.
 *
 * The real git, resolved past any double, so the transport's own calls are not
 * recorded as the agent's.
 */
import { spawnSync } from 'node:child_process';
import { localSshCall } from '../src/github-origin.ts';
import { hermeticGitEnv, resolveRealGit } from '../src/real-git.ts';

/**
 * `process.argv` leads with the node binary and this script.
 */
const cliArgsIndex = 2;

const args = process.argv.slice(cliArgsIndex);
const call = localSshCall(args);

if (call === undefined) {
  process.stderr.write(`local-ssh: refusing ${JSON.stringify(args.at(-1) ?? '')}\n`);
  process.exitCode = 1;
} else {
  const result = spawnSync(resolveRealGit(), [call.service, call.bare], {
    env: hermeticGitEnv(),
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}
