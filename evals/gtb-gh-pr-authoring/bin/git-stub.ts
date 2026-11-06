#!/usr/bin/env node
/*
 * Recording `git` for this eval.
 *
 * Fakes nothing. setup.ts seeds a real checkout against a local bare origin, so
 * every answer git gives — including `push` — is already true; what is missing
 * is a record of what the skill asked. authoring-check.ts needs that for one
 * rule in particular: fixes are pushed before review threads are answered, and
 * ordering can only be checked when the push and the reply land in the same log.
 *
 * Installed as `git` at the front of the eval PATH by the runner, which is why
 * it resolves the real binary explicitly rather than by name, and under an
 * environment no ambient config reaches.
 */
import { passThrough } from '@gtbuchanan/cli-doubles/passthrough';
import { requireRealTool } from '@gtbuchanan/cli-doubles/real-tool';
import { argv, logCallToRun } from '@gtbuchanan/cli-doubles/stub';
import { evalAgents, isAgentRuntimeCall } from '@gtbuchanan/eval-agents/registry';
import { hermeticGitEnv } from '@gtbuchanan/git-fixtures/hermetic-git';

// The agent runtime's own calls, such as Claude Code's at startup, are not the agent's.
if (!isAgentRuntimeCall(evalAgents, 'git', argv)) logCallToRun('git');

process.exit(passThrough({ argv, binary: requireRealTool('git'), env: hermeticGitEnv() }));
