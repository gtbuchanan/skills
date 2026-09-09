/*
 * Tests for the assertion a suite's expectations are actually judged by.
 *
 * The matchers have their own tests; what is left here is the wiring around
 * them, and every failure it can have is silent. A call log read from the
 * wrong path is an empty one, and an empty log fails every `requireCalls`
 * clause — so a suite reports the skill never made a call it in fact made, and
 * the reason names the skill rather than the harness. Counting commits fails
 * the same way from the other side: no baseline recorded reads as no commits
 * added.
 *
 * Driven against a real log file and a real repository, because those two
 * paths are the whole of what this layer does.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { captureGit, runGit, seedHistory } from '@gtbuchanan/git-fixtures/seed-repo';
import { scenarioPath } from '@gtbuchanan/stub-runtime/scenario';
import { test } from 'vitest';
import { fakeSuite } from './fake-suite.ts';
import { callExpectationAssertion } from '@gtbuchanan/agent-skills-harness/call-expectations';
import { commitCountCheck } from '@gtbuchanan/agent-skills-harness/commit-count';
import { suiteRunDir } from '@gtbuchanan/agent-skills-harness/paths';

const git = resolveRealGit();

const identity = { email: 'taylor@example.com', name: 'Taylor Buchanan' };

/**
 * Writes one scenario's call log where the assertion will look for it.
 */
const writeLog = (
  metaUrl: string,
  scenario: string,
  calls: readonly { argv: string[]; stdin?: string }[],
): void => {
  const dir = suiteRunDir(metaUrl);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `${scenario}.jsonl`),
    calls.map(call => `${JSON.stringify({ cmd: 'gh', ...call })}\n`).join(''),
  );
};

test('a call the log contains satisfies the clause that names it', ({ expect }) => {
  const suite = fakeSuite();
  writeLog(suite.metaUrl, 'open-draft', [
    { argv: ['pr', 'create', '--draft', '--body-file', '-'], stdin: '### Description' },
  ]);

  const assertion = callExpectationAssertion({ metaUrl: suite.metaUrl });

  const result = assertion(undefined, {
    vars: {
      requireCalls: [['pr create', '--draft']],
      requireStdin: [{ command: ['pr create'], includes: ['### Description'] }],
      scenario: 'open-draft',
    },
  });

  expect(result.pass).toBe(true);
});

test('every failing rule is reported, not only the first', ({ expect }) => {
  /*
   * A run is expensive enough that reporting one problem at a time turns one
   * failure into several runs.
   */
  const suite = fakeSuite();
  writeLog(suite.metaUrl, 'open-draft', [{ argv: ['pr', 'ready', '44'] }]);

  const assertion = callExpectationAssertion({ metaUrl: suite.metaUrl });

  const result = assertion(undefined, {
    vars: {
      forbidCalls: [['pr ready']],
      requireCalls: [['pr create']],
      scenario: 'open-draft',
    },
  });

  expect(result.pass).toBe(false);
  expect(result.reason).toContain('never called: pr create');
  expect(result.reason).toContain('called what it must not: pr ready');
});

test('a scenario reads its own log, not another scenario’s', ({ expect }) => {
  /*
   * The doubles key one log per checkout so tests can run at once. Reading a
   * shared log instead would let a concurrent test's calls satisfy this one —
   * which passes, and is the failure nothing catches.
   */
  const suite = fakeSuite();
  writeLog(suite.metaUrl, 'open-draft', [{ argv: ['pr', 'create', '--draft'] }]);
  writeLog(suite.metaUrl, 'promote-ready', [{ argv: ['pr', 'ready', '44'] }]);

  const assertion = callExpectationAssertion({ metaUrl: suite.metaUrl });

  const result = assertion(undefined, {
    vars: { requireCalls: [['pr create']], scenario: 'promote-ready' },
  });

  expect(result.pass).toBe(false);
});

/**
 * A seeded scenario checkout under a throwaway EVAL_WORKSPACE, with `extra`
 * commits written on top of the recorded baseline.
 */
