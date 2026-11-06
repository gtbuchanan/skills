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
import { passThrough } from '@gtbuchanan/cli-doubles/passthrough';
import { requireRealTool } from '@gtbuchanan/cli-doubles/real-tool';
import { argv, logCallToRun } from '@gtbuchanan/cli-doubles/stub';
import { claudeCode } from '@gtbuchanan/eval-agents/claude-code';
import { hermeticGitEnv } from '@gtbuchanan/git-fixtures/hermetic-git';
import { isAgentRuntimeCall } from '@gtbuchanan/promptfoo-agent/agents';

// The agent runtime's own calls, such as Claude Code's at startup, are not the agent's.
if (!isAgentRuntimeCall([claudeCode], 'git', argv)) logCallToRun('git');

process.exit(passThrough({ argv, binary: requireRealTool('git'), env: hermeticGitEnv() }));
