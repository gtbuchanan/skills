/*
 * The run provider a suite names to run Claude Code:
 * `package:@gtbuchanan/promptfoo-agent-claude-code:RunProvider`. The agent
 * itself is the `./agent` export, which loads without promptfoo.
 */
import { runProviderFor } from '@gtbuchanan/promptfoo-agent/run-provider';
import { claudeCode } from './agent.ts';

export const RunProvider = runProviderFor(claudeCode);
