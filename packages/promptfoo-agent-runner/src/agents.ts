/*
 * The agents this runner drives.
 */
import { claudeCode } from '@gtbuchanan/eval-agents/claude-code';
import type { EvalAgent } from '@gtbuchanan/promptfoo-agent/eval-agent';

export const evalAgents: readonly EvalAgent[] = [claudeCode];
