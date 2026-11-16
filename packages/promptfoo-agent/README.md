# @gtbuchanan/promptfoo-agent

Runs coding agents under promptfoo. It holds the promptfoo provider and the list of agents, the hooks that set up each test scenario, assertions about what an agent ran, skill installation, and the `eval.config.ts` format a suite uses to add environment variables.

## Package boundaries

It can't depend on a particular agent, such as Claude Code, or on GitHub. Its `turbo.json` holds the rule that enforces this. Each agent registers itself from its own package, and a fake service plugs in through a suite's hooks and eval config.
