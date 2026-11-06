/*
 * Claude Code's run provider, the one a suite names to run Claude Code (see
 * run-provider in promptfoo-agent).
 */
import { runProviderFor } from '@gtbuchanan/promptfoo-agent/run-provider';
import { claudeCode } from './claude-code.ts';

export default runProviderFor(claudeCode);
