import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as v from 'valibot';
import { test } from 'vitest';
import { claudeCode } from '@gtbuchanan/eval-agents/claude-code';

const settingsSchema = v.object({ claudeMdExcludes: v.array(v.string()) });

/**
 * A disposable workspace one directory below a parent the test controls.
 */
const nestedWorkspace = (): Disposable & {
  readonly parent: string;
  readonly workspace: string;
} => {
  const minted = mkdtempSync(path.join(tmpdir(), 'claude-code-test-'));
  const parent = realpathSync.native(minted);
  const workspace = path.join(parent, 'ws');

  mkdirSync(workspace);

  return {
    parent,
    workspace,
    [Symbol.dispose]: () => {
      rmSync(parent, { force: true, recursive: true });
    },
  };
};

test('keeps a parent directory\'s CLAUDE.md from the workspace', ({ expect }) => {
  using dirs = nestedWorkspace();
  const files = claudeCode.workspaceFiles(dirs.workspace);

  expect(Object.keys(files)).toStrictEqual(['.claude/settings.json']);

  const { claudeMdExcludes } = v.parse(
    settingsSchema,
    JSON.parse(files['.claude/settings.json'] ?? ''),
  );

  expect(claudeMdExcludes).toContain(`${dirs.parent.replaceAll('\\', '/')}/CLAUDE.md`);
});

test('hands the agent an env on top of the config\'s own', ({ expect }) => {
  const config = { env: { KEPT: 'yes', STUB_RUN: 'old' }, skills: ['a'] };

  expect(claudeCode.withEnv(config, { STUB_RUN: 'new' })).toStrictEqual({
    env: { KEPT: 'yes', STUB_RUN: 'new' },
    skills: ['a'],
  });
});

test('hands the agent an env where the config had none', ({ expect }) => {
  expect(claudeCode.withEnv({ skills: ['a'] }, { STUB_RUN: 'new' })).toStrictEqual({
    env: { STUB_RUN: 'new' },
    skills: ['a'],
  });
});

test('leaves the config it was given alone', ({ expect }) => {
  const config = { env: { KEPT: 'yes' } };

  claudeCode.withEnv(config, { STUB_RUN: 'new' });

  expect(config).toStrictEqual({ env: { KEPT: 'yes' } });
});

/**
 * How Claude Code's runtime calls git at startup: with hooks and fsmonitor
 * turned off, ahead of whatever it asks.
 */
const startupFlags = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor='];

test('claims the git calls its runtime makes at startup', ({ expect }) => {
  expect(claudeCode.isOwnCall('git', [...startupFlags, 'remote', 'get-url', 'origin']))
    .toBe(true);
  expect(claudeCode.isOwnCall('git', ['--exec-path'])).toBe(true);
});

test('leaves the git calls the agent chose to make', ({ expect }) => {
  // A config override is the agent's own business when it is not this one.
  expect(claudeCode.isOwnCall('git', ['status'])).toBe(false);
  expect(claudeCode.isOwnCall('git', ['-c', 'user.name=Taylor', 'commit'])).toBe(false);
});

test('claims nothing another command was called with', ({ expect }) => {
  expect(claudeCode.isOwnCall('gh', [...startupFlags, 'pr', 'view'])).toBe(false);
});

test('runs the agent SDK provider', ({ expect }) => {
  expect(claudeCode.runsProvider('anthropic:claude-agent-sdk')).toBe(true);
});

test('runs the agent SDK provider with a model suffix', ({ expect }) => {
  expect(claudeCode.runsProvider('anthropic:claude-agent-sdk:claude-haiku-4-5')).toBe(true);
});

test('runs no other provider', ({ expect }) => {
  expect(claudeCode.runsProvider('openai:gpt-5')).toBe(false);
});
