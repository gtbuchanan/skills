import { workspaceInstructionExcludes } from './claude-md-excludes.ts';
import type { EvalAgent } from './eval-agent.ts';

export const claudeCode: EvalAgent = {
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
  runsProvider: providerId => providerId.startsWith('anthropic:claude-agent-sdk'),
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
