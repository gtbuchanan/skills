/*
 * promptfoo javascript assertion for this suite.
 *
 * The matching is `@gtbuchanan/agent-skills-harness/call-expectations`: each
 * test states its rule as vars — which calls must appear, which must not,
 * which must precede which, what body was piped in — and the shared engine
 * reads this scenario's call log and judges them.
 *
 * No `outcomeChecks` here. Every rule this skill has shows up in what was
 * called and what was piped to it: the flags a merge carried, whether the
 * dependent was looked for before the branch went, whether the squash body
 * carried the credit. What the repository looks like afterwards is the
 * double's business rather than the skill's.
 *
 * The engine derives the call log from the module that calls it, so passing
 * `import.meta.url` from the harness instead of from here would name the
 * harness and read a log that does not exist — which a checker reports as a
 * pile of missing calls rather than as a missing log.
 */
import { callExpectationAssertion } from '@gtbuchanan/agent-skills-harness/call-expectations';

export default callExpectationAssertion({ metaUrl: import.meta.url });
