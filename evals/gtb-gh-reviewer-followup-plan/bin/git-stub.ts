#!/usr/bin/env node
/*
 * Recording `git` for this read-path eval.
 *
 * This one fakes nothing. setup.ts seeds a real checkout of the PR — history,
 * origin and all — so every answer git gives is already true; the only thing
 * missing is a record of what the skill asked, which plan-check.ts reads to
 * assert the diff was scoped to the baseline commit.
 *
 * One log for the suite rather than one per world: this suite is serial and
 * single-scenario, and truncates that log between tests.
 *
 * Installed as `git` at the front of the eval PATH by the runner, which is why
 * it must resolve the real binary explicitly rather than by name, and under an
 * environment no ambient config reaches.
 */
import { hermeticGitEnv, resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { passThrough } from '@gtbuchanan/stub-runtime/passthrough';
import { argv, logCall } from '@gtbuchanan/stub-runtime/stub';

logCall('git');

process.exit(passThrough({ argv, binary: resolveRealGit(), env: hermeticGitEnv() }));
