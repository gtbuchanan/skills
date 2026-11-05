#!/usr/bin/env node
/*
 * Recording `git` for this read-path eval.
 *
 * This one fakes nothing. setup.ts seeds a real checkout of the PR — history,
 * origin and all — so every answer git gives is already true; the only thing
 * missing is a record of what the skill asked, which plan-check.ts reads to
 * assert the diff was scoped to the baseline commit.
 *
 * Recorded in the log of the run that made the call, beside the fake gh's.
 *
 * Installed as `git` at the front of the eval PATH by the runner, which is why
 * it must resolve the real binary explicitly rather than by name, and under an
 * environment no ambient config reaches.
 */
import { isAgentRuntimeCall } from '@gtbuchanan/eval-agents/registry';
import { hermeticGitEnv } from '@gtbuchanan/git-fixtures/hermetic-git';
import { passThrough } from '@gtbuchanan/stub-runtime/passthrough';
import { requireRealTool } from '@gtbuchanan/stub-runtime/real-tool';
import { argv, logCallToRun } from '@gtbuchanan/stub-runtime/stub';

// The agent runtime's own calls, such as Claude Code's at startup, are not the agent's.
if (!isAgentRuntimeCall('git', argv)) logCallToRun('git');

process.exit(passThrough({ argv, binary: requireRealTool('git'), env: hermeticGitEnv() }));
