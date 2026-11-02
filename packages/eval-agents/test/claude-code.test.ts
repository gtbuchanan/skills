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
