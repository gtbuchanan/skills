/*
 * promptfoo javascript assertion for this suite.
 *
 * The matching itself is `@gtbuchanan/agent-skills-harness/expectations`: each
 * test states its rule as vars — which calls must appear, which must not, which
 * must precede which, what body was piped in — and the shared engine reads this
 * scenario's call log and judges them.
 *
 * The commit count is added rather than built in, because it is the one
 * expectation here that needs a repository and the engine deliberately knows
 * nothing about one.
 *
 * What has to be supplied is where this suite's own artifacts are. The engine
 * derives the call log from the module that calls it, so passing
 * `import.meta.url` from the harness instead of from here would name the
 * harness and read a log that does not exist — which a checker reports as a
 * pile of missing calls rather than as a missing log.
 */
import { commitCountCheck } from '@gtbuchanan/agent-skills-harness/commit-count';
import { expectationAssertion } from '@gtbuchanan/agent-skills-harness/expectations';
import { baselinesPath } from './setup.ts';

export default expectationAssertion({
  checks: [commitCountCheck({ baselinesPath })],
  metaUrl: import.meta.url,
});
