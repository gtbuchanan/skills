/*
 * Tests for how a scenario's workspace is filled from its fixture.
 *
 * The agent is pointed at the workspace and nothing else, so the approved
 * action list has to be in it — and has to be the list for that scenario,
 * since the fixtures differ only in their ids and wording.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { seedFromFixtures } from '#src/setup.ts';

test('a scenario\'s workspace gets its own fixture\'s action list', ({ expect }) => {
  const root = mkdtempSync(path.join(tmpdir(), 'apply-setup-'));
  const fixtures = path.join(root, 'fixtures');
  for (const key of ['ack', 'mixed']) {
    mkdirSync(path.join(fixtures, key), { recursive: true });
    writeFileSync(path.join(fixtures, key, 'actions.json'), `[{"from":"${key}"}]`);
  }
  const workspace = path.join(root, 'scenarios', 'mixed');
  mkdirSync(workspace, { recursive: true });

  seedFromFixtures(fixtures)({ key: 'mixed' }, workspace);

  expect(readFileSync(path.join(workspace, 'actions.json'), 'utf8'))
    .toBe('[{"from":"mixed"}]');
});
