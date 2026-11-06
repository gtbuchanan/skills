import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as v from 'valibot';
import { test } from 'vitest';
import { claudeCode } from '@gtbuchanan/eval-agents/claude-code';
import RunProvider from '@gtbuchanan/eval-agents/run-provider';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest: unknown = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const { name } = v.parse(v.object({ name: v.string() }), manifest);

test('runs Claude Code', ({ expect }) => {
  expect(new RunProvider({ config: {} }).id()).toBe('run:claude-code');
});

test('is the module Claude Code\'s run provider id names', ({ expect }) => {
  const module = fileURLToPath(import.meta.resolve('@gtbuchanan/eval-agents/run-provider'));
  const subpath = path.relative(root, module).split(path.sep).join('/');

  expect(claudeCode.runProviderId).toBe(`file://node_modules/${name}/${subpath}`);
});
