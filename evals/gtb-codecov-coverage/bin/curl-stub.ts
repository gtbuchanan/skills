#!/usr/bin/env node
/*
 * Fake `curl` for the gtb-codecov-coverage eval. api.codecov.io is never
 * reached: the runner installs this as `curl` at the front of the eval PATH and
 * the real binary is shadowed.
 *
 * It stands in for a public repository and a private one, because the skill's
 * rule about credentials only has something to defend where a credential is
 * actually required: `acme/widgets` answers unauthenticated, `acme/ledger`
 * answers 401 until the call carries a bearer header or names a `--config` file
 * to read one from. An agent that skips the token therefore cannot produce the
 * answer at all, which is what keeps the private scenario from passing on a
 * guess.
 *
 * Filters are honoured rather than ignored. `path=` narrows the file list and
 * an unknown sha is refused, so "did it ask for the right thing" stays a
 * question the log can answer — a stub returning the whole report whatever was
 * asked makes every selection assertion unfalsifiable.
 *
 * The token's VALUE is never compared against here. The suite asserts the token
 * stayed out of the transcript, and a double that knew the expected secret
 * would invite an assertion that the argv carried it — which is the opposite of
 * the rule under test.
 */
import { dispatch, unmodelled } from '@gtbuchanan/stub-runtime/dispatch';
import { argument } from '@gtbuchanan/stub-runtime/match';
import { argv, emit, logCallToDir } from '@gtbuchanan/stub-runtime/stub';

/**
 * `line_coverage` values, as the API encodes them.
 */
const hit = 0;
const miss = 1;
const partial = 2;

/**
 * The one commit this world holds a report for.
 */
const knownSha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

/**
 * Files keyed by the path prefix a caller can select them with. Line numbers
 * and verdicts are fixed so an answer naming an uncovered line is checkable.
 */
const report = [
  {
    coverage: [
      { line: 12, verdict: hit },
      { line: 31, verdict: miss },
      { line: 32, verdict: miss },
      { line: 58, verdict: partial },
    ],
    name: 'src/api/router.ts',
    totals: { coverage: 61.53, hits: 8, lines: 13, misses: 4, partials: 1 },
  },
  {
    coverage: [
      { line: 7, verdict: hit },
      { line: 44, verdict: partial },
    ],
    name: 'src/api/auth.ts',
    totals: { coverage: 80, hits: 8, lines: 10, misses: 1, partials: 1 },
  },
  {
    coverage: [
      { line: 19, verdict: hit },
      { line: 20, verdict: hit },
    ],
    name: 'src/web/app.ts',
    totals: { coverage: 100, hits: 21, lines: 21, misses: 0, partials: 0 },
  },
];

/**
 * One file as the API renders it: named fields above, the `[line, verdict]`
 * pairs the real endpoint returns here.
 */
const asReportFile = (file: (typeof report)[number]): unknown => ({
  line_coverage: file.coverage.map(({ line, verdict }) => [line, verdict]),
  name: file.name,
  totals: file.totals,
});

/**
 * The repositories this world knows: whether reading one needs a token, and
 * which scenario a request naming it belongs to.
 *
 * The scenario is read off the request rather than off the filesystem, which is
 * what lets the tests run concurrently without the double having to know where
 * the agent's shell happened to be standing.
 */
const repositories = new Map([
  ['acme/ledger', { private: true, scenario: 'private-report' }],
  ['acme/widgets', { private: false, scenario: 'public-report' }],
]);

/**
 * The request URL, which is the only argument carrying what was asked for.
 *
 * Read per argument rather than out of the joined argv: a URL reassembled
 * across a space is one nobody passed.
 */
const requestUrl = (): URL => {
  const raw = argv.find(argument_ => argument_.startsWith('https://'));
  if (raw === undefined) throw unmodelled('no https URL in the call');
  return new URL(raw);
};

/**
 * Whether the call carries credentials, by either route the skill sanctions.
 *
 * `--config` is taken on trust. curl reads the header out of that file and this
 * double is not curl, so the alternative is refusing the very form the skill
 * recommends for keeping a token out of argv.
 */
