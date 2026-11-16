# @gtbuchanan/promptfoo-agent-fake-github

Connects `github-fake` to promptfoo evals.

- `hostFakeGitHub` starts the fake GitHub for an eval run, resets each scenario's data when the scenario is set up, and writes anything the fake couldn't answer to the run log.
- `fakeGitHubEnv`, listed in a suite's `eval.config.ts`, tells the fake `gh` where the real `gh` is.
