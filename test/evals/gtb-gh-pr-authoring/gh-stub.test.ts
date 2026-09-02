/*
 * Tests for the fake gh this suite runs the skill against.
 *
 * A double is worth exactly what its answers are worth. Every assertion the
 * suite makes about the skill rests on this stub having told the agent the
 * truth, and a stub that lies quietly does not fail the suite — it passes it,
 * for an agent that deserved to fail. So the cases below are the ones where a
 * wrong answer looks like a right one: a field that vanishes instead of saying
 * "none", a refusal where real gh would have answered, an answer where real gh
 * would have refused.
 *
 * Driven as a subprocess rather than by importing the module. The stub's whole
 * contract is stdout and an exit status, and two of the things most worth
 * pinning — that an absent field survives serialisation as an explicit null,
 * that an unmodelled request exits non-zero — exist only once the record has
 * been written out. A test holding that record in memory could not see either.
 *
 * Every case spawns a process, so the ones that spend several are tagged
 * `slow` and sit out the fast bucket. The split is by cost rather than by
 * importance: what stays behind is everything a single invocation can answer,
 * which is both regressions and every refusal — so a stub broken in the ways
 * it has actually been broken still fails the gate that runs on each check.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { markerFile } from '#evals/gtb-gh-pr-authoring/world.ts';
import { repoRoot } from '#evals/lib/paths.ts';

const stub = path.join(
  repoRoot,
  'evals',
  'gtb-gh-pr-authoring',
  'bin',
  'gh-stub.ts',
);

/**
 * A throwaway checkout seeded as one scenario.
 *
 * Its own directory per call, because the stub persists what a run did into
 * `.eval-state.json` beside the marker. Sharing one would let a PR opened by an
 * earlier case answer a later one, which is the same cross-talk the state file
 * exists to model within a single run.
 */
const worldFor = (key: string): string => {
  const dir = mkdtempSync(path.join(tmpdir(), `gh-stub-${key}-`));
  writeFileSync(path.join(dir, markerFile), key);
  return dir;
};

