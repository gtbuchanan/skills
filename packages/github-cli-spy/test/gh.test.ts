/*
 * Tests for the gh spy, as a suite installs it.
 *
 * It invents nothing: it records the call where a checker reads it, then hands
 * it to the real gh against the fake. What gh prints is gh's, so these check
 * that a call arrives at its workspace's world and leaves a record, and that a
 * call with nowhere to go stops rather than reaching anything real. Where the
 * call goes is src/handoff.ts's, and its own tests cover each refusal.
 *
 * The real gh is `GH_REAL` where the runner or the developer names one, and the
 * first gh on PATH otherwise.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 *
 * @module-tag slow
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type LoggedCall, readCalls, readRefusals } from '@gtbuchanan/cli-doubles/calls';
import { resolveRealTool } from '@gtbuchanan/cli-doubles/real-tool';
import { runLogPath, runVar } from '@gtbuchanan/cli-doubles/run-log';
import { markerFile } from '@gtbuchanan/cli-doubles/scenario';
import { startFakeGitHub } from '@gtbuchanan/github-fake/server';
import type { World } from '@gtbuchanan/github-fake/world';
import { test } from 'vitest';
import { fakePortVar, realGhVar } from '@gtbuchanan/github-cli-spy/handoff';
import { logRefusalToRun } from '@gtbuchanan/github-cli-spy/refusals';

const gh = process.env[realGhVar] ?? resolveRealTool('gh') ?? 'gh';
const spy = fileURLToPath(new URL('../bin/gh.ts', import.meta.url));
const run = 'run-1';

/**
 * How long one call may take before it is killed: far longer than any answer
 * takes, far shorter than gh's own wait on a silent server.
 */
const callTimeoutMs = 10_000;

const worlds: Readonly<Record<string, World>> = {
  'login-missing': { graphql: { viewer: {} } },
  'rate-limiter': { graphql: { viewer: { login: 'taylor' } } },
};

const viewerLogin = ['api', 'graphql', '-f', 'query={viewer{login}}', '--jq', '.data.viewer.login'];

interface SpyRun {
  readonly calls: readonly LoggedCall[];
  readonly refusals: readonly string[];
  readonly status: number | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

interface Call {
  readonly args: readonly string[];
  readonly stdin?: string;
  /**
   * The scenario the call's workspace was seeded as, or none at all.
   */
  readonly world?: string;
}

/**
 * Runs the spy as a suite installs it, inside a run, in a workspace seeded as
 * `world`, against a fake that records its refusals in the run's log.
 *
 * Asynchronous, because the fake answers on this process's event loop: a
 * synchronous spawn would block the very loop gh is waiting on.
 */
const throughSpy = async ({ args, stdin, world }: Call): Promise<SpyRun> => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gh-spy-'));
  const workspace = path.join(dir, 'workspace');
  mkdirSync(workspace);
  if (world !== undefined) writeFileSync(path.join(workspace, markerFile), `${world}\n`);
  const fake = await startFakeGitHub({
    onRefusal: (refusal) => {
      logRefusalToRun(refusal, dir);
    },
    worlds: key => worlds[key],
  });
  try {
    const child = spawn(process.execPath, [spy, ...args], {
      cwd: workspace,
      env: {
        ...process.env,
        [fakePortVar]: String(fake.port),
        [realGhVar]: gh,
        [runVar]: run,
        STUB_LOG_DIR: dir,
      },
      timeout: callTimeoutMs,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
    });
    child.stdin.end(stdin);
    const status = await new Promise<number | null>((resolve) => {
      child.on('close', resolve);
    });
    const log = runLogPath(dir, run);
    const hasLog = existsSync(log);

    return {
      calls: hasLog ? readCalls(log, 'gh') : [],
      refusals: hasLog ? readRefusals(log, 'gh').map(refused => refused.reason) : [],
      status: status ?? undefined,
      stderr,
      stdout,
    };
  } finally {
    await fake.close();
    rmSync(dir, { force: true, recursive: true });
  }
};

test('a call is answered from the world of the workspace it is made in', async ({ expect }) => {
  const reply = await throughSpy({ args: viewerLogin, world: 'rate-limiter' });

  expect(reply.stdout).toBe('taylor\n');
});

test('a call is recorded in its run log', async ({ expect }) => {
  const reply = await throughSpy({ args: viewerLogin, world: 'rate-limiter' });

  expect(reply.calls.map(call => call.command)).toStrictEqual([viewerLogin.join(' ')]);
});

test('a call\'s body on standard input is recorded', async ({ expect }) => {
  // A body never appears in argv, so without this the log cannot tell one from none.
  const query = '{viewer{login}}';
  const reply = await throughSpy({
    args: ['api', 'graphql', '-F', 'query=@-', '--jq', '.data.viewer.login'],
    stdin: query,
    world: 'rate-limiter',
  });

  expect(reply.calls.map(call => call.stdin)).toStrictEqual([query]);
});

test('a call\'s body on standard input reaches gh', async ({ expect }) => {
  const reply = await throughSpy({
    args: ['api', 'graphql', '-F', 'query=@-', '--jq', '.data.viewer.login'],
    stdin: '{viewer{login}}',
    world: 'rate-limiter',
  });

  expect(reply.stdout).toBe('taylor\n');
});

test('what the fake refuses is recorded beside the call', async ({ expect }) => {
  const reply = await throughSpy({ args: viewerLogin, world: 'login-missing' });

  expect(reply.refusals).toStrictEqual(['no model for GraphQL field User.login']);
});

test('a call with nowhere to go fails without reaching gh', async ({ expect }) => {
  const reply = await throughSpy({ args: viewerLogin });

  expect([reply.status, reply.stdout]).toStrictEqual([1, '']);
});
