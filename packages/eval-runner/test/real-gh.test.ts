/*
 * Tests for how the eval env names the real gh.
 *
 * gh stays shadowed on the eval PATH, so a suite's double is the only gh the
 * agent can call. A double that hands calls on to the real gh — against a
 * fake GitHub, never the real one — needs to know where that gh is without
 * finding it by name, which would find the double. So the runner looks it up
 * on the caller's PATH, before scrubbing, and passes it on as GH_REAL.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { buildEvalEnv } from '#src/scrubbed-path.ts';

/**
 * The file name gh is installed under on this host.
 */
const ghFile = process.platform === 'win32' ? 'gh.exe' : 'gh';

/**
 * A disposable directory standing in for a directory on the caller's PATH.
 */
const scratchDir = (): Disposable & { readonly dir: string } => {
  const dir = mkdtempSync(path.join(tmpdir(), 'real-gh-test-'));

  return {
    dir,
    [Symbol.dispose]: () => {
      rmSync(dir, { force: true, recursive: true });
    },
  };
};

const evalEnvFrom = (sourceEnv: NodeJS.ProcessEnv): Record<string, string> =>
  buildEvalEnv({ homeDir: 'home', scrubbedPath: 'scrubbed', sourceEnv, stubDir: 'stubs' });

test("the gh on the caller's PATH is handed on as GH_REAL", ({ expect }) => {
  using bin = scratchDir();
  writeFileSync(path.join(bin.dir, ghFile), '');

  expect(evalEnvFrom({ PATH: bin.dir })['GH_REAL']).toBe(path.join(bin.dir, ghFile));
});

test('a GH_REAL the caller names outranks the one on its PATH', ({ expect }) => {
  using bin = scratchDir();
  writeFileSync(path.join(bin.dir, ghFile), '');
  const pinned = path.join('opt', 'gh', 'bin', ghFile);

  expect(evalEnvFrom({ GH_REAL: pinned, PATH: bin.dir })['GH_REAL']).toBe(pinned);
});

test('with no gh anywhere, GH_REAL is left unset', ({ expect }) => {
  // Set to nothing, a double would run whatever `gh` resolves to: itself.
  using bin = scratchDir();

  expect(Object.keys(evalEnvFrom({ PATH: bin.dir }))).not.toContain('GH_REAL');
});
