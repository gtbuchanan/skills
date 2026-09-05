#!/usr/bin/env node
/*
 * Recording `git` for this eval.
 *
 * Fakes nothing. setup.ts seeds a real checkout against a local bare origin, so
 * every answer git gives — including `push` — is already true. What is missing
 * is a record of what the skill asked, and this suite needs one: how many
 * branches the work was cut onto is half of what it measures, and a branch the
 * agent created is only visible in the log.
 *
 * Installed as `git` at the front of the eval PATH by the runner, which is why
 * it resolves the real binary explicitly rather than by name.
 */
import { hermeticGitEnv, resolveRealGit } from '@gtbuchanan/agent-skills-harness/real-git';
import { argv, logCallToDir } from '@gtbuchanan/agent-skills-harness/stub';
import spawn from 'cross-spawn';
import { locateScenario } from '#src/world.ts';

/* One log per scenario, keyed by the checkout the call was made in, so tests
   can run concurrently without writing over each other's record.

   Defensively, because this stub is a passthrough first and a recorder second:
   `git --version` from outside every checkout is a legitimate call, and
   locateScenario throws there. A call nothing can attribute is not worth
   failing over — it is logged nowhere and passed through as normal. */
try {
  logCallToDir('git', `${locateScenario(process.cwd()).scenario.key}.jsonl`);
} catch {
  // outside a seeded checkout: nothing to attribute the call to
}

/* Hermetic for the agent's calls too, not just the seed's: a system config
 * naming a credential helper would otherwise let a `git push` authenticate as
 * the developer, reaching the live service the shadowed `gh` denies it. */
const result = spawn.sync(resolveRealGit(), argv, {
  env: hermeticGitEnv(),
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
