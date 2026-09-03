#!/usr/bin/env node
/*
 * Fake `az` for the gtb-resolve-azp-deployment-backlog eval. Azure DevOps is never
 * reached: the runner installs this as `az` at the front of the eval PATH and
 * the real CLI is unreachable. Its job is to answer `az pipelines list` so the
 * agent can resolve a pipeline NAME to its numeric id (and `az account
 * get-access-token` / `az pipelines runs update` if an agent reaches for them).
 *
 * Note: the behavioral assertions do NOT read this stub's log. A named
 * pipeline's numeric id lives only in the catalog below, so the script being
 * invoked with the correct resolved id is itself proof the agent called
 * `az pipelines list` — no cross-test az-call correlation needed, which is what
 * lets the suite run in parallel. The log is kept only for debugging.
 */
import { joined, logCallToDir, writeLine } from '@gtbuchanan/agent-skills-harness/stub';

/**
 * The id the fake `pipelines runs update` echoes back.
 */
const cancellingRunId = 900_999;

logCallToDir('az', 'az.jsonl');

/*
 * Canned pipeline catalog: fictional names the eval prompts reference → their
 * build definition ids. These ids are baked into the eval assertions, so keep
 * them in sync with promptfooconfig.yaml.
 */
const pipelines = [
  { folder: '\\', id: 900_001, name: 'web-frontend' },
  { folder: '\\', id: 900_002, name: 'api-service' },
];

if (/\bpipelines\s+list\b/v.test(joined)) {
  writeLine(JSON.stringify(pipelines));
} else if (/\bpipelines\s+runs\s+update\b/v.test(joined)) {
  writeLine(JSON.stringify({ id: cancellingRunId, status: 'cancelling' }));
} else if (/\baccount\s+get-access-token\b/v.test(joined)) {
  writeLine(
    JSON.stringify({
      accessToken: 'stub-token',
      expiresOn: '2099-01-01 00:00:00',
    }),
  );
} else {
  writeLine('{}');
}

process.exit(0);
