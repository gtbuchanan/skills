/*
 * Tests for the report half of the gtb-resolve-azp-deployment-backlog checker.
 *
 * `checkReport` is the part that holds the agent's prose to the identifiers the
 * Azure DevOps portal shows, so what matters is that it pins a value rather than
 * merely finding it somewhere in the text. A plain substring test would accept
 * `2026.5.990` for run `2026.5.99`, or `web-frontend-canary` for pipeline
 * `web-frontend` — a wrong report passing a green assertion.
 *
 * The opposite error costs just as much: the matcher must still accept a value
 * that ends a sentence or sits inside a Markdown link, because that is how an
 * agent actually writes a report. Both directions are pinned below.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { backlogAssertion, checkReport, scriptCallsFor } from '#src/backlog-check.ts';

const runUrl =
  'https://dev.azure.com/example-org/default-project/_build/results?buildId=900999';

/**
 * The expectations the three live scenarios use, so the tests exercise the same
 * shape the suite runs with rather than an invented one.
 */
const vars = {
  expectPipelineName: 'web-frontend',
  expectRunNames: ['2026.5.99'],
  expectRunUrl: runUrl,
};

/**
 * A report naming everything the skill promises: pipeline, run, and link.
 */
const goodReport = [
  'Fast-forwarded the web-frontend pipeline (definition 900001) on main.',
  'Shipping run 2026.5.99 (build 900999).',
  runUrl,
].join('\n');

test('accepts a report that names the pipeline, run, and link', ({ expect }) => {
  expect(checkReport(goodReport, vars)).toStrictEqual([]);
});

test('rejects a run name that is only a prefix of the reported one', ({ expect }) => {
  // 2026.5.990 is a different run; the stub never prints it.
  const problems = checkReport(
    goodReport.replace('2026.5.99 (build 900999)', '2026.5.990 (build 900999)'),
    vars,
  );

  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/never named 2026\.5\.99/v);
});

test('rejects a pipeline name that is only a prefix of the reported one', ({ expect }) => {
  const problems = checkReport(
    goodReport.replace('web-frontend pipeline', 'web-frontend-canary pipeline'),
    vars,
  );

  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/never called the pipeline "web-frontend"/v);
});

test('rejects a run name extended by a dotted segment', ({ expect }) => {
  /*
   * `2026.5.99.1` is a different run, but the character separating it from the
   * expected value is the same `.` that ends a sentence — so the matcher has to
   * tell a name continuation from punctuation, not just allow or ban periods.
   */
  const problems = checkReport(
    goodReport.replace('2026.5.99 (build', '2026.5.99.1 (build'),
    vars,
  );

  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/never named 2026\.5\.99/v);
});

test('rejects a pipeline name extended by a dotted segment', ({ expect }) => {
  const problems = checkReport(
    goodReport.replace('web-frontend pipeline', 'web-frontend.canary pipeline'),
    vars,
  );

  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/never called the pipeline "web-frontend"/v);
});

test('rejects a run name carrying a dotted prefix', ({ expect }) => {
  // Anchoring only the end would accept `archived.2026.5.99` as `2026.5.99`.
  const problems = checkReport(
    goodReport.replace('run 2026.5.99', 'run archived.2026.5.99'),
    vars,
  );

  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/never named 2026\.5\.99/v);
});

test('rejects a pipeline name carrying a hyphenated prefix', ({ expect }) => {
  const problems = checkReport(
    goodReport.replace('the web-frontend', 'the canary-web-frontend'),
    vars,
  );

  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/never called the pipeline "web-frontend"/v);
});

test('rejects a link pointing at a different build', ({ expect }) => {
  /*
   * Only the URL is altered — the run label keeps its own build id — so this
   * pins the URL check alone rather than catching the run-name one by accident.
   */
  const problems = checkReport(
    goodReport.replace('buildId=900999', 'buildId=9009990'),
    vars,
  );

  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/portal link/v);
});

test('still accepts a run name that ends a sentence', ({ expect }) => {
  /*
   * Trailing punctuation is how an agent writes prose — treating `.` as part of
   * a longer version would reject a perfectly good report.
   */
  expect(checkReport('Approved run 2026.5.99. Rejected ten older runs.', {
    ...vars,
    expectPipelineName: '',
    expectRunUrl: '',
  })).toStrictEqual([]);
});

test('still accepts a link wrapped in Markdown', ({ expect }) => {
  expect(checkReport(`See [the run](${runUrl}) for details.`, {
    ...vars,
    expectPipelineName: '',
    expectRunNames: [],
  })).toStrictEqual([]);
});

test('reads the script calls a run made against its pipeline, in order', ({ expect }) => {
  /*
   * A run's log holds every double's calls. An `az` call parsed as a script
   * call would count as a live run, and one against another id would count
   * toward this test's pipeline.
   */
  const entries = [
    { argv: ['pipelines', 'list'], cmd: 'az' },
    { approveLatest: false, cmd: 'script', pipelineId: 900_001, whatIf: true },
    { approveLatest: true, cmd: 'script', pipelineId: 900_002, whatIf: false },
    { approveLatest: true, cmd: 'script', pipelineId: 900_001, whatIf: false },
  ];

  expect(scriptCallsFor(entries, 900_001)).toStrictEqual([
    expect.objectContaining({ approveLatest: false, whatIf: true }),
    expect.objectContaining({ approveLatest: true, whatIf: false }),
  ]);
});

test('reports the calls the doubles refused beside the verdict', ({ expect }) => {
  /*
   * A refusal says the run reached something the doubles do not model, so a
   * pass was earned past a gap. The auth-fail case asks `az pipelines show`,
   * which the az double refuses.
   */
  const dir = mkdtempSync(path.join(tmpdir(), 'backlog-check-'));
  const logPath = path.join(dir, 'run-1.jsonl');
  const show = ['pipelines', 'show', '--id', '900911'];
  writeFileSync(logPath, [
    { argv: show, cmd: 'az' },
    { argv: show, cmd: 'az', refusal: 'no canned response' },
    { cmd: 'script', pipelineId: 900_911, whatIf: true },
  ].map(entry => `${JSON.stringify(entry)}\n`).join(''));

  const result = backlogAssertion(() => logPath)('', { vars: { pipelineId: 900_911 } });

  expect(result).toMatchObject({ namedScores: { refusals: 1 } });
  expect(result.reason).toContain('pipelines show --id 900911 (no canned response)');
});

test('skips the checks whose expectation is absent', ({ expect }) => {
  expect(checkReport('nothing of substance here', {
    expectPipelineName: '',
    expectRunNames: [],
    expectRunUrl: '',
  })).toStrictEqual([]);
});
