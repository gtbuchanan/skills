import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as v from 'valibot';
import { test } from 'vitest';
import { claudeCode } from '@gtbuchanan/promptfoo-agent-claude-code/agent';

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

test('runs the agent SDK provider', ({ expect }) => {
  expect(claudeCode.runsProvider('anthropic:claude-agent-sdk')).toBe(true);
});

test('runs the agent SDK provider with a model suffix', ({ expect }) => {
  expect(claudeCode.runsProvider('anthropic:claude-agent-sdk:claude-haiku-4-5')).toBe(true);
});

test('runs no other provider', ({ expect }) => {
  expect(claudeCode.runsProvider('openai:gpt-5')).toBe(false);
});
