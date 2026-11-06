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
import { passThrough } from '@gtbuchanan/cli-doubles/passthrough';
import { requireRealTool } from '@gtbuchanan/cli-doubles/real-tool';
import { argv, logCallToRun } from '@gtbuchanan/cli-doubles/stub';
import { claudeCode } from '@gtbuchanan/eval-agents/claude-code';
import { hermeticGitEnv } from '@gtbuchanan/git-fixtures/hermetic-git';
import { isAgentRuntimeCall } from '@gtbuchanan/promptfoo-agent/agents';

// The agent runtime's own calls, such as Claude Code's at startup, are not the agent's.
if (!isAgentRuntimeCall([claudeCode], 'git', argv)) logCallToRun('git');

process.exit(passThrough({ argv, binary: requireRealTool('git'), env: hermeticGitEnv() }));
