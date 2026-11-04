/*
 * Tests for finding the real gh past mise's shims.
 *
 * A mise shim runs mise, and mise refuses to start under the bare environment
 * gh is given against the fake: with no HOME and its state directory moved, it
 * cannot find which config files were trusted. It fails before gh runs, and
 * prints nothing gh would, so the shim has to be skipped rather than run.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import { test } from 'vitest';
import {
  findGhOutsideShims,
  miseShimsDir,
  resolveRealGh,
} from '@gtbuchanan/github-api-fake/real-gh';

const shimsDir = `/home/${faker.internet.username()}/.local/share/mise/shims`;
const realDir = '/usr/bin';
const otherDir = '/opt/bin';
const windowsHome = path.win32.join(String.raw`C:\Users`, faker.internet.username());
const windowsLocalAppData = path.win32.join(windowsHome, 'AppData', 'Local');
const windowsScripts = String.raw`C:\scripts`;
const windowsBin = String.raw`C:\bin`;

/**
 * A POSIX home directory for someone who does not exist.
 */
const posixHome = (): string => `/home/${faker.internet.username()}`;

/**
 * A POSIX directory somewhere off the home directory.
 */
const posixDir = (): string => `/srv/${faker.system.fileName({ extensionCount: 0 })}`;

/**
 * A host where only `files` are files.
 */
const hostWith = (...files: string[]) =>
  (candidate: string): boolean => files.includes(candidate);

/**
 * A disposable host on disk: mise's data directory, with a gh among its shims,
 * and a directory holding the real gh, named as the platform names one.
 */
const hostOnDisk = (): Disposable & {
  readonly dataDir: string;
  readonly realDir: string;
  readonly realGh: string;
  readonly shimsDir: string;
} => {
  const root = mkdtempSync(path.join(tmpdir(), 'real-gh-test-'));
  const name = process.platform === 'win32' ? 'gh.exe' : 'gh';
  const dataDir = path.join(root, 'mise');
  const shims = path.join(dataDir, 'shims');
  const real = path.join(root, 'bin');
  mkdirSync(shims, { recursive: true });
  mkdirSync(real);
  writeFileSync(path.join(shims, name), '');
  writeFileSync(path.join(real, name), '');

  return {
    dataDir,
    realDir: real,
    realGh: path.join(real, name),
    shimsDir: shims,
    [Symbol.dispose]: () => {
      rmSync(root, { force: true, recursive: true });
    },
  };
};

test('reaches past the mise shim that shadows gh on PATH', ({ expect }) => {
  expect(
    findGhOutsideShims({
      isFile: hostWith(`${shimsDir}/gh`, `${realDir}/gh`),
      platform: 'linux',
      pathValue: `${shimsDir}:${realDir}`,
      shimsDir,
    }),
  ).toBe(`${realDir}/gh`);
});

test('takes the first gh on PATH outside the shims', ({ expect }) => {
  expect(
    findGhOutsideShims({
      isFile: hostWith(`${realDir}/gh`, `${otherDir}/gh`),
      platform: 'linux',
      pathValue: `${realDir}:${otherDir}`,
      shimsDir,
    }),
  ).toBe(`${realDir}/gh`);
});

test('finds nothing when only a shim has a gh to offer', ({ expect }) => {
  expect(
    findGhOutsideShims({
      isFile: hostWith(`${shimsDir}/gh`),
      platform: 'linux',
      pathValue: shimsDir,
      shimsDir,
    }),
  ).toBeUndefined();
});

test('passes over a gh Node cannot spawn on Windows', ({ expect }) => {
  /* spawn without a shell refuses a .cmd and cannot run a file without an
     extension, so only gh.exe will do. */
  const scripts = ['gh.cmd', 'gh'].map(name => path.win32.join(windowsScripts, name));
  const realGh = path.win32.join(windowsBin, 'gh.exe');

  expect(
    findGhOutsideShims({
      isFile: hostWith(...scripts, realGh),
      pathValue: [windowsScripts, windowsBin].join(';'),
      platform: 'win32',
    }),
  ).toBe(realGh);
});

test('reaches past the mise shims on Windows however PATH cases them', ({ expect }) => {
  const shims = path.win32.join(windowsLocalAppData, 'mise', 'shims');
  const pathShims = shims.toLowerCase();
  const shimGh = path.win32.join(pathShims, 'gh.exe');
  const realGh = path.win32.join(windowsBin, 'gh.exe');

  expect(
    findGhOutsideShims({
      isFile: hostWith(shimGh, realGh),
      pathValue: [pathShims, windowsBin].join(';'),
      platform: 'win32',
      shimsDir: shims,
    }),
  ).toBe(realGh);
});

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

test('resolves the gh behind the mise shims on the PATH it is given', ({ expect }) => {
  using host = hostOnDisk();
  const env = {
    MISE_DATA_DIR: host.dataDir,
    PATH: [host.shimsDir, host.realDir].join(path.delimiter),
  };

  expect(resolveRealGh(env)).toBe(host.realGh);
});

test('passes over a directory named as gh on the PATH it is given', ({ expect }) => {
  using host = hostOnDisk();
  const decoy = path.join(host.dataDir, 'decoy');
  mkdirSync(path.join(decoy, path.basename(host.realGh)), { recursive: true });
  const env = { PATH: [decoy, host.realDir].join(path.delimiter) };

  expect(resolveRealGh(env)).toBe(host.realGh);
});

test('resolves to the gh GH_REAL names', ({ expect }) => {
  // How a host whose PATH gh is not the pinned one names the pinned one.
  using host = hostOnDisk();
  const pinned = path.join(tmpdir(), 'pinned', 'gh');
  const env = { GH_REAL: pinned, MISE_DATA_DIR: host.dataDir, PATH: host.realDir };

  expect(resolveRealGh(env)).toBe(pinned);
});
