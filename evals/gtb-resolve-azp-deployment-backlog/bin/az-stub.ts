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
import { dispatch, unmodelled } from '@gtbuchanan/stub-runtime/dispatch';
import { subcommand } from '@gtbuchanan/stub-runtime/match';
import { argv, emit, logCallToDir } from '@gtbuchanan/stub-runtime/stub';

/**
 * The id the fake `pipelines runs update` echoes back.
 */
const cancellingRunId = 900_999;

/**
 * The only repository world this catalog stands in — Azure Repos, which is what
 * `--repository-type` names in the skill's own resolution step.
 */
const azureRepos = 'tfsgit';

logCallToDir('az', 'az.jsonl');

/*
 * Canned pipeline catalog: fictional names the eval prompts reference → their
 * build definition ids. These ids are baked into the eval assertions, so keep
 * them in sync with promptfooconfig.yaml.
 *
 * `repository` is what each is built from, and is deliberately not the pipeline
 * name — the two resolution paths have to be distinguishable, or a lookup by
 * repository is indistinguishable from one by name. It is filtered on and never
 * answered with, as in the real listing, whose records are definition
 * references and carry no repository.
 */
const pipelines = [
  { folder: '\\', id: 900_001, name: 'web-frontend', repository: 'storefront' },
  { folder: '\\', id: 900_002, name: 'api-service', repository: 'platform-api' },
];

/**
 * `az` prints JSON with a trailing newline, as its default output format.
 */
const json = (body: unknown): { stdout: string } => ({
  stdout: `${JSON.stringify(body)}\n`,
});

/**
 * The value `flag` was given, or `undefined` when the call did not pass it.
 */
const flagValue = (flag: string): string | undefined => {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
};

/**
 * The catalog narrowed to what the call selected.
 *
 * A filter that is ignored is a filter that cannot fail: answering every
 * `--name` with the whole catalog leaves a name that should resolve to nothing
 * unsayable, and hides which of the skill's two resolution paths a run took.
 *
 * `--name` matches on prefix because the real one does, and the skill's first
 * step leans on it for partial names. `--repository` selects on a fact the
 * answer never carries, so it reads from the catalog alone. Only Azure Repos
 * are modelled: a GitHub-hosted lookup is refused rather than answered out of a
 * world it is not asking about, where the pipelines it found would not exist.
 */
const listing = (): readonly unknown[] => {
  const repositoryType = flagValue('--repository-type');
  if (repositoryType !== undefined && repositoryType !== azureRepos)
    throw unmodelled(`no repositories of type "${repositoryType}"`);

  const name = flagValue('--name')?.toLowerCase();
  const repository = flagValue('--repository')?.toLowerCase();

  return pipelines
    .filter(
      pipeline => name === undefined || pipeline.name.toLowerCase().startsWith(name),
    )
    .filter(
      pipeline =>
        repository === undefined || pipeline.repository.toLowerCase() === repository,
    )
    .map(pipeline => ({
      folder: pipeline.folder,
      id: pipeline.id,
      name: pipeline.name,
    }));
};

const outcome = dispatch({ argv, cmd: 'az', stdin: '' }, [
  {
    matches: subcommand('pipelines', 'list'),
    name: 'pipelines list',
    respond: () => json(listing()),
  },
  {
    matches: subcommand('pipelines', 'runs', 'update'),
    name: 'pipelines runs update',
    respond: () => json({ id: cancellingRunId, status: 'cancelling' }),
  },
  {
    matches: subcommand('account', 'get-access-token'),
    name: 'account get-access-token',
    respond: () =>
      json({ accessToken: 'stub-token', expiresOn: '2099-01-01 00:00:00' }),
  },
]);

emit(outcome);