interface Run {
  readonly status: number | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * One `gh` invocation against a seeded checkout, as the agent would make it.
 *
 * STUB_LOG is deliberately left unset: the call log is the checker's input, and
 * nothing here is asserting about it.
 */
const gh = (dir: string, args: readonly string[], input = ''): Run => {
  const result = spawnSync(process.execPath, [stub, ...args], {
    cwd: dir,
    encoding: 'utf8',
    input,
  });

  return {
    status: result.status ?? undefined,
    stderr: result.stderr,
    stdout: result.stdout.trim(),
  };
};

/**
 * The parsed answer to a call that was supposed to succeed.
 *
 * The status is checked rather than inferred from the output. Reading stdout
 * alone drops half the contract, and the stub already has a path that prints
 * and then fails — `pr checks` reports a pending run before exiting 8 — so a
 * `pr view` that grew the same shape would keep every assertion built on this
 * helper green. Today an empty stdout would at least throw out of `JSON.parse`,
 * but that is an accident of the refusal writing nothing, not an assertion, and
 * it reports a syntax error rather than the call that failed.
 */
const ghJson = (dir: string, args: readonly string[]): unknown => {
  const result = gh(dir, args);
  if (result.status !== 0)
    throw new Error(
      `gh ${args.join(' ')} exited ${String(result.status)}: ${result.stderr.trim()}`,
    );

  return JSON.parse(result.stdout);
};

/**
 * Opens the PR a scenario does not seed, the way the skill does.
 */
const createPr = (dir: string): Run =>
  gh(
    dir,
    ['pr', 'create', '--draft', '--title', 'Back the retry off', '--body-file', '-'],
    'Filled-in template.\n',
  );

test('an absent field arrives as an explicit null, not as nothing', ({ expect }) => {
  /*
   * JSON.stringify drops a key whose value is undefined, so modelling "no
   * auto-merge is set" as undefined answers `{}` — and an agent reading the
   * field back cannot tell "there is none" from "you did not ask for it".
   *
   * The raw text, not the parsed object: parsing `{}` and reading
   * `.autoMergeRequest` yields undefined either way, so a case that parses
   * first passes on the broken stub too.
   *
   * A seeded PR named by number, rather than one this case opens and reads back
   * unnamed — that would fold in the branch-resolution rule below and fail here
   * for a reason that has nothing to do with serialisation.
   */
  expect(
    gh(worldFor('merge-stacked'), ['pr', 'view', '7', '--json', 'autoMergeRequest']).stdout,
  ).toBe('{"autoMergeRequest":null}');
});

test('a check still running reports a null conclusion, not a missing one', ({ expect }) => {
  /*
   * Same failure one level down, inside the rollup entries, where the skill's
   * pending-checks scenario is read from.
   */
  expect(
    gh(worldFor('auto-merge'), ['pr', 'view', '--json', 'statusCheckRollup']).stdout,
  ).toContain('"conclusion":null');
});

test('an unnamed pr view answers for the branch the run just opened', ({ expect }) => {
  /*
   * Naming no number is not naming nothing: gh resolves the PR belonging to the
   * current branch. A scenario that seeds no PR of its own still has one once
   * the agent creates it, and refusing here failed a run for doing the ordinary
   * thing — open the PR, then read it back.
   */
  const dir = worldFor('open-draft');

  expect(createPr(dir).status).toBe(0);

  expect(ghJson(dir, ['pr', 'view', '--json', 'number,headRefName,isDraft'])).toStrictEqual({
    headRefName: 'fix-retry-backoff',
    isDraft: true,
    number: 101,
  });
});

test('an unnamed pr view still refuses when nothing has been opened', ({ expect }) => {
  /*
   * The other half of the case above, and the one that keeps the fix honest:
   * deleting the refusal outright would satisfy that test and leave the stub
   * answering about a PR that does not exist.
   */
  const result = gh(worldFor('open-draft'), ['pr', 'view', '--json', 'url']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('no pull request named');
});

test('--json hands back the fields asked for and no others', ({ expect }) => {
  /*
   * Real gh returns exactly the selection. A stub that returns everything hands
   * the agent surfaces it never requested, and "did it read the reviews?" then
   * passes for an agent that never looked.
   */
  expect(
    ghJson(worldFor('merge-stacked'), ['pr', 'view', '7', '--json', 'number,title']),
  ).toStrictEqual({
    number: 7,
    title: 'Add the rate limiter',
  });
});

test('a field the stub does not model refuses instead of answering', ({ expect }) => {
  /*
   * Exit 0 with a field missing reads as "there is no such value", and an agent
   * will act on that. A gap in the double has to look like a gap.
   */
  const result = gh(worldFor('merge-stacked'), ['pr', 'view', '7', '--json', 'mergedAt']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('mergedAt');
});

test('pr view serves the PR named, not the scenario\'s own', ({ expect }) => {
  /*
   * Answering every question with the scenario's own PR makes a dependent look
   * like the one being merged — exactly the confusion the merge rules exist to
   * prevent, so the fixture must be able to tell them apart.
   */
  const fields = 'number,headRefName,baseRefName';

  expect(
    ghJson(worldFor('merge-stacked'), ['pr', 'view', '9', '--json', fields]),
  ).toStrictEqual({
    baseRefName: 'add-rate-limiter',
    headRefName: 'add-limiter-metrics',
    number: 9,
  });
});

test('pr list --base reports only what is stacked on that branch', ({ expect }) => {
  expect(
    ghJson(worldFor('merge-stacked'), [
      'pr', 'list', '--base', 'add-rate-limiter', '--state', 'open', '--json', 'number',
    ]),
  ).toStrictEqual([{ number: 9 }]);
});

test('a merged PR leaves the open list and reads as merged', { tags: ['slow'] }, ({ expect }) => {
  /*
   * Each invocation is its own process, so a merge that is not persisted lets
   * the next `pr list` report the PR still open — and an agent checking for
   * dependents before deleting a branch reads a world that never happened.
   */
  const dir = worldFor('merge-stacked');

  expect(gh(dir, ['pr', 'merge', '7', '--squash']).status).toBe(0);

  expect(ghJson(dir, ['pr', 'view', '7', '--json', 'state'])).toStrictEqual({ state: 'MERGED' });
  expect(ghJson(dir, ['pr', 'list', '--json', 'number'])).toStrictEqual([{ number: 9 }]);
});

test('a draft marked ready stops reporting itself as a draft', { tags: ['slow'] }, ({ expect }) => {
  const dir = worldFor('open-draft');

  expect(createPr(dir).status).toBe(0);
  expect(gh(dir, ['pr', 'ready', '101']).status).toBe(0);

  expect(ghJson(dir, ['pr', 'view', '101', '--json', 'isDraft'])).toStrictEqual({
    isDraft: false,
  });
});

test('a second pull request opens beside the first, not over it', { tags: ['slow'] }, (
  { expect },
) => {
  /*
   * Every create reported one constant number, so a second call replaced the
   * first in the state file — its title and its body were simply gone, and
   * `pr list` answered with one PR for a run that had opened two. Anything
   * asking whether work was split across pull requests reads that answer, and
   * in a world that cannot hold two it is always no.
   */
  const dir = worldFor('open-draft');

  expect(createPr(dir).status).toBe(0);
  expect(
    gh(
      dir,
      [
        'pr', 'create', '--draft', '--head', 'add-retry-jitter',
        '--title', 'Add jitter to the backoff', '--body-file', '-',
      ],
      'The second unit.\n',
    ).status,
  ).toBe(0);

  expect(ghJson(dir, ['pr', 'list', '--json', 'number,title,headRefName'])).toStrictEqual([
    { headRefName: 'fix-retry-backoff', number: 101, title: 'Back the retry off' },
    { headRefName: 'add-retry-jitter', number: 102, title: 'Add jitter to the backoff' },
  ]);
});

test('a second pull request from one branch is refused, as GitHub does', { tags: ['slow'] }, (
  { expect },
) => {
  /*
   * GitHub allows one open pull request per head branch. A double that opens a
   * second makes an agent that branched indistinguishable from one that piled
   * both units onto the same branch — so "it opened two pull requests" would
   * pass for exactly the work the question exists to catch.
   */
  const dir = worldFor('open-draft');

  expect(createPr(dir).status).toBe(0);

  const second = createPr(dir);

  expect(second.status).toBe(1);
  expect(second.stderr).toContain('fix-retry-backoff');
});

test('a call the stub has no answer for fails loudly', ({ expect }) => {
  /*
   * A fall-through is an answer: exit 0 with no output reads as "there is
   * nothing here" — no dependent PRs, no review comments — and the agent goes
   * on to do the wrong thing while every assertion about what it called passes.
   */
  const result = gh(worldFor('open-draft'), ['repo', 'clone', 'acme/widgets']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('no canned response');
});
