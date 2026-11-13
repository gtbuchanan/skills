# @gtbuchanan/github-fake

A fake GitHub API for the eval suites. Instead of faking the `gh` command, the suites run the real `gh` and point it at this server. `gh` does all the work of building requests and printing results, so a suite only has to describe the repository: its pull requests, checks, reviews and so on. That description is called a world.

## Running gh against the fake GitHub API

Start the server with `startFakeGitHub`, giving it a way to look up a world by name and somewhere to send the calls it refuses. Then run `gh` with the environment variables from `fakeGhEnv`, which send its requests to the server and tell the server which world to answer from.

```ts
const fake = await startFakeGitHub({
  onRefusal: (refusal) => refusals.push(refusal),
  worlds: (key) => worlds.get(key),
});
const env = {
  ...startupEnv,
  ...fakeGhEnv({
    caller: { argv, context: runId, world: 'merge-stacked' },
    dir,
    port: fake.port,
  }),
};
```

Don't copy your whole `process.env` into `gh`'s environment. Pass only the few variables it needs to start, such as `PATH`. If you pass everything and one of the fake's variables goes missing, `gh` will quietly use your real GitHub login instead.

## Giving a checkout an origin on the fake GitHub

`gh` works out which repository it is in from the checkout's `origin` URL, so a checkout pushed to a local bare repository is no repository `gh` knows. `gitHubOrigin` fixes that for a checkout you have already seeded and pushed: it names the origin `git@github.localhost:<owner>/<repo>.git`, puts the base branch on the bare repository at the checkout's first commit, and routes every fetch and push to the bare repository without touching the network.

```ts
gitHubOrigin({ base: 'main', slug: 'acme/widgets' })({
  branch,
  origin: bare,
  runner,
});
```

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
1. It passes the real reason, such as which field or route was missing, to your `onRefusal` with the command that caused it. What happens next is up to you: a suite might write it to a log and report it alongside its results.

Each refusal carries the `context` you gave `fakeGhEnv`, so you can tell which run made the call. The fake never reads `context`, and anything that can reach its port can send any value, so check it before you use it to build a file path.

## Refreshing the vendored GitHub schema

The server checks every GraphQL request against GitHub's schema, saved in `schema/github.graphql`. Update it whenever you upgrade `gh`, because newer versions of `gh` ask for fields that older schemas don't have:

```sh
pnpm -C packages/github-fake run schema:refresh
```

Look over the diff before committing it: it shows what GitHub changed. The schema is saved in the repository rather than downloaded during install because GitHub only publishes the current version, so two installs a day apart could get different schemas.
