/*
 * Tests for the eval suites' shared path resolution.
 *
 * `skillsRoot` is the guard that stops a hand-run `promptfoo eval` from
 * overlaying mock skills onto a developer's real install, so the case worth
 * pinning is the refusal: it has to fail rather than fall back to a plausible
 * directory.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, vi } from 'vitest';
import {
  artifactPath,
  repoRoot,
  skillsRoot,
  suiteCallLog,
  suiteDir,
  suiteName,
} from '@gtbuchanan/agent-skills-harness/paths';

const workspaceVar = 'EVAL_WORKSPACE';

/**
 * Disposable that sets EVAL_WORKSPACE to `dir`, restoring it on dispose.
 */
const stubWorkspace = (dir: string): Disposable & { readonly dir: string } => {
  vi.stubEnv(workspaceVar, dir);
  return {
    dir,
    [Symbol.dispose]: () => {
      vi.unstubAllEnvs();
    },
  };
};

/**
 * Disposable that removes EVAL_WORKSPACE, restoring it on dispose.
 */
const stubNoWorkspace = (): Disposable => {
  vi.stubEnv(workspaceVar, undefined);
  return {
    [Symbol.dispose]: () => {
      vi.unstubAllEnvs();
    },
  };
};

/**
 * A test running with no EVAL_WORKSPACE at all. The fixture is `auto` because
 * its whole purpose is the absence — there is no value for a test to name.
 */
const testWithoutWorkspace = test.extend<{ noWorkspace: Disposable }>({
  noWorkspace: [
    async ({}, use) => {
      using stub = stubNoWorkspace();

      await use(stub);
    },
    { auto: true },
  ],
});

/**
 * A test running inside a workspace, which it receives rather than repeats —
 * so an assertion can compare against the same value the environment holds.
 */
const testInWorkspace = test.extend<{ workspace: { readonly dir: string } }>({
  workspace: async ({}, use) => {
    using stub = stubWorkspace(path.join(path.sep, 'tmp', 'eval-workspace'));

    await use(stub);
  },
});

/**
 * These helpers derive paths from a suite name. A stand-in keeps the cases
 * from being rewritten every time a real skill is renamed.
 */
const suite = 'gtb-example-suite';

/**
 * A throwaway suite on disk: a directory marked by the config file the runners
 * key discovery on, holding a `src/` below it and a sibling that no suite
 * covers.
 *
 * Real files rather than a synthetic path, because resolving a suite is a walk
 * up the filesystem now — the marker has to be there to be found.
 */
const suiteTree = (): { nested: string; root: string; stray: string } => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'paths-test-'));
  const root = path.join(scratch, 'evals', suite);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'promptfooconfig.yaml'), 'description: sample\n');
  const stray = path.join(scratch, 'elsewhere');
  mkdirSync(stray, { recursive: true });

  return { nested: path.join(root, 'src'), root, stray };
};

/**
 * A file:// URL for a file in `dir`, valid on POSIX and Windows alike.
 */
const fileUrlIn = (dir: string): string =>
  pathToFileURL(path.join(dir, 'setup.ts')).href;

testWithoutWorkspace('skillsRoot refuses to guess when unset', ({ expect }) => {
  expect(() => skillsRoot()).toThrow(/EVAL_WORKSPACE is unset/v);
});

testWithoutWorkspace('skillsRoot points at the fix in its message', ({ expect }) => {
  expect(() => skillsRoot()).toThrow(/run it through the runner/iv);
});

testInWorkspace('skillsRoot returns the workspace verbatim', ({ expect, workspace }) => {
  expect(skillsRoot()).toBe(workspace.dir);
});

testInWorkspace('skillsRoot is independent of the repo it runs from', ({ expect, workspace }) => {
  /*
   * The behaviour this replaced resolved the skill tree by walking up from
   * this file, so a workspace that is not the repo root is the case to pin.
   */
  expect(skillsRoot()).not.toBe(repoRoot);
  expect(repoRoot.startsWith(workspace.dir)).toBe(false);
});

testInWorkspace('artifactPath stays anchored to the repo', ({ expect, workspace }) => {
  const resolved = artifactPath(`${suite}.calls.jsonl`);

  expect(resolved).toBe(
    path.join(repoRoot, 'artifacts', 'skill-evals', `${suite}.calls.jsonl`),
  );
  expect(resolved.startsWith(workspace.dir)).toBe(false);
});

test('suiteDir resolves a file beside the config to its own directory', ({ expect }) => {
  const { root } = suiteTree();

  expect(suiteDir(fileUrlIn(root))).toBe(root);
});

test('suiteDir resolves a file below the config up to the suite', ({ expect }) => {
  const { nested, root } = suiteTree();

  expect(suiteDir(fileUrlIn(nested))).toBe(root);
});

test('suiteDir refuses a file no suite config covers', ({ expect }) => {
  const { stray } = suiteTree();

  expect(() => suiteDir(fileUrlIn(stray))).toThrow(/promptfooconfig\.yaml/v);
});

test('suiteName derives the skill from the suite, not the file beside it', ({ expect }) => {
  const { nested } = suiteTree();

  expect(suiteName(fileUrlIn(nested))).toBe(suite);
});

test('suiteCallLog keys the log by suite, under the artifact dir', ({ expect }) => {
  const { nested } = suiteTree();

  expect(suiteCallLog(fileUrlIn(nested))).toBe(artifactPath(`${suite}.calls.jsonl`));
});
