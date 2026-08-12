/*
 * Tests for the `claude` the agent SDK is told to spawn.
 *
 * The override exists for Termux, where the SDK ships no native binary — but
 * the risk it guards against is everywhere else: substituting whatever `claude`
 * sits on the developer's PATH would quietly change the version under test from
 * host to host. So the cases worth pinning are the ones that keep the SDK's own
 * binary, which this host can exercise directly.
 *
 * The probe is injected rather than mocked, so both branches are reachable on
 * any host; a separate test asserts the real probe agrees with this one.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import {
  claudeExecutable,
  findOnPath,
  hasSdkNativeClaude,
} from '#scripts/scrubbed-path.ts';

const hasSdkBinary = (): boolean => true;
const hasNoSdkBinary = (): boolean => false;

/**
 * A disposable directory holding a stand-in `claude`, so the PATH fallback has
 * something real to find. Extensionless: the Windows extension list includes
 * the empty string, so it resolves on either platform.
 */
const dirWithClaude = (): Disposable & { readonly dir: string; readonly bin: string } => {
  const dir = mkdtempSync(path.join(tmpdir(), 'claude-exe-test-'));
  const bin = path.join(dir, 'claude');

  writeFileSync(bin, '');

  return {
    bin,
    dir,
    [Symbol.dispose]: () => {
      rmSync(dir, { force: true, recursive: true });
    },
  };
};

test('ignores a PATH claude where the SDK ships its own', ({ expect }) => {
  /*
   * The regression this guards: a `claude` on the developer's PATH must not
   * displace the binary the SDK pins, or the version under test drifts by host.
   * Empty is falsy, so the provider falls back to its own — and it is still
   * *set*, because promptfoo only substitutes `{{ env.X }}` for a variable that
   * exists; unset would reach the SDK as a literal `{{ … }}` path.
   */
  using onPath = dirWithClaude();

  expect(claudeExecutable({ PATH: onPath.dir }, hasSdkBinary)).toBe('');
});

test('takes the PATH claude where the SDK ships none', ({ expect }) => {
  // The Termux case: without this the suites error before reaching the model.
  using onPath = dirWithClaude();

  expect(claudeExecutable({ PATH: onPath.dir }, hasNoSdkBinary)).toBe(onPath.bin);
});

test('reports empty where the SDK ships none and PATH has no claude', ({ expect }) => {
  expect(claudeExecutable({ PATH: path.join(path.sep, 'nowhere') }, hasNoSdkBinary))
    .toBe('');
});

test('an explicit override outranks the probe', ({ expect }) => {
  // The escape hatch for a host the probe reads wrong, in either direction.
  const env = { CLAUDE_CODE_EXECUTABLE: '/opt/claude', PATH: '/usr/bin' };

  expect(claudeExecutable(env, hasSdkBinary)).toBe('/opt/claude');
  expect(claudeExecutable(env, hasNoSdkBinary)).toBe('/opt/claude');
});

/*
 * The `<platform>-<arch>` hosts the SDK publishes a native build for, read off
 * its optionalDependencies. Stated here rather than derived from the probe, so
 * a probe that stopped resolving still fails this. The probe also accepts the
 * `-musl` variants, which these pairs cover.
 */
const sdkNativeHosts = new Set([
  'darwin-arm64', 'darwin-x64',
  'linux-arm64', 'linux-x64',
  'win32-arm64', 'win32-x64',
]);

test('the probe agrees with whether the SDK ships a binary for this host', ({ expect }) => {
  /*
   * Ties the injected branches above to reality. Asserting against the
   * published list rather than a bare `true` pins both directions from wherever
   * it runs: a probe that stopped resolving the platform package would report
   * false on a host that has one, and silently swap in whatever `claude` the
   * developer has installed — while on a host the SDK does not build for
   * (Termux is android-arm64) the fallback is what must hold.
   */
  const host = `${process.platform}-${process.arch}`;

  expect(hasSdkNativeClaude()).toBe(sdkNativeHosts.has(host));
});

test('the probe reports no binary when the SDK cannot be resolved at all', ({ expect }) => {
  /* Resolution runs from a caller-supplied origin, so an unrelated one has no
   * SDK above it and must not be mistaken for a host without a native build. */
  expect(hasSdkNativeClaude(path.join(path.sep, 'nowhere', 'index.js'))).toBe(false);
});

test('findOnPath resolves a command on the given PATH', ({ expect }) => {
  using onPath = dirWithClaude();

  expect(findOnPath('claude', onPath.dir)).toBe(onPath.bin);
});

test('findOnPath returns undefined when the command is absent', ({ expect }) => {
  expect(findOnPath('claude', path.join(path.sep, 'nowhere'))).toBeUndefined();
  expect(findOnPath('claude', '')).toBeUndefined();
});
