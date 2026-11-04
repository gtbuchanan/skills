# @gtbuchanan/github-api-fake

A fake GitHub API for the eval suites. Instead of faking the `gh` command, the suites run the real `gh` and point it at this server. `gh` does all the work of building requests and printing results, so a suite only has to describe the repository: its pull requests, checks, reviews and so on. That description is called a world.

## Hosting the fake GitHub API for an eval suite

A suite's setup wraps its seeder and extension hook with `hostFakeGitHub`. The fake then starts before the eval and stops after it, its port is named in `GITHUB_FAKE_PORT` for every gh call the agent makes, and each scenario's world is rebuilt whenever its workspace is seeded:

```ts
const github = hostFakeGitHub<Scenario>({
  world: (scenario, workspace) => worldFor(scenario),
});
const setup = scenarioSetup({
  metaUrl: import.meta.url,
  scenarios,
  seed: github.seeding(seeding.seed),
});

export const extensionHook = github.hooked(setup.extensionHook);
```

`gh` also needs a checkout it recognises as a GitHub repository. Pass `remote` to `repoScenarioSeeding` to get one.

## Running gh against the fake GitHub API

Start the server with `startFakeGitHub`, giving it a way to look up a world by name. Then run `gh` with the environment variables from `fakeGhEnv`, which send its requests to the server and tell the server which world to answer from.

```ts
const fake = await startFakeGitHub({ worlds: (key) => worlds.get(key) });
const env = {
  ...startupEnv,
  ...fakeGhEnv({
    caller: { argv, run, world: 'merge-stacked' },
    dir,
    port: fake.port,
  }),
};
```

Don't copy your whole `process.env` into `gh`'s environment. Pass only the few variables it needs to start, such as `PATH`. If you pass everything and one of the fake's variables goes missing, `gh` will quietly use your real GitHub login instead.

## Writing a world for the fake GitHub API

A world holds data, not output. Its `graphql` object mirrors GitHub's GraphQL schema:

- A property is the field's value. A function is called with the field's arguments and returns the value.
- Set a field to `undefined` when GitHub would return `null` for it.
- Leave a field out entirely when the world doesn't support it. The server rejects any request that asks for it.
- When an object could be one of several types, such as a reviewer that's either a user or a team, give it a `__typename`.

`rest` handles REST requests. Return `undefined` for any route the world doesn't support.

Don't try to model everything up front. Add a field when a test run reports that something asked for it.

## Sending GitHub's own errors from a world

Sometimes the right answer is an error, such as asking for a pull request that doesn't exist. Throw a `GitHubError` and `gh` receives it exactly as GitHub would send it. Include GitHub's `type` when it has one, because `gh` sometimes acts on it:

```ts
throw new GitHubError('Could not resolve to an Issue with the number of 7.', {
  type: 'NOT_FOUND',
});
```

If a world throws anything else, the server treats it as a bug in the world.

## How the fake GitHub API refuses a call

When the server can't answer a request, it does two things:

1. It sends `gh` the same vague error GitHub sends when something breaks on its end. The agent being tested never sees anything suggesting GitHub is fake.
1. It writes the real reason, such as which field or route was missing, to the test run's log next to the command that caused it. A suite reports these alongside its results, the same way it reports what its other stand-ins couldn't handle.

The server can only write to the log when the command ran as part of a test run, and only into the directory named by `STUB_LOG_DIR`.

## Refreshing the vendored GitHub schema

The server checks every GraphQL request against GitHub's schema, saved in `schema/github.graphql`. Update it whenever you upgrade `gh`, because newer versions of `gh` ask for fields that older schemas don't have:

```sh
pnpm -C packages/github-api-fake run schema:refresh
```

Look over the diff before committing it: it shows what GitHub changed. The schema is saved in the repository rather than downloaded during install because GitHub only publishes the current version, so two installs a day apart could get different schemas.
