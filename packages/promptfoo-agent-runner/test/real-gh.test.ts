/*
 * Tests for how the eval environment names the real gh.
 *
 * gh stays shadowed on the scrubbed PATH, so an agent's `gh` always reaches a
 * double. A double that hands calls on to the real gh, against a fake GitHub,
 * finds it through GH_REAL instead.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { buildEvalEnv } from '#src/eval-env.ts';

/**
 * rwxr-xr-x, so the stand-in gh is found as an executable.
 */
const executableMode = 0o755;

/**
 * A disposable directory holding a stand-in gh, named as the platform names
 * an executable.
 */
const ghDir = (): Disposable & { readonly dir: string; readonly gh: string } => {
  const dir = mkdtempSync(path.join(tmpdir(), 'real-gh-test-'));
  const gh = path.join(dir, process.platform === 'win32' ? 'gh.exe' : 'gh');
  writeFileSync(gh, '');
  chmodSync(gh, executableMode);

  return {
    dir,
    gh,
    [Symbol.dispose]: () => {
      rmSync(dir, { force: true, recursive: true });
    },
  };
};

const envFrom = (sourceEnv: NodeJS.ProcessEnv): Record<string, string> =>
  buildEvalEnv({ agents: [], homeDir: tmpdir(), scrubbedPath: '', sourceEnv, stubDir: tmpdir() });

test('names the first gh on the caller PATH as the real gh', ({ expect }) => {
  using found = ghDir();

  expect(envFrom({ PATH: found.dir })['GH_REAL']).toBe(found.gh);
});

test('names the gh behind the mise shims on the caller PATH', ({ expect }) => {
  /* A shim is mise itself, and mise cannot start under the bare environment a
     double gives gh against the fake. */
  using mise = ghDir();
  using found = ghDir();
  const shims = path.join(mise.dir, 'shims');
  mkdirSync(shims);
  renameSync(mise.gh, path.join(shims, path.basename(mise.gh)));
  const sourceEnv = { MISE_DATA_DIR: mise.dir, PATH: [shims, found.dir].join(path.delimiter) };

  expect(envFrom(sourceEnv)['GH_REAL']).toBe(found.gh);
});

test('passes on the real gh the caller names', ({ expect }) => {
  // How a host whose PATH gh is not the pinned one names the pinned one.
  using found = ghDir();
  const pinned = path.join(tmpdir(), 'pinned', 'gh');

  expect(envFrom({ GH_REAL: pinned, PATH: found.dir })['GH_REAL']).toBe(pinned);
});

test('keeps the real gh away from the caller login', ({ expect }) => {
  /*
   * An agent can run GH_REAL itself, past the double. On Windows gh finds the
   * developer's login under APPDATA, which the eval env passes on, so a clean
   * HOME alone would leave it acting as the developer against the real GitHub.
   */
  const home = path.join(tmpdir(), 'eval-home');
  const env = buildEvalEnv({
    agents: [],
    homeDir: home,
    scrubbedPath: '',
    sourceEnv: { GH_CONFIG_DIR: path.join(tmpdir(), 'developer', 'gh') },
    stubDir: tmpdir(),
  });

  expect(env['GH_CONFIG_DIR']).toBe(path.join(home, '.config', 'gh'));
});

test('names no real gh where the caller has none', ({ expect }) => {
  using empty = ghDir();
  rmSync(empty.gh);

  expect(envFrom({ PATH: empty.dir })).not.toHaveProperty('GH_REAL');
});
