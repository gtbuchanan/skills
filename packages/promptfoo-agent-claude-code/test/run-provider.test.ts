import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApiProvider } from 'promptfoo';
import * as v from 'valibot';
import { test } from 'vitest';
import { RunProvider } from '@gtbuchanan/promptfoo-agent-claude-code';
import { claudeCode } from '@gtbuchanan/promptfoo-agent-claude-code/agent';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest: unknown = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const { name } = v.parse(v.object({ name: v.string() }), manifest);

test('runs Claude Code', ({ expect }) => {
  expect(new RunProvider({ config: {} }).id()).toBe('run:claude-code');
});

test('is named by package, as a consumer installing it would name it', ({ expect }) => {
  expect(claudeCode.runProviderId).toBe(`package:${name}:RunProvider`);
});

test('loads through promptfoo by its run provider id', async ({ expect }) => {
  const provider = await loadApiProvider(claudeCode.runProviderId, {
    basePath: root,
    options: { config: {} },
  });

  expect(provider.id()).toBe('run:claude-code');
});
