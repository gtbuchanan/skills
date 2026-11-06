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
  /*
   * At startup the runtime asks git about the repository with hooks turned
   * off, and asks where git keeps its helpers. Neither is the agent's.
   */
  isOwnCall: (cmd, argv) =>
    cmd === 'git' &&
    ((argv[0] === '-c' && argv[1] === 'core.hooksPath=/dev/null') ||
      (argv.length === 1 && argv[0] === '--exec-path')),
  name: 'claude-code',
  providerId,
  runProviderId: 'file://node_modules/@gtbuchanan/eval-agents/src/run-provider.ts',
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
