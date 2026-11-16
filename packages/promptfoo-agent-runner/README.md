# @gtbuchanan/promptfoo-agent-runner

Runs this repository's eval suites, in Docker or as local processes. It builds the stripped-down environment each suite runs in, and finds real tools behind mise's shims.

## Package boundaries

It can't depend on GitHub. Its `turbo.json` holds the rule that enforces this. When a suite's tools need more than the stripped-down environment, as `gh` does, the suite adds it in its eval config.
