import type { EvalAgent } from '@gtbuchanan/promptfoo-agent/eval-agent';

/**
 * An agent named `name` whose provider takes env under `injected`, so a test
 * sees exactly what reached it. It runs the providers starting `<name>:`.
 */
export const fakeAgent = (name: string): EvalAgent => ({
  agentCallMarker: `${name.toUpperCase()}_SESSION`,
  auth: { apiKeyVar: 'FAKE_KEY', credentialsFile: '.fake/login.json', envVars: [] },
  displayName: `Fake ${name}`,
  executable: { command: name, envVar: 'FAKE_EXE', sdkPackage: 'fake-sdk' },
  gitBashVar: 'FAKE_BASH',
  name,
  providerId: `${name}:provider`,
  runProviderId: `file://${name}/run-provider.ts`,
  runsProvider: id => id.startsWith(`${name}:`),
  withEnv: (config, env) => ({ ...config, injected: env }),
  workspaceFiles: () => ({}),
});
