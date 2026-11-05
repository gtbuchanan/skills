/*
 * Tests for how a checker finds the log of the run it is checking.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import path from 'node:path';
import { test } from 'vitest';
import { fakeSuite } from './fake-suite.ts';
import { suiteRunDir } from '@gtbuchanan/promptfoo-agent/paths';
import { runLog } from '@gtbuchanan/promptfoo-agent/run-log';

test('names the log of the run the response came from', ({ expect }) => {
  const { metaUrl } = fakeSuite();

  expect(runLog(metaUrl, { runId: 'run-1', sessionId: 's' }))
    .toBe(path.join(suiteRunDir(metaUrl), 'run-1.jsonl'));
});

test('refuses a response no run provider answered', ({ expect }) => {
  /* A checker reading some shared log instead would pass on calls another
     test made. */
  const { metaUrl } = fakeSuite();

  expect(() => runLog(metaUrl, { sessionId: 's' }))
    .toThrow('no run id in the response metadata');
});