const seededScenario = (
  scenario: string,
  extra: number,
): { readonly baselines: string; readonly workspace: string } => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'eval-workspace-'));
  const cwd = path.join(workspace, ...scenarioPath(scenario).split('/'));

  seedHistory({
    author: identity,
    branch: 'fix-token-mint',
    commits: [
      {
        date: '2026-05-04T09:00:00-05:00',
        key: 'base',
        subject: 'Add the token minter',
        tree: { 'src/token.ts': 'export const mint = (): string => "";\n' },
      },
    ],
    git,
    localIdentity: identity,
    workspace: cwd,
  });

  const runner = { cwd, git };
  const tip = captureGit(runner, ['rev-parse', 'HEAD']);

  for (let index = 0; index < extra; index += 1) {
    writeFileSync(path.join(cwd, `fix-${String(index)}.ts`), 'export const x = 1;\n');
    runGit(runner, ['add', '--', `fix-${String(index)}.ts`]);
    runGit(runner, ['commit', '-q', '-m', `Fix the ${String(index)} finding`]);
  }

  const tipsDir = mkdtempSync(path.join(tmpdir(), 'tips-'));
  const baselines = path.join(tipsDir, 'tips.json');
  writeFileSync(baselines, JSON.stringify({ [scenario]: tip }));

  return { baselines, workspace };
};

/**
 * Runs `body` with EVAL_WORKSPACE pointed at `workspace`, restoring it after —
 * the variable is process-wide, so a failing case would otherwise leak into
 * the next one.
 */
const withWorkspace = <TResult>(workspace: string, body: () => TResult): TResult => {
  const previous = process.env['EVAL_WORKSPACE'];
  process.env['EVAL_WORKSPACE'] = workspace;
  try {
    return body();
  } finally {
    if (previous === undefined) delete process.env['EVAL_WORKSPACE'];
    else process.env['EVAL_WORKSPACE'] = previous;
  }
};

test('commits are counted from the recorded baseline, not from the branch point', {
  tags: ['slow'],
}, ({ expect }) => {
  /*
   * The rule this serves is that a run of fixes arrives as one commit per
   * finding. Counting from the recorded tip is what keeps the seeded history
   * out of the total — count from the branch point instead and the baseline
   * commit satisfies the rule on its own.
   */
  const scenario = 'review-feedback';
  const { baselines, workspace } = seededScenario(scenario, 2);
  const suite = fakeSuite();
  writeLog(suite.metaUrl, scenario, [{ argv: ['pr', 'view', '23'] }]);

  const assertion = callExpectationAssertion({
    outcomeChecks: [commitCountCheck({ baselinesPath: () => baselines })],
    metaUrl: suite.metaUrl,
  });

  withWorkspace(workspace, () => {
    expect(assertion(undefined, { vars: { minCommits: 2, scenario } }).pass).toBe(true);

    const short = assertion(undefined, { vars: { minCommits: 3, scenario } });

    expect(short.pass).toBe(false);
    expect(short.reason).toContain('added 2 commit(s)');
  });
});

test('a baselines manifest that was never written fails the scenario, not the run', ({
  expect,
}) => {
  /*
   * The check returns problems rather than throwing, so an unreadable manifest
   * has to become one. Letting the read throw puts an ENOENT through a
   * promptfoo assertion, where it surfaces as the harness falling over rather
   * than as a scenario that failed and said why — and a suite pairing this
   * check with a seeder that records no tips would hit exactly that.
   */
  const suite = fakeSuite();
  writeLog(suite.metaUrl, 'review-feedback', [{ argv: ['pr', 'view', '23'] }]);
  const absentDir = mkdtempSync(path.join(tmpdir(), 'absent-'));
  const missing = path.join(absentDir, 'nothing.json');

  const assertion = callExpectationAssertion({
    metaUrl: suite.metaUrl,
    outcomeChecks: [commitCountCheck({ baselinesPath: () => missing })],
  });

  const result = assertion(undefined, {
    vars: { minCommits: 2, scenario: 'review-feedback' },
  });

  expect(result.pass).toBe(false);
  expect(result.reason).toContain('no baselines recorded');
});

test('a scenario with no recorded baseline says so rather than reporting none added', {
  tags: ['slow'],
}, ({ expect }) => {
  /*
   * No baseline is a harness failure; zero commits is a skill failure. A
   * checker that reported the second for the first would blame the run for
   * something the seed never recorded.
   */
  const { baselines, workspace } = seededScenario('review-feedback', 1);
  const suite = fakeSuite();
  writeLog(suite.metaUrl, 'never-seeded', [{ argv: ['pr', 'view', '23'] }]);

  const assertion = callExpectationAssertion({
    outcomeChecks: [commitCountCheck({ baselinesPath: () => baselines })],
    metaUrl: suite.metaUrl,
  });

  withWorkspace(workspace, () => {
    const result = assertion(undefined, {
      vars: { minCommits: 2, scenario: 'never-seeded' },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('no recorded baseline');
  });
});
