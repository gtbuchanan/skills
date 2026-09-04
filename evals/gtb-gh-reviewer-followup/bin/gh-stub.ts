#!/usr/bin/env node
/*
 * Fake `gh` for this eval. The dependent skills are mocked, so
 * the only real GitHub calls are the ones the orchestrator makes itself — the
 * happy-path `pr review --approve` and `pr merge --squash`. This logs every
 * invocation (argv) to $STUB_LOG so followup-check.ts can assert the merge gate
 * fired (or held) correctly.
 *
 * Anything else is refused rather than answered. This used to end in an empty
 * `{}` with exit 0, which does not read as "I don't know" — it reads as "there
 * is nothing here", and an agent acts on it while every assertion about what it
 * *did* call still passes. A gap in the double has to look like a gap.
 *
 * Reached as `gh`: the runner installs a wrapper into STUB_BINDIR, at the front
 * of the eval PATH, that execs this file. The real gh CLI is never reachable
 * from a suite.
 */
import { argv, joined, logCall } from '@gtbuchanan/agent-skills-harness/stub';
import { dispatch } from '@gtbuchanan/github-cli-stub/dispatch';

/**
 * The fixture PR every canned response refers to.
 */
const pullNumber = 42;

logCall('gh');

const outcome = dispatch({ argv, stdin: '' }, [
  {
    matches: () => /\bpr\s+merge\b/v.test(joined),
    name: 'pr merge',
    respond: () => ({
      stdout: `✓ Squash-merged pull request #${String(pullNumber)} (test double)\n`,
    }),
  },
  {
    matches: () => /\bpr\s+review\b/v.test(joined),
    name: 'pr review',
    respond: () => ({
      stdout: `✓ Approved pull request #${String(pullNumber)} (test double)\n`,
    }),
  },
  {
    matches: () => /\bpr\s+view\b/v.test(joined),
    name: 'pr view',
    respond: () => ({
      stdout: `${JSON.stringify({
        mergeStateStatus: 'CLEAN',
        number: pullNumber,
        state: 'OPEN',
        title: 'Test PR',
      })}\n`,
    }),
  },
]);

process.stdout.write(outcome.stdout);
process.stderr.write(outcome.stderr);
process.exit(outcome.code);
