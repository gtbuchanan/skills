/*
 * Tests for hosting the fake for one eval.
 *
 * The doubles find the fake only through the port named here, and answer only
 * from the world the latest seeding built. A port left unnamed fails every gh
 * call in the eval; a world left from an earlier test shows that test's
 * merges as this one's.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { request } from 'node:http';
import { test, vi } from 'vitest';
import { callerToken } from '@gtbuchanan/github-api-fake/caller';
import { fakePortVar } from '@gtbuchanan/github-api-fake/gh-env';
import { hostFakeGitHub } from '@gtbuchanan/github-api-fake/hosting';

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
 * Who the fake on `port` says the viewer is in `world`, as gh would ask.
 */
const viewerLogin = async (port: number, world: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const outgoing = request({
      headers: {
        authorization: `token ${callerToken({ argv: ['api', 'graphql'], world })}`,
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
    outgoing.end(JSON.stringify({ query: '{viewer{login}}' }));
  });

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

test('answers from the world a scenario was seeded with', async ({ expect }) => {
  await using eval_ = await started();
  eval_.seed(scenario, 'first');

  await expect(viewerLogin(eval_.port, scenario.key))
    .resolves.toStrictEqual({ data: { viewer: { login: 'merge-clean/first' } } });
});

test('answers from the latest seeding of a scenario', async ({ expect }) => {
  await using eval_ = await started();
  eval_.seed(scenario, 'first');
  eval_.seed(scenario, 'second');

  await expect(viewerLogin(eval_.port, scenario.key))
    .resolves.toStrictEqual({ data: { viewer: { login: 'merge-clean/second' } } });
});

test('runs the suite seeder before building the world', ({ expect }) => {
  const seeded: string[] = [];
  const hosting = hostFakeGitHub({ env: {}, world: viewerNamedFor });

  hosting.seeding((seededScenario, workspace) => {
    seeded.push(`${seededScenario.key}/${workspace}`);
  })(scenario, 'first');

  expect(seeded).toStrictEqual(['merge-clean/first']);
});

test('runs the suite hook for every hook promptfoo fires', async ({ expect }) => {
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

test('names the port in this process environment by default', async ({ expect }) => {
  // What the agent, and so every double, inherits from promptfoo.
  vi.stubEnv(fakePortVar, '');
  const hook = hostFakeGitHub({ world: viewerNamedFor }).hooked(nothing);
  await hook('beforeAll', {});
  const port = Number(process.env[fakePortVar]);
  await hook('afterAll', {});

  expect(port).toBeGreaterThan(0);
});

test('stops the fake once the eval is over', async ({ expect }) => {
  const eval_ = await started();
  await eval_.hook('afterAll', {});

  await expect(viewerLogin(eval_.port, scenario.key)).rejects.toThrow('ECONNREFUSED');
});
