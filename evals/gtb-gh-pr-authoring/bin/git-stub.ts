#!/usr/bin/env node
/*
 * Recording `git` for the gtb-gh-pr-authoring eval.
 *
 * Fakes nothing. setup.ts seeds a real checkout against a local bare origin, so
 * every answer git gives — including `push` — is already true; what is missing
 * is a record of what the skill asked. authoring-check.ts needs that for one
 * rule in particular: fixes are pushed before review threads are answered, and
 * ordering can only be checked when the push and the reply land in the same log.
 *
 * Installed as `git` at the front of the eval PATH by the runner, which is why
 * it resolves the real binary explicitly rather than by name.
 */
import spawn from 'cross-spawn';
import { hermeticGitEnv, resolveRealGit } from '#lib/real-git.ts';
import { argv, logCall } from '#lib/stub.ts';

logCall('git');

/* Hermetic for the agent's calls too, not just the seed's: a system config
 * naming a credential helper would otherwise let a `git push` authenticate as
 * the developer, reaching the live service the shadowed `gh` denies it. */
const result = spawn.sync(resolveRealGit(), argv, {
  env: hermeticGitEnv(),
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
