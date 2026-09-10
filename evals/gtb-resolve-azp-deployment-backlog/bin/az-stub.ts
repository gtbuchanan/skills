#!/usr/bin/env node
/*
 * Fake `az` for the gtb-resolve-azp-deployment-backlog eval. Azure DevOps is never
 * reached: the runner installs this as `az` at the front of the eval PATH and
 * the real CLI is unreachable. Its job is to answer `az pipelines list` so the
 * agent can resolve a pipeline NAME to its numeric id, plus `az account
 * get-access-token` and `az pipelines runs update`.
 *
 * Those three are the whole of it, and anything else is refused by
 * construction: `dispatch` has no fall-through to forget. That matters most for
 * `az devops invoke`, which is in the skill's own vocabulary and is not modelled
 * here — answered with an empty object it would read as "no approvals pending",
 * and a run that believed it would finish looking correct having done nothing.
 *
 * Note: the behavioral assertions do NOT read this stub's log. A named
 * pipeline's numeric id lives only in the catalog below, so the script being
 * invoked with the correct resolved id is itself proof the agent called
 * `az pipelines list` — no cross-test az-call correlation needed, which is what
 * lets the suite run in parallel. The log is kept only for debugging.
 */
import { dispatch } from '@gtbuchanan/stub-runtime/dispatch';
import { argv, emit, joined, logCallToDir } from '@gtbuchanan/stub-runtime/stub';

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

/**
 * `az` prints JSON with a trailing newline, as its default output format.
 */
const json = (body: unknown): { stdout: string } => ({
  stdout: `${JSON.stringify(body)}\n`,
});

const outcome = dispatch({ argv, cmd: 'az', stdin: '' }, [
  {
    matches: () => /\bpipelines\s+list\b/v.test(joined),
    name: 'pipelines list',
    respond: () => json(pipelines),
  },
  {
    matches: () => /\bpipelines\s+runs\s+update\b/v.test(joined),
    name: 'pipelines runs update',
    respond: () => json({ id: cancellingRunId, status: 'cancelling' }),
  },
  {
    matches: () => /\baccount\s+get-access-token\b/v.test(joined),
    name: 'account get-access-token',
    respond: () =>
      json({ accessToken: 'stub-token', expiresOn: '2099-01-01 00:00:00' }),
  },
]);

emit(outcome);
