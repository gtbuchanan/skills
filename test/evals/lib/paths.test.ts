/*
 * Tests for the eval suites' shared path resolution.
 *
 * `skillsRoot` is the guard that stops a hand-run `promptfoo eval` from
 * overlaying mock skills onto a developer's real install, so the case worth
 * pinning is the refusal: it has to fail rather than fall back to a plausible
 * directory. The rest are pure derivations with no I/O.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
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
} from '#evals/lib/paths.ts';

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
 * A file:// URL for a suite file, valid on POSIX and Windows alike.
 */
const suiteUrl = (suite: string): string =>
  pathToFileURL(path.join(repoRoot, 'evals', suite, 'setup.ts')).href;

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
  const resolved = artifactPath('pr-review-diff.calls.jsonl');

  expect(resolved).toBe(
    path.join(repoRoot, 'artifacts', 'skill-evals', 'pr-review-diff.calls.jsonl'),
  );
  expect(resolved.startsWith(workspace.dir)).toBe(false);
});

test('suiteName derives the skill from the calling file', ({ expect }) => {
  expect(suiteName(suiteUrl('pr-review-apply'))).toBe('pr-review-apply');
});

test('suiteDir resolves to the calling suite directory', ({ expect }) => {
  expect(suiteDir(suiteUrl('pr-review-apply'))).toBe(
    path.join(repoRoot, 'evals', 'pr-review-apply'),
  );
});

test('suiteCallLog keys the log by suite, under the artifact dir', ({ expect }) => {
  expect(suiteCallLog(suiteUrl('pr-review-diff'))).toBe(
    artifactPath('pr-review-diff.calls.jsonl'),
  );
});
