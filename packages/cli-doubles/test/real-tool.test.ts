/*
 * Tests for finding the real binary for a tool while a double shadows it.
 *
 * Whatever hands a call on runs what this finds. Finding the double runs the
 * call in a loop through itself; finding a mise shim runs mise, which cannot
 * start under the bare environment a double gives the tool. Either way the
 * call fails before the tool sees it.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import { test } from 'vitest';
import {
  miseShimsDir,
  pathWithout,
  requireRealTool,
  resolveRealTool,
} from '@gtbuchanan/cli-doubles/real-tool';

const windowsLocalAppData = path.win32.join(
  String.raw`C:\Users`,
  faker.internet.username(),
  'AppData',
  'Local',
);

/**
 * A POSIX home directory for someone who does not exist.
 */
const posixHome = (): string => `/home/${faker.internet.username()}`;

/**
 * A POSIX directory somewhere off the home directory.
 */
const posixDir = (): string => `/srv/${faker.system.fileName({ extensionCount: 0 })}`;

/**
 * rwxr-xr-x, so `which` takes a file written here for an executable.
 */
const executableMode = 0o755;

const tool = 'real-tool-probe';

/**
 * A disposable host on disk: directories named in `dirs`, each holding the
 * tool under every name in `names`, or under the name the platform gives an
 * executable when `names` is left out.
 */
const hostOnDisk = (
  dirs: readonly string[],
  names = [process.platform === 'win32' ? `${tool}.exe` : tool],
): Disposable & { readonly dir: (name: string) => string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'real-tool-'));
  for (const dir of dirs) {
    mkdirSync(path.join(root, dir), { recursive: true });
    for (const name of names) {
      writeFileSync(path.join(root, dir, name), '');
      chmodSync(path.join(root, dir, name), executableMode);
    }
  }

  return {
    dir: (name: string) => path.join(root, name),
    [Symbol.dispose]: () => {
      rmSync(root, { force: true, recursive: true });
    },
  };
};

test('puts the shims under MISE_DATA_DIR where it is set', ({ expect }) => {
  const dataDir = posixDir();
  const env = { HOME: posixHome(), MISE_DATA_DIR: dataDir };

  expect(miseShimsDir(env, 'linux')).toBe(`${dataDir}/shims`);
});

test('puts the shims under XDG_DATA_HOME where it is set', ({ expect }) => {
  const dataHome = posixDir();
  const env = { HOME: posixHome(), XDG_DATA_HOME: dataHome };

  expect(miseShimsDir(env, 'linux')).toBe(`${dataHome}/mise/shims`);
});

test('puts the shims under the home directory by default', ({ expect }) => {
  const home = posixHome();

  expect(miseShimsDir({ HOME: home }, 'linux')).toBe(`${home}/.local/share/mise/shims`);
});

test('puts the shims under LOCALAPPDATA on Windows', ({ expect }) => {
  const env = { LOCALAPPDATA: windowsLocalAppData, XDG_DATA_HOME: posixDir() };

  expect(miseShimsDir(env, 'win32')).toBe(String.raw`${windowsLocalAppData}\mise\shims`);
});

test('names no shims directory where nothing locates mise', ({ expect }) => {
  expect(miseShimsDir({}, 'linux')).toBeUndefined();
});

test('drops a directory from PATH', ({ expect }) => {
  expect(pathWithout('/stubs:/usr/bin', ['/stubs'], 'linux')).toBe('/usr/bin');
});

test('drops a Windows directory however PATH cases it', ({ expect }) => {
  /* Windows paths ignore case, and PATH need not spell a directory as
     whoever named it to skip did. */
  const shims = path.win32.join(windowsLocalAppData, 'mise', 'shims');
  const pathValue = [shims.toLowerCase(), String.raw`C:\bin`].join(';');

  expect(pathWithout(pathValue, [shims], 'win32')).toBe(String.raw`C:\bin`);
});

test('keeps a POSIX directory spelled in another case', ({ expect }) => {
  expect(pathWithout('/Stubs:/usr/bin', ['/stubs'], 'linux')).toBe('/Stubs:/usr/bin');
});

test('finds the tool behind the double', ({ expect }) => {
  using host = hostOnDisk(['stubs', 'bin']);
  const env = {
    PATH: [host.dir('stubs'), host.dir('bin')].join(path.delimiter),
    STUB_BINDIR: host.dir('stubs'),
  };

  expect(path.dirname(resolveRealTool(tool, env) ?? '')).toBe(host.dir('bin'));
});

test('finds the tool behind mise shims', ({ expect }) => {
  using host = hostOnDisk([path.join('mise', 'shims'), 'bin']);
  const env = {
    MISE_DATA_DIR: host.dir('mise'),
    PATH: [host.dir(path.join('mise', 'shims')), host.dir('bin')].join(path.delimiter),
  };

  expect(path.dirname(resolveRealTool(tool, env) ?? '')).toBe(host.dir('bin'));
});

test('finds nothing when only the double has the tool', ({ expect }) => {
  using host = hostOnDisk(['stubs']);
  const env = { PATH: host.dir('stubs'), STUB_BINDIR: host.dir('stubs') };

  expect(resolveRealTool(tool, env)).toBeUndefined();
});

test('requires a real tool where the caller has no fallback', ({ expect }) => {
  using host = hostOnDisk(['stubs', 'bin']);
  const env = {
    PATH: [host.dir('stubs'), host.dir('bin')].join(path.delimiter),
    STUB_BINDIR: host.dir('stubs'),
  };

  expect(path.dirname(requireRealTool(tool, env))).toBe(host.dir('bin'));
});

test('stops where only the double has the tool', ({ expect }) => {
  using host = hostOnDisk(['stubs']);
  const env = { PATH: host.dir('stubs'), STUB_BINDIR: host.dir('stubs') };

  expect(() => requireRealTool(tool, env)).toThrow(`no real ${tool}`);
});

test.runIf(process.platform === 'win32')(
  'passes over a script the double cannot spawn on Windows',
  ({ expect }) => {
    // Spawned without a shell, a .cmd is refused and an extensionless file cannot run.
    using scripts = hostOnDisk(['scripts'], [`${tool}.cmd`, tool]);
    using host = hostOnDisk(['bin']);
    const env = { PATH: [scripts.dir('scripts'), host.dir('bin')].join(path.delimiter) };

    expect(path.dirname(resolveRealTool(tool, env) ?? '')).toBe(host.dir('bin'));
  },
);
