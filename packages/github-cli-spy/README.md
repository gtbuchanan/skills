# @gtbuchanan/github-cli-spy

A fake `gh` for evals that use `github-fake`. It writes each call to the run log, then runs the real `gh` pointed at the fake GitHub, so the agent sees real `gh` output.

To use it in a suite, add a `bin/gh-stub.ts` containing:

```ts
import '@gtbuchanan/github-cli-spy/gh';
```

It needs two environment variables: `GH_REAL`, the path to the real `gh`, and `GITHUB_FAKE_PORT`, the port the fake GitHub listens on. `promptfoo-agent-fake-github` sets both.

## Package boundaries

It can't depend on agents or promptfoo. Its `turbo.json` holds the rule that enforces this. Starting the fake GitHub and finding the real `gh` are the job of whatever runs the evals.
