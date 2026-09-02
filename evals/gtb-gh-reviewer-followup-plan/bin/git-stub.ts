#!/usr/bin/env node
/*
 * Recording `git` for the gtb-gh-reviewer-followup-plan read-path eval.
 *
 * This one fakes nothing. setup.ts seeds a real checkout of the PR — history,
 * origin and all — so every answer git gives is already true; the only thing
 * missing is a record of what the skill asked, which plan-check.ts reads to
 * assert the diff was scoped to the baseline commit. So: log the argv, hand
 * the call to the real git, and pass its streams and exit code straight back.
 *
 * Installed as `git` at the front of the eval PATH by the runner, which is why
 * it must resolve the real binary explicitly rather than by name.
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
