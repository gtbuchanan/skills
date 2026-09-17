/*
 * promptfoo javascript assertion over this suite's call log.
 *
 * The matching is `@gtbuchanan/agent-skills-harness/call-expectations`: each
 * test states which `curl` calls must appear and which must not, and the shared
 * engine judges them. Nothing is added, because every expectation here is about
 * the request that was made rather than about a world the run left behind — the
 * double mutates nothing.
 *
 * `import.meta.url` comes from here rather than from the harness, which is what
 * names this suite's run directory; passing the harness's would read a log that
 * does not exist, and the failure would read as a pile of missing calls.
 */
import { callExpectationAssertion } from '@gtbuchanan/agent-skills-harness/call-expectations';

export default callExpectationAssertion({ metaUrl: import.meta.url });
