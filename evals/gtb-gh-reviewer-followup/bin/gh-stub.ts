#!/usr/bin/env node
/*
 * Fake `gh` for this eval. The dependent skills are mocked, so
 * the only real GitHub calls are the ones the orchestrator makes itself — the
 * happy-path `pr review --approve` and `pr merge --squash`. This logs every
 * invocation (argv) to $STUB_LOG and returns canned success so followup-check.ts
 * can assert the merge gate fired (or held) correctly.
 *
 * Reached as `gh`: the runner installs a wrapper into STUB_BINDIR, at the front
 * of the eval PATH, that execs this file. The real gh CLI is never reachable
 * from a suite.
 */
import { joined, logCall, writeLine } from '@gtbuchanan/agent-skills-harness/stub';

/**
 * The fixture PR every canned response refers to.
 */
const pullNumber = 42;

logCall('gh');

if (/\bpr\s+merge\b/v.test(joined)) {
  writeLine(
    `✓ Squash-merged pull request #${String(pullNumber)} (test double)`,
  );
} else if (/\bpr\s+review\b/v.test(joined)) {
  writeLine(`✓ Approved pull request #${String(pullNumber)} (test double)`);
} else if (/\bpr\s+view\b/v.test(joined)) {
  writeLine(
    JSON.stringify({
      mergeStateStatus: 'CLEAN',
      number: pullNumber,
      state: 'OPEN',
      title: 'Test PR',
    }),
  );
} else {
  writeLine('{}');
}

process.exit(0);
