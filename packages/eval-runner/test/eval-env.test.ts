/*
 * Tests for the environment the eval agent runs under, as git reads it.
 *
 * The agent's shell reaches the real git, and Git for Windows ships a system
 * config naming `credential.helper=manager`. Through it, a `git push` to a
 * live remote would authenticate as the developer, though every provider CLI
 * is shadowed and no token is forwarded. So the cases run the real binary
 * under the built environment and ask it what it would use.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { requireRealTool } from '@gtbuchanan/stub-runtime/real-tool';
import spawn from 'cross-spawn';
import { test } from 'vitest';
import { buildEvalEnv } from '#src/scrubbed-path.ts';

const hostileConfig = '[credential]\n\thelper = manager\n';

/**
 * A disposable directory standing in for the clean HOME the runner mints.
 */
const scratchDir = (): Disposable & { readonly dir: string } => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eval-env-test-'));

  return {
    dir,
    [Symbol.dispose]: () => {
      rmSync(dir, { force: true, recursive: true });
    },
  };
};

/**
 * What the real git resolves `credential.helper` to under `env`.
 */
const credentialHelper = (env: Record<string, string>): string => {
  const result = spawn.sync(requireRealTool('git'), ['config', '--get', 'credential.helper'], {
    encoding: 'utf8',
    env,
  });

  return result.stdout.trim();
};

/**
 * The eval env for `homeDir`, with only the real git's directory on PATH.
 */
const evalEnvIn = (homeDir: string): Record<string, string> =>
  buildEvalEnv({
    homeDir,
    scrubbedPath: path.dirname(requireRealTool('git')),
    stubDir: homeDir,
  });

test('no credential helper reaches the agent from a system config', ({ expect }) => {
  /*
   * GIT_CONFIG_SYSTEM stands in for the path git compiles in, so the case runs
   * the same on a host whose own system config is empty.
   */
  using home = scratchDir();
  const system = path.join(home.dir, 'system.gitconfig');

  writeFileSync(system, hostileConfig);

  expect(credentialHelper({ ...evalEnvIn(home.dir), GIT_CONFIG_SYSTEM: system }))
    .toBe('');
});

test('no credential helper reaches the agent from a global config', ({ expect }) => {
  /*
   * HOME is a fresh directory today, so nothing sits there. Pinning it anyway
   * keeps the guarantee from resting on what the runner happens to put in it.
   */
  using home = scratchDir();

  writeFileSync(path.join(home.dir, '.gitconfig'), hostileConfig);

  expect(credentialHelper(evalEnvIn(home.dir))).toBe('');
});
