/*
 * Tests for the parts of building a scenario that every suite shares.
 *
 * Each of them is quiet when wrong. A workspace not emptied first leaves a
 * previous test's work where the agent will find it and treat it as the
 * scenario. A marker written before the seeder runs is a file the seeder may
 * commit, putting test scaffolding into the diff under review. And a hook that
 * shrugs at a context naming no scenario builds nothing at all, so every later
 * failure is about a workspace that was never written.
 *
 * The seeder here writes plain files and never touches git, which is the point:
 * nothing in this module should need a repository.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { markerFile, scenarioPath } from '@gtbuchanan/stub-runtime/scenario';
import { test } from 'vitest';
import { fakeSuite } from './fake-suite.ts';
import { scenarioSetup } from '@gtbuchanan/agent-skills-harness/scenario-setup';

interface Fixture {
  readonly key: string;
  readonly wrote: string;
}

const scenarios: readonly Fixture[] = [
  { key: 'open-draft', wrote: 'first' },
  { key: 'merge-stacked', wrote: 'second' },
];

/**
 * Where a scenario's workspace lands under a throwaway EVAL_WORKSPACE.
 */
const workspaceOf = (root: string, key: string): string =>
  path.join(root, ...scenarioPath(key).split('/'));

/**
 * A seeder for the cases that are about the hook rather than about the world,
 * writing something rather than nothing so the workspace is distinguishable
 * from one that was never built.
 */
const writeMarkerless = (scenario: Fixture, workspace: string): void => {
  writeFileSync(path.join(workspace, 'seeded.txt'), scenario.wrote);
};

/**
 * Runs `body` with EVAL_WORKSPACE pointed at a fresh root, restoring it after —
 * the variable is process-wide, so a failing case would otherwise leak into the
 * next one.
 */
const withWorkspace = <TResult>(body: (root: string) => TResult): TResult => {
  const root = mkdtempSync(path.join(tmpdir(), 'eval-workspace-'));
  const previous = process.env['EVAL_WORKSPACE'];
  process.env['EVAL_WORKSPACE'] = root;
  try {
    return body(root);
  } finally {
    if (previous === undefined) delete process.env['EVAL_WORKSPACE'];
    else process.env['EVAL_WORKSPACE'] = previous;
  }
};

const beforeEachFor = (scenario: string): unknown => ({
  test: { vars: { scenario } },
});

test('the seeder is handed the workspace, and the marker names the scenario', ({
  expect,
}) => {
  withWorkspace((root) => {
    const seen: string[] = [];
    const setup = scenarioSetup<Fixture>({
      metaUrl: fakeSuite().metaUrl,
      scenarios,
      seed: (scenario, workspace) => {
        seen.push(workspace);
        writeMarkerless(scenario, workspace);
      },
    });

    setup.extensionHook('beforeEach', beforeEachFor('merge-stacked'));

    const workspace = workspaceOf(root, 'merge-stacked');

    expect(seen).toStrictEqual([workspace]);
    expect(readFileSync(path.join(workspace, 'seeded.txt'), 'utf8')).toBe('second');
    expect(readFileSync(path.join(workspace, markerFile), 'utf8').trim()).toBe(
      'merge-stacked',
    );
  });
});

test('the marker is written after the seeder, never before it', ({ expect }) => {
  /*
   * A seeder that creates a repository excludes the marker so it never reaches
   * a commit. It can only do that if the file does not exist while it runs —
   * write the marker first and the exclusion is a race the seeder loses.
   */
  withWorkspace((root) => {
    let isMarkerPresent = true;
    const setup = scenarioSetup<Fixture>({
      metaUrl: fakeSuite().metaUrl,
      scenarios,
      seed: (_scenario, workspace) => {
        isMarkerPresent = existsSync(path.join(workspace, markerFile));
      },
    });

    setup.extensionHook('beforeEach', beforeEachFor('open-draft'));

    const marker = path.join(workspaceOf(root, 'open-draft'), markerFile);

    expect(isMarkerPresent).toBe(false);
    expect(existsSync(marker)).toBe(true);
  });
});

test('a previous run left in the workspace is removed, not built over', ({ expect }) => {
  /*
   * A scenario owns its directory outright. A leftover file is
   * indistinguishable from work the agent was meant to find, so it would be
   * read as part of the world rather than as debris.
   */
  withWorkspace((root) => {
    const workspace = workspaceOf(root, 'open-draft');
    mkdirSync(workspace, { recursive: true });
    writeFileSync(path.join(workspace, 'leftover.txt'), 'from a previous run');

    const setup = scenarioSetup<Fixture>({
      metaUrl: fakeSuite().metaUrl,
      scenarios,
      seed: writeMarkerless,
    });

    setup.extensionHook('beforeEach', beforeEachFor('open-draft'));

    expect(existsSync(path.join(workspace, 'leftover.txt'))).toBe(false);
    expect(existsSync(path.join(workspace, 'seeded.txt'))).toBe(true);
  });
});

test('a context naming no scenario builds nothing rather than guessing', ({ expect }) => {
  withWorkspace((root) => {
    const setup = scenarioSetup<Fixture>({
      metaUrl: fakeSuite().metaUrl,
      scenarios,
      seed: writeMarkerless,
    });

    let isRefused = false;
    try {
      setup.extensionHook('beforeEach', { test: { vars: {} } });
    } catch {
      isRefused = true;
    }

    expect(isRefused).toBe(true);
    expect(existsSync(workspaceOf(root, 'open-draft'))).toBe(false);
  });
});

test('a hook this owns nothing in leaves the workspace alone', ({ expect }) => {
  /*
   * promptfoo fires more hooks than the ones this reads, and building on one
   * of them would rebuild a world mid-test.
   */
  withWorkspace((root) => {
    let isSeeded = false;
    const setup = scenarioSetup<Fixture>({
      metaUrl: fakeSuite().metaUrl,
      scenarios,
      seed: () => {
        isSeeded = true;
      },
    });

    setup.extensionHook('afterEach', beforeEachFor('open-draft'));

    expect(isSeeded).toBe(false);
    expect(existsSync(workspaceOf(root, 'open-draft'))).toBe(false);
  });
});
