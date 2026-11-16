# @gtbuchanan/cli-doubles

Shared code for the fake command-line tools that evals put on `PATH`. A fake tool uses it to record each call, read the calls back, find which test scenario it's running in, and hand a call to the real tool when it doesn't fake it. CONTRIBUTING describes each module.

## Package boundaries

Any fake tool can use this package, for any CLI and under any test harness, so it can't depend on agents, GitHub, mise or promptfoo. Its `turbo.json` holds the rule that enforces this. When a caller wants to skip some directories while looking for a real tool, such as mise's shims, the caller passes them in.