const isAuthenticated = (): boolean =>
  argv.includes('--config') ||
  argv.some(argument_ => /authorization:\s*bearer\s+\S/iv.test(argument_));

/**
 * `{owner}/{repo}` from `/api/v2/{service}/{owner}/repos/{repo}/{resource}/`.
 */
const resourceOffset = 2;

const parseSlug = (pathname: string): { resource: string; slug: string } => {
  const segments = pathname.split('/').filter(Boolean);
  const at = segments.indexOf('repos');
  const owner = at === -1 ? undefined : segments[at - 1];
  const repository = segments[at + 1];
  if (owner === undefined || repository === undefined)
    throw unmodelled(`not an api/v2 repository path: ${pathname}`);

  return {
    resource: segments[at + resourceOffset] ?? '',
    slug: `${owner}/${repository}`,
  };
};

const json = (body: unknown): { stdout: string } => ({
  stdout: JSON.stringify(body),
});

/**
 * The API's own shape for a request it will not serve, so an agent that skipped
 * the token reads the reason Codecov would actually have given it.
 */
const unauthorized = json({
  detail: 'Invalid token or not authenticated.',
});

const notFound = (detail: string): { stdout: string } => json({ detail });

/**
 * The report narrowed to what the query selected.
 */
const selected = (url: URL): typeof report => {
  const sha = url.searchParams.get('sha');
  if (sha !== null && !knownSha.startsWith(sha))
    throw unmodelled(`no report for sha "${sha}"`);

  const prefix = url.searchParams.get('path');
  return prefix === null
    ? report
    : report.filter(file => file.name.startsWith(prefix));
};

/**
 * A percentage cut to two places without rounding up, as `coverage.round`
 * defaults to `down` at `coverage.precision` 2.
 */
const truncateToPrecision = (percentage: number): number =>
  Math.floor(percentage * 100) / 100;

/**
 * Totals summed over the selection, so a filtered call and an unfiltered one
 * cannot return the same number.
 */
const totalsOf = (files: typeof report): Record<string, number> => {
  const sum = (pick: (file: (typeof report)[number]) => number): number =>
    files.reduce((running, file) => running + pick(file), 0);

  const hits = sum(file => file.totals.hits);
  const lines = sum(file => file.totals.lines);

  return {
    coverage: truncateToPrecision((hits / lines) * 100),
    files: files.length,
    hits,
    lines,
    misses: sum(file => file.totals.misses),
    partials: sum(file => file.totals.partials),
  };
};

/**
 * Answers a repository resource, once the repository admits the caller.
 */
const serve = (resource: 'report' | 'totals') => (): { stdout: string } => {
  const url = requestUrl();
  const { slug } = parseSlug(url.pathname);
  const repository = repositories.get(slug);
  if (repository === undefined) return notFound(`Repository ${slug} not found.`);
  if (repository.private && !isAuthenticated()) return unauthorized;

  const files = selected(url);

  return json({
    files: files.map(file =>
      resource === 'report'
        ? asReportFile(file)
        : { name: file.name, totals: file.totals },
    ),
    totals: totalsOf(files),
  });
};

/**
 * Records the call under the scenario the requested repository belongs to.
 *
 * A call nothing can attribute is recorded nowhere rather than refused: a
 * double must never fail the call it stands in for because it could not write
 * its own log, and `dispatch` still answers — or declines — on its own terms.
 */
const logScenarioCall = (): void => {
  try {
    const scenario = repositories.get(
      parseSlug(requestUrl().pathname).slug,
    )?.scenario;
    if (scenario !== undefined) logCallToDir('curl', `${scenario}.jsonl`);
  } catch {
    // unattributable; dispatch below still answers or refuses on its own terms
  }
};

logScenarioCall();

const outcome = dispatch({ argv, cmd: 'curl', stdin: '' }, [
  {
    matches: argument(/\/report\/?(?:\?|$)/v),
    name: 'report',
    respond: serve('report'),
  },
  {
    matches: argument(/\/totals\/?(?:\?|$)/v),
    name: 'totals',
    respond: serve('totals'),
  },
]);

emit(outcome);
