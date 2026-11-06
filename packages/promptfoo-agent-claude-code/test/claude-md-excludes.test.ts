/*
 * Tests for the excludes that keep instruction files above an eval workspace
 * from the agent.
 *
 * Claude Code collects CLAUDE.md files from every directory above its working
 * directory, as project memory. The native runner mints workspaces in the
 * temp dir, which on Windows sits inside the user profile, so the walk reaches
 * the developer's own `~/.claude/CLAUDE.md` however clean HOME is.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import {
  ancestorInstructionExcludes,
  workspaceInstructionExcludes,
} from '@gtbuchanan/promptfoo-agent-claude-code/claude-md-excludes';

/**
 * A disposable workspace reached through a link, so the path a caller holds
 * is not the one the filesystem resolves it to. A junction needs no
 * privilege on Windows; elsewhere the type is ignored.
 */
const linkedWorkspace = (): Disposable & { readonly linked: string; readonly real: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'claude-md-excludes-test-'));
  const realParent = path.join(root, 'real');
  const linkParent = path.join(root, 'link');

  mkdirSync(path.join(realParent, 'ws'), { recursive: true });
  symlinkSync(realParent, linkParent, 'junction');

  return {
    linked: path.join(linkParent, 'ws'),
    real: realpathSync.native(realParent),
    [Symbol.dispose]: () => {
      rmSync(root, { force: true, recursive: true });
    },
  };
};

test('excludes the instruction files of every directory above the workspace', ({ expect }) => {
  expect(ancestorInstructionExcludes('/home/dev/tmp/ws')).toStrictEqual([
    '/home/dev/tmp/CLAUDE.md',
    '/home/dev/tmp/CLAUDE.local.md',
    '/home/dev/tmp/.claude/**',
    '/home/dev/CLAUDE.md',
    '/home/dev/CLAUDE.local.md',
    '/home/dev/.claude/**',
    '/home/CLAUDE.md',
    '/home/CLAUDE.local.md',
    '/home/.claude/**',
    '/CLAUDE.md',
    '/CLAUDE.local.md',
    '/.claude/**',
  ]);
});

test('spells a Windows workspace with forward slashes, up to the drive root', ({ expect }) => {
  /*
   * The patterns are globs, where a backslash escapes the next character, so a
   * Windows path has to reach them with its separators turned around.
   */
  expect(ancestorInstructionExcludes(String.raw`C:\Users\dev\ws`)).toStrictEqual([
    'C:/Users/dev/CLAUDE.md',
    'C:/Users/dev/CLAUDE.local.md',
    'C:/Users/dev/.claude/**',
    'C:/Users/CLAUDE.md',
    'C:/Users/CLAUDE.local.md',
    'C:/Users/.claude/**',
    'C:/CLAUDE.md',
    'C:/CLAUDE.local.md',
    'C:/.claude/**',
  ]);
});

test('matches a directory whose name holds glob syntax literally', ({ expect }) => {
  /*
   * A Windows username may carry parentheses and braces, and the profile is
   * one of the directories above the workspace. Left as they are, they parse
   * as a group or an expansion and the pattern stops matching the very file
   * it is there to exclude.
   */
  expect(ancestorInstructionExcludes('/Users/Jane (Dev) {x} [1]*?/ws').slice(0, 3))
    .toStrictEqual([
      '/Users/Jane [(]Dev[)] [{]x[}] [[]1][*][?]/CLAUDE.md',
      '/Users/Jane [(]Dev[)] [{]x[}] [[]1][*][?]/CLAUDE.local.md',
      '/Users/Jane [(]Dev[)] [{]x[}] [[]1][*][?]/.claude/**',
    ]);
});

test('builds the excludes from the path the workspace resolves to', ({ expect }) => {
  /*
   * The temp dir may be spelled short (`C:\Users\RUNNER~1\…`), linked, or in
   * another case than the one the agent works under, and the patterns are
   * compared as text. The resolved spelling is the one they must name.
   */
  using workspace = linkedWorkspace();

  expect(workspaceInstructionExcludes(workspace.linked)[0])
    .toBe(`${workspace.real.replaceAll('\\', '/')}/CLAUDE.md`);
});

test('leaves the workspace\'s own instruction files alone', ({ expect }) => {
  /*
   * A scenario may ship a CLAUDE.md as part of the world it describes; only
   * what sits above the workspace is the developer's.
   */
  const excludes = ancestorInstructionExcludes('/tmp/ws');

  expect(excludes.filter(pattern => pattern.startsWith('/tmp/ws/'))).toStrictEqual([]);
});
