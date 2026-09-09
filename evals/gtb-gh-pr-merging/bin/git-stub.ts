#!/usr/bin/env node
/*
 * Recording `git` for this eval.
 *
 * Fakes nothing. setup.ts seeds a real checkout against a local bare origin, so
 * every answer git gives — including `push` — is already true; what is missing
 * is a record of what the skill asked. merging-check.ts judges this skill
 * almost entirely on that record: which calls a merge was preceded by, and in
 * what order — so the branch delete and the `gh pr merge` have to land in the
 * same log to be compared at all.
 *
 * Installed as `git` at the front of the eval PATH by the runner, which is why
 * it resolves the real binary explicitly rather than by name, and under an
 * environment no ambient config reaches.
 */
import { hermeticGitEnv, resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { passThrough } from '@gtbuchanan/stub-runtime/passthrough';
import { argv, logCallToScenario } from '@gtbuchanan/stub-runtime/stub';
import { scenarios } from '#src/scenarios.ts';

logCallToScenario('git', scenarios);

process.exit(passThrough({ argv, binary: resolveRealGit(), env: hermeticGitEnv() }));
