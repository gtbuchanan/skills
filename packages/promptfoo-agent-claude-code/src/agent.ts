import type { EvalAgent } from '@gtbuchanan/promptfoo-agent/eval-agent';
import { workspaceInstructionExcludes } from './claude-md-excludes.ts';

const providerId = 'anthropic:claude-agent-sdk';

/**
 * The env a provider config already passes, which the SDK merges over the
 * agent's own.
 */
const envOf = (config: Readonly<Record<string, unknown>>): object => {
  const { env } = config;
  return typeof env === 'object' && env !== null ? env : {};
};

export const claudeCode: EvalAgent = {
  /*
   * Set on every command a tool runs for the agent, and on none of the
   * runtime's own git calls nor the Bash tool's shell setup. CLAUDECODE marks
   * the shell instead, so it is also on the git call that setup makes on
   * Windows. Undocumented; agent-call-marker.test.ts runs the real runtime to
   * catch an upgrade that moves it.
   */
  agentCallMarker: 'CLAUDE_CODE_SESSION_ID',
  auth: {
    apiKeyVar: 'ANTHROPIC_API_KEY',
    credentialsFile: '.claude/.credentials.json',
    envVars: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
  },
  displayName: 'Claude Code',
  executable: {
    command: 'claude',
    envVar: 'CLAUDE_CODE_EXECUTABLE',
    sdkPackage: '@anthropic-ai/claude-agent-sdk',
  },
  gitBashVar: 'CLAUDE_CODE_GIT_BASH_PATH',
  name: 'claude-code',
  providerId,
  runProviderId: 'package:@gtbuchanan/promptfoo-agent-claude-code:RunProvider',
  runsProvider: id => id.startsWith(providerId),
  withEnv: (config, env) => ({ ...config, env: { ...envOf(config), ...env } }),
  /*
   * The workspace sits in the temp dir, inside the user profile on Windows,
   * and the agent would otherwise load the developer's own CLAUDE.md from a
   * directory above it.
   */
  workspaceFiles: workspace => ({
    '.claude/settings.json':
      `${JSON.stringify({ claudeMdExcludes: workspaceInstructionExcludes(workspace) })}\n`,
  }),
};
