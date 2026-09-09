/*
 * Tests for the fake gh this suite runs the skill against.
 *
 * A double is worth exactly what its answers are worth. Every assertion this
 * suite makes rests on the stub having told the agent the truth, and a stub
 * that lies quietly does not fail the suite — it passes it, for a run that
 * deserved to fail.
 *
 * What is particular to this double is which commands it claims. It answers
 * only what merging a pull request motivates, and `dispatch` refuses the rest,
 * so a run that reached for opening or promoting one is stopped rather than
 * served. That refusal is load-bearing: a fall-through answering exit 0 with
 * no output reads as "there is nothing here", and an agent acts on it while
 * every assertion about what it *did* call still passes.
 *
 * The other two cases are the worlds this suite exists for. A stack member has
 * to be refused in the words gh uses, because that refusal is the only way the
 * skill discovers the stack — `pr list` does not report membership. And
 * `--auto` has to defer rather than merge while the checks are pending, since
 * a double that merges on the spot makes the scenario's premise untrue.
 *
 * Driven as a subprocess rather than by importing the module: the stub's whole
 * contract is stdout and an exit status.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { markerFile } from '@gtbuchanan/stub-runtime/scenario';
import { test } from 'vitest';

const stub = path.join(import.meta.dirname, '..', 'bin', 'gh-stub.ts');

interface Run {
  readonly status: number | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * A throwaway workspace seeded as one scenario.
 *
 * Its own directory per call, because the stub persists what a run did into
 * `.eval-state.json` beside the marker. Sharing one would let a merge recorded
 * by an earlier case answer a later one.
 */
const worldFor = (key: string): string => {
  const dir = mkdtempSync(path.join(tmpdir(), `gh-stub-${key}-`));
  writeFileSync(path.join(dir, markerFile), key);
  return dir;
};

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

test('a stack member is refused in the words that name the way in', ({ expect }) => {
  /*
   * `pr list` does not report stack membership, so this refusal is how the
   * skill finds out it is in one — and the endpoint it names is where the
   * merge has to go instead. Refusing without saying which would leave a run
   * knowing only that something failed.
   */
  const result = gh(worldFor('stack-member'), ['pr', 'merge', '14', '--squash']);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('asynchronous merge REST API');
});

test('a pull request outside a stack merges rather than being refused', ({ expect }) => {
  /*
   * The refusal above has to be about membership rather than about merging, or
   * every scenario reaches the asynchronous endpoint and the ordinary path is
   * never exercised.
   */
  const result = gh(worldFor('merge-stacked'), ['pr', 'merge', '7', '--squash']);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Merged pull request');
});

test('auto-merge on a pending world defers instead of reporting a merge', ({ expect }) => {
  /*
   * `--auto` only defers while something is outstanding. A double that reports
   * an immediate merge contradicts the task the scenario set, and the run then
   * reasonably stops looking for the thing it was asked to arrange.
   */
  const result = gh(worldFor('auto-merge'), ['pr', 'merge', '31', '--auto', '--squash']);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('will be automatically merged');
});

test('a command no merge scenario motivates is refused, not answered', ({ expect }) => {
  /*
   * Opening a pull request belongs to the authoring suite. Answering it here
   * would let a run that mistook which skill it was following look successful,
   * and the handler table exists so that cannot happen quietly.
   */
  const result = gh(worldFor('merge-stacked'), ['pr', 'create', '--draft']);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('no canned response');
  expect(result.stdout).toBe('');
});

test('the dependent stacked on the branch is listed, and answers as itself', ({
  expect,
}) => {
  /*
   * Finding what is stacked on the branch is what the merge rules turn on. A
   * double that answered with the pull request being merged would report no
   * dependent, so the branch would go and take the dependent with it.
   */
  const result = gh(worldFor('merge-stacked'), [
    'pr',
    'list',
    '--base',
    'add-rate-limiter',
    '--json',
    'number,headRefName',
  ]);

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toStrictEqual([
    { headRefName: 'add-limiter-metrics', number: 9 },
  ]);
});

/**
 * The parsed answer to a call that was supposed to succeed.
 *
 * The status is checked rather than inferred from the output, because this
 * double has a path that prints and then fails — `pr checks` reports a pending
 * run before exiting non-zero — so a call that grew the same shape would keep
 * every assertion built on this helper green.
 */
const ghJson = (dir: string, args: readonly string[]): unknown => {
  const result = gh(dir, args);
  if (result.status !== 0)
    throw new Error(
      `gh ${args.join(' ')} exited ${String(result.status)}: ${result.stderr}`,
    );

  return JSON.parse(result.stdout);
};

test('an absent field arrives as an explicit null, not as nothing', ({ expect }) => {
  /*
   * JSON.stringify drops a key whose value is undefined, so modelling "no
   * auto-merge is set" as undefined answers `{}` — and an agent reading the
   * field back cannot tell "there is none" from "you did not ask for it".
   *
   * The raw text, not the parsed object: parsing `{}` and reading
   * `.autoMergeRequest` yields undefined either way, so a case that parses
   * first passes on the broken double too.
   */
  const result = gh(worldFor('merge-stacked'), [
    'pr',
    'view',
    '7',
    '--json',
    'autoMergeRequest',
  ]);

  expect(result.stdout).toBe('{"autoMergeRequest":null}');
});

test('a check still running reports a null conclusion, not a missing one', ({
  expect,
}) => {
  /*
   * The same failure one level down, inside the rollup entries — which is where
   * a scenario saying its checks are pending is read from, and the only state
   * in which arranging an auto-merge means anything.
   */
  const result = gh(worldFor('auto-merge'), [
    'pr',
    'view',
    '--json',
    'statusCheckRollup',
  ]);

  expect(result.stdout).toContain('"conclusion":null');
});

test('pr view serves the pull request named, not the world its own', ({ expect }) => {
  /*
   * Answering every question with the scenario's own pull request makes a
   * dependent look like the one being merged — exactly the confusion the merge
   * rules exist to prevent, so the fixture has to tell them apart.
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

test('a merged pull request leaves the open list and reads as merged', {
  tags: ['slow'],
}, ({ expect }) => {
  /*
   * Each invocation is its own process, so a merge that is not persisted lets
   * the next `pr list` report the pull request still open — and a run checking
   * for dependents before deleting a branch reads a world that never happened.
   */
  const dir = worldFor('merge-stacked');

  expect(gh(dir, ['pr', 'merge', '7', '--squash']).status).toBe(0);
  expect(ghJson(dir, ['pr', 'view', '7', '--json', 'state'])).toStrictEqual({
    state: 'MERGED',
  });
  expect(ghJson(dir, ['pr', 'list', '--json', 'number'])).toStrictEqual([{ number: 9 }]);
});
