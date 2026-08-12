#!/usr/bin/env node
/*
 * Regenerates the per-agent skill copies from the cross-agent source of truth
 * (the root skills/ dir). `skills add` copies each skill into .claude/skills/
 * (and the .agents/skills/ canonical dir); on Windows it copies rather than
 * symlinks, so this must be re-run after editing a skill to keep the copies
 * fresh. Those copies are what the claude-agent-sdk provider discovers when the
 * eval suites run.
 *
 *   pnpm skills:sync
 *
 * Spawned via cross-spawn with no shell so the `*` skill selector reaches the
 * skills CLI verbatim — a shell would glob-expand it against the cwd or (on
 * Windows, through a pnpm script) pass the quotes along literally.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const res = spawn.sync(
  'pnpm',
  ['exec', 'skills', 'add', '.', '-a', 'claude-code', '-s', '*', '-y'],
  { cwd: root, stdio: 'inherit' },
);

process.exit(res.status ?? 1);
