/*
 * Tests for what `gh pr merge` answers, and what it leaves behind.
 *
 * Observed against a real repository from a shell whose output is not a
 * terminal, which is what an agent's is. gh prints its success lines only to a
 * terminal, so a merge that lands and an auto-merge that waits both answer with
 * nothing at all: what tells them apart is the state, read back by `pr view`.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { UnmodelledCall } from '@gtbuchanan/stub-runtime/dispatch';
import { test } from 'vitest';
import { mergeAnswer } from '@gtbuchanan/github-cli-stub/merge';
import type { Scenario } from '@gtbuchanan/github-cli-stub/scenario-world';
import { emptyState } from '@gtbuchanan/github-cli-stub/state';

const repoSlug = 'acme/widgets';
const enabledAt = '2026-11-03T20:22:41Z';

const merge = (
  argv: readonly string[],
  scenario: Pick<Scenario, 'checksPending' | 'isStackMember'> = {},
  body?: string,
): ReturnType<typeof mergeAnswer> =>
  mergeAnswer({
    argv,
    body,
    now: () => enabledAt,
    number: () => 7,
    repoSlug,
    scenario,
    state: emptyState,
    viewer: { login: 'taylor', name: 'Taylor Buchanan' },
  });

/**
 * A pull request a required check has not reported on yet.
 */
const blocked = { checksPending: true };

test('a merge with nothing outstanding answers with nothing', ({ expect }) => {
  expect(merge(['pr', 'merge', '7', '--squash']).response).toStrictEqual({});
});

test('a merge with nothing outstanding is recorded as merged', ({ expect }) => {
  expect(merge(['pr', 'merge', '7', '--squash']).state.merged).toStrictEqual([7]);
});

test('--auto with nothing outstanding lands now rather than waiting', ({ expect }) => {
  /* gh enables auto-merge only on a pull request that cannot merge yet; one
     that can is merged on the spot, leaving no request behind. */
  const outcome = merge(['pr', 'merge', '7', '--auto', '--squash']);

  expect(outcome.state).toStrictEqual({ ...emptyState, merged: [7] });
});

test('a merge blocked by a required check is refused with the way past it', ({ expect }) => {
  const outcome = merge(['pr', 'merge', '7', '--squash'], blocked);

  expect(outcome.response).toStrictEqual({
    code: 1,
    stderr:
      `X Pull request ${repoSlug}#7 is not mergeable: the base branch policy ` +
      'prohibits the merge.\n' +
      'To have the pull request merged after all the requirements have been ' +
      'met, add the `--auto` flag.\n' +
      'To use administrator privileges to immediately merge the pull request, ' +
      'add the `--admin` flag.\n',
  });
  expect(outcome.state).toStrictEqual(emptyState);
});

test('--admin merges past the requirement that blocked it', ({ expect }) => {
  const outcome = merge(['pr', 'merge', '7', '--squash', '--admin'], blocked);

  expect(outcome.state.merged).toStrictEqual([7]);
});

/**
 * `--auto` on a blocked pull request, naming a subject and piping a body.
 */
const autoOnBlocked = (): ReturnType<typeof mergeAnswer> =>
  merge(
    [
      'pr', 'merge', '7', '--auto', '--squash',
      '--subject', 'Add the limiter (#7)', '--body-file', '-',
    ],
    blocked,
    'Rejects bursts past the limit.\n',
  );

test('--auto on a blocked pull request answers with nothing', ({ expect }) => {
  expect(autoOnBlocked().response).toStrictEqual({});
});

test('--auto on a blocked pull request leaves it unmerged', ({ expect }) => {
  expect(autoOnBlocked().state.merged).toStrictEqual([]);
});

test('--auto on a blocked pull request records the request it made', ({ expect }) => {
  expect(autoOnBlocked().state.autoMerge).toStrictEqual({
    7: {
      commitBody: 'Rejects bursts past the limit.\n',
      commitHeadline: 'Add the limiter (#7)',
      enabledAt,
      enabledBy: { login: 'taylor', name: 'Taylor Buchanan' },
      mergeMethod: 'SQUASH',
    },
  });
});

test('--auto records the method the call named', ({ expect }) => {
  const outcome = merge(['pr', 'merge', '7', '--auto', '--rebase'], blocked);

  expect(outcome.state.autoMerge['7']?.mergeMethod).toBe('REBASE');
});

test('a merge naming no method is refused with the usage gh prints', ({ expect }) => {
  /* gh asks for a method interactively, and refuses with its usage when it
     cannot — `--auto` or not. */
  for (const argv of [['pr', 'merge', '7'], ['pr', 'merge', '7', '--auto']]) {
    const outcome = merge(argv);

    expect(outcome.response.code).toBe(1);
    expect(outcome.response.stderr).toMatch(
      new RegExp(
        String.raw`^--merge, --rebase, or --squash required when not running interactively\n` +
        String.raw`\nMerge a pull request on GitHub\.\n`,
        'v',
      ),
    );
    expect(outcome.response.stderr).toContain('  -s, --squash ');
    expect(outcome.state).toStrictEqual(emptyState);
  }
});

test('a stack member is refused in the words GitHub uses', ({ expect }) => {
  /* Membership is how a stack announces itself — `pr list` does not report it
     — so this refusal is the only way a skill finds out. It comes back from
     the merge itself, which gh reports as a GraphQL error. */
  const outcome = merge(['pr', 'merge', '7', '--squash'], { isStackMember: true });

  expect(outcome.response).toStrictEqual({
    code: 1,
    stderr:
      'GraphQL: This pull request is part of a stack and must be merged using ' +
      'the asynchronous merge REST API. For more information, see ' +
      'https://docs.github.com/rest/pulls/pulls#merge-a-pull-request-asynchronously ' +
      '(mergePullRequest)\n',
  });
  expect(outcome.state).toStrictEqual(emptyState);
});

test('a blocked stack member is refused for the block before the stack', ({ expect }) => {
  /* gh checks mergeability before it attempts the merge, and membership is
     only reported by the attempt. */
  const outcome = merge(['pr', 'merge', '7', '--squash'], { ...blocked, isStackMember: true });

  expect(outcome.response.stderr).toMatch(/^X Pull request .* is not mergeable/v);
});

test('auto-merge on a blocked stack member is refused as unmodelled', ({ expect }) => {
  /* Whether GitHub accepts an auto-merge request on a stack member has not
     been observed, so this double declines to invent an answer. */
  expect(() =>
    merge(['pr', 'merge', '7', '--auto', '--squash'], { ...blocked, isStackMember: true }),
  ).toThrow(UnmodelledCall);
});
