/*
 * Tests for the environment a suite contributes through its eval config.
 *
 * A contributor runs in the runner, before the environment is scrubbed, so
 * what it is handed is the boundary: it sees the source variables it names
 * and nothing else, and it cannot replace what the runner sets.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { EnvContributor } from '@gtbuchanan/promptfoo-agent/suite-config';
import { test } from 'vitest';
import { buildEvalEnv } from '#src/eval-env.ts';

/**
 * rwxr-xr-x, so a stand-in tool is found as an executable.
 */
const executableMode = 0o755;

/**
 * A disposable directory holding a stand-in `tool`, named as the platform
 * names an executable.
 */
const toolDir = (tool: string): Disposable & { readonly dir: string; readonly file: string } => {
  const dir = mkdtempSync(path.join(tmpdir(), 'suite-env-test-'));
  const file = path.join(dir, process.platform === 'win32' ? `${tool}.exe` : tool);
  writeFileSync(file, '');
  chmodSync(file, executableMode);

  return {
    dir,
    file,
    [Symbol.dispose]: () => {
      rmSync(dir, { force: true, recursive: true });
    },
  };
};

const homeDir = path.join(tmpdir(), 'suite-env-home');

const envWith = (
  contributors: readonly EnvContributor[],
  sourceEnv: NodeJS.ProcessEnv = {},
): Record<string, string> =>
  buildEvalEnv({
    agents: [],
    contributors,
    homeDir,
    scrubbedPath: '',
    sourceEnv,
    stubDir: tmpdir(),
  });

test('a contributor\'s variables reach the suite\'s env', ({ expect }) => {
  const contributor: EnvContributor = { env: () => ({ FAKE_HOST: 'localhost' }), reads: [] };

  expect(envWith([contributor])['FAKE_HOST']).toBe('localhost');
});

test('a contributor sees only the source variables it declares', ({ expect }) => {
  // The source is the developer's own environment, credentials and all.
  const seen: string[] = [];
  const contributor: EnvContributor = {
    env: ({ source }) => {
      seen.push(...Object.keys(source));
      return {};
    },
    reads: ['FAKE_PIN'],
  };
  envWith([contributor], { FAKE_PIN: '2.103.3', GITHUB_TOKEN: 'ghp_not_for_you' });

  expect(seen).toStrictEqual(['FAKE_PIN']);
});

test('a contributor is handed the suite\'s clean HOME', ({ expect }) => {
  const contributor: EnvContributor = {
    env: context => ({ FAKE_CONFIG: path.join(context.homeDir, '.config') }),
    reads: [],
  };

  expect(envWith([contributor])['FAKE_CONFIG']).toBe(path.join(homeDir, '.config'));
});

test('a contributor finds a real tool behind the mise shims on the caller PATH', ({ expect }) => {
  /* A shim is mise itself, and mise cannot start under the bare environment a
     double gives the tool. */
  using mise = toolDir('probe-tool');
  using found = toolDir('probe-tool');
  const shims = path.join(mise.dir, 'shims');
  mkdirSync(shims);
  writeFileSync(path.join(shims, path.basename(mise.file)), '');
  chmodSync(path.join(shims, path.basename(mise.file)), executableMode);
  const contributor: EnvContributor = {
    env: ({ realTool }) => ({ PROBE_REAL: realTool('probe-tool') ?? '' }),
    reads: [],
  };
  const sourceEnv = { MISE_DATA_DIR: mise.dir, PATH: [shims, found.dir].join(path.delimiter) };

  expect(envWith([contributor], sourceEnv)['PROBE_REAL']).toBe(found.file);
});

test('a contributor may not set a variable the runner sets', ({ expect }) => {
  // HOME and PATH are the isolation; a suite's dependency does not get to move them.
  const contributor: EnvContributor = { env: () => ({ PATH: '/usr/bin' }), reads: [] };

  expect(() => envWith([contributor])).toThrow('PATH');
});

test('the runner names no real gh of its own', ({ expect }) => {
  // gh's variables are the GitHub packages' to contribute, for the suites that use them.
  using gh = toolDir('gh');

  expect(envWith([], { PATH: gh.dir })).not.toHaveProperty('GH_REAL');
});
