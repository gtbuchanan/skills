/*
 * Tests for hosting the fake GitHub for one eval.
 *
 * The spies find the fake only through the port named here, and answer only
 * from the world the latest seeding built. A port left unnamed fails every gh
 * call in the eval; a world left from an earlier test shows that test's
 * merges as this one's.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readRefusals } from '@gtbuchanan/cli-doubles/calls';
import { runLogPath } from '@gtbuchanan/cli-doubles/run-log';
import { fakePortVar } from '@gtbuchanan/github-cli-spy/handoff';
import { type Caller, callerToken } from '@gtbuchanan/github-fake/caller';
import { test, vi } from 'vitest';
import { hostFakeGitHub } from '@gtbuchanan/promptfoo-agent-fake-github/hosting';

const scenario = { key: 'merge-clean' };

/**
 * A world whose viewer is named after the scenario and workspace it was built
 * for, so an answer says which seeding built it.
 */
const viewerNamedFor = (seeded: { readonly key: string }, workspace: string) => ({
  graphql: { viewer: { login: `${seeded.key}/${workspace}` } },
});

/**
 * A suite's own seeder or hook, where it has nothing of its own to do.
 */
const nothing = (): void => {
  // Only the hosting's own work is under test.
};

/**
 * What the fake on `port` answers `query` with, asked as gh would by `caller`.
 */
const graphql = async (port: number, caller: Caller, query: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const outgoing = request({
      headers: {
        authorization: `token ${callerToken(caller)}`,
        host: 'api.github.localhost',
      },
      host: '127.0.0.1',
      method: 'POST',
      path: 'https://api.github.localhost/graphql',
      port,
    }, (response) => {
      let received = '';
      response.on('data', (chunk: Buffer) => {
        received += String(chunk);
      });
      response.on('end', () => {
        resolve(JSON.parse(received));
      });
    });
    outgoing.on('error', reject);
    outgoing.end(JSON.stringify({ query }));
  });

const viewerLogin = async (port: number, world: string): Promise<unknown> =>
  graphql(port, { argv: ['api', 'graphql'], world }, '{viewer{login}}');

/**
 * A hosting started as promptfoo starts an eval, with the port it names.
 */
const started = async () => {
  const env: NodeJS.ProcessEnv = {};
  const hosting = hostFakeGitHub({ env, world: viewerNamedFor });
  const hook = hosting.hooked(nothing);
  await hook('beforeAll', {});

  return {
    hook,
    port: Number(env[fakePortVar]),
    seed: hosting.seeding(nothing),
    [Symbol.asyncDispose]: async () => {
      await hook('afterAll', {});
    },
  };
};

test('a scenario is answered from the world it was seeded with', async ({ expect }) => {
  await using eval_ = await started();
  eval_.seed(scenario, 'first');

  await expect(viewerLogin(eval_.port, scenario.key))
    .resolves.toStrictEqual({ data: { viewer: { login: 'merge-clean/first' } } });
});

test('a scenario is answered from its latest seeding', async ({ expect }) => {
  await using eval_ = await started();
  eval_.seed(scenario, 'first');
  eval_.seed(scenario, 'second');

  await expect(viewerLogin(eval_.port, scenario.key))
    .resolves.toStrictEqual({ data: { viewer: { login: 'merge-clean/second' } } });
});

test('the suite\'s seeder runs before the world is built', ({ expect }) => {
  const seeded: string[] = [];
  const hosting = hostFakeGitHub({ env: {}, world: viewerNamedFor });

  hosting.seeding((seededScenario, workspace) => {
    seeded.push(`${seededScenario.key}/${workspace}`);
  })(scenario, 'first');

  expect(seeded).toStrictEqual(['merge-clean/first']);
});

test('the suite\'s hook runs for every hook promptfoo fires', async ({ expect }) => {
  const fired: string[] = [];
  const hosting = hostFakeGitHub({ env: {}, world: viewerNamedFor });
  const hook = hosting.hooked((hookName) => {
    fired.push(hookName);
  });

  await hook('beforeAll', {});
  await hook('beforeEach', {});
  await hook('afterAll', {});

  expect(fired).toStrictEqual(['beforeAll', 'beforeEach', 'afterAll']);
});

test('the port is named in this process\'s environment by default', async ({ expect }) => {
  // What the agent, and so every spy, inherits from promptfoo.
  vi.stubEnv(fakePortVar, '');
  const hook = hostFakeGitHub({ world: viewerNamedFor }).hooked(nothing);
  await hook('beforeAll', {});
  const port = Number(process.env[fakePortVar]);
  await hook('afterAll', {});

  expect(port).toBeGreaterThan(0);
});

test('what the fake refuses lands in the caller\'s run log', async ({ expect }) => {
  const logDir = mkdtempSync(path.join(tmpdir(), 'hosting-test-'));
  vi.stubEnv('STUB_LOG_DIR', logDir);
  await using eval_ = await started();
  eval_.seed(scenario, 'first');
  const caller = { argv: ['api', 'graphql'], context: 'run-1', world: scenario.key };

  await graphql(eval_.port, caller, '{viewer{name}}');
  const refusals = readRefusals(runLogPath(logDir, 'run-1'), 'gh').map(refused => refused.reason);
  rmSync(logDir, { force: true, recursive: true });

  expect(refusals).toStrictEqual(['no model for GraphQL field User.name']);
});

test('the fake stops once the eval is over', async ({ expect }) => {
  const eval_ = await started();
  await eval_.hook('afterAll', {});

  await expect(viewerLogin(eval_.port, scenario.key)).rejects.toThrow('ECONNREFUSED');
});
