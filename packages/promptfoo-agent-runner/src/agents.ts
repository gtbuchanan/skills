/*
 * The agents this runner drives.
 */
import type { EvalAgent } from '@gtbuchanan/promptfoo-agent/eval-agent';
import { claudeCode } from '@gtbuchanan/promptfoo-agent-claude-code/claude-code';

export const evalAgents: readonly EvalAgent[] = [claudeCode];
