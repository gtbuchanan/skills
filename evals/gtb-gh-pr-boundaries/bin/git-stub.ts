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
 * it resolves the real binary explicitly rather than by name, and under an
 * environment no ambient config reaches.
 */
import { hermeticGitEnv, resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { passThrough } from '@gtbuchanan/stub-runtime/passthrough';
import { argv, logCallToScenario } from '@gtbuchanan/stub-runtime/stub';
import { scenarios } from '#src/scenarios.ts';

logCallToScenario('git', scenarios);

process.exit(passThrough({ argv, binary: resolveRealGit(), env: hermeticGitEnv() }));
