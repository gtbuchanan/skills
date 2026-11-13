/*
 * Tests for where the runner looks for mise's shims.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import path from 'node:path';
import { faker } from '@faker-js/faker';
import { test } from 'vitest';
import { miseShimsDir } from '#src/mise-shims.ts';

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
