/*
 * What `gh pr merge` answers, and what it leaves behind.
 *
 * Pure: it returns the state a merge leaves rather than writing it, so a double
 * persists the answer where its own world lives and a test reads it directly.
 *
 * Loaded by stubs running under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import { readFileSync } from 'node:fs';
import type { StubResponse } from '@gtbuchanan/stub-runtime/dispatch';
import { unmodelled } from '@gtbuchanan/stub-runtime/dispatch';
import type { Scenario } from './scenario-world.ts';
import type { Account, AutoMerge, State } from './state.ts';

/**
 * The answer, and the state the next call has to agree with.
 */
export interface MergeOutcome {
  readonly response: StubResponse;
  readonly state: State;
}

/**
 * The value after the first of `flags` the call passed.
 */
const flagValue = (argv: readonly string[], ...flags: readonly string[]): string | undefined => {
  const at = argv.findIndex(arg => flags.includes(arg));
  return at === -1 ? undefined : argv[at + 1];
};

/**
 * The merge method the call named, as GitHub's API spells it, or nothing when
 * it named none.
 */
const methodOf = (argv: readonly string[]): AutoMerge['mergeMethod'] | undefined => {
  if (argv.includes('--squash') || argv.includes('-s')) return 'SQUASH';
  if (argv.includes('--rebase') || argv.includes('-r')) return 'REBASE';
  if (argv.includes('--merge') || argv.includes('-m')) return 'MERGE';

  return undefined;
};

/**
 * What gh prints when a merge names no method and cannot ask for one: the
 * reason, then the command's usage.
 *
 * Kept verbatim beside this file as gh 2.103.2 printed it, because the usage
 * is gh's own text and retyping it is how it would drift. Read on demand, since
 * only a call that names no method needs it.
 */
const noMethodRefusal = (): string =>
  readFileSync(new URL('pr-merge-no-method.txt', import.meta.url), 'utf8');

/**
 * The body the call gave: `--body` inline, or what `--body-file` read.
 */
const bodyOf = (argv: readonly string[], piped: string | undefined): string | undefined =>
  flagValue(argv, '--body', '-b') ??
  (flagValue(argv, '--body-file', '-F') === undefined ? undefined : piped);

/**
 * What `gh pr merge` answers for the pull request `number` names, from a shell
 * whose output is not a terminal.
 *
 * Observed against a real repository rather than read from a terminal: gh
 * prints its success lines only to a terminal, so a merge that lands and an
 * auto-merge that waits both answer with nothing. What tells them apart is
 * the state, which `pr view` reads back. Every refusal here was observed the
 * same way, in the order gh reaches them.
 *
 * `number` is a thunk because naming the pull request can itself refuse, and
 * some refusals never need to name it.
 */
export const mergeAnswer = (options: {
  readonly argv: readonly string[];
  /**
   * What `--body-file -` piped in, where the call read a body from standard
   * input.
   */
  readonly body?: string | undefined;
  readonly now: () => string;
  readonly number: () => number;
  readonly repoSlug: string;
  readonly scenario: Pick<Scenario, 'checksPending' | 'isStackMember'>;
  readonly state: State;
  /**
   * The account the call runs as.
   */
  readonly viewer: Account;
}): MergeOutcome => {
  const { argv, repoSlug, scenario, state } = options;
  const isAuto = argv.includes('--auto');
  const isStackMember = scenario.isStackMember === true;
  /* A required check that has not reported is what blocks a merge here, and
     only a blocked pull request waits: one that can merge is merged on the
     spot, `--auto` or not. */
  const isBlocked = scenario.checksPending === true && !argv.includes('--admin');

  /* gh checks mergeability before anything else, so a blocked merge is refused
     for the block even where the call has other problems. */
  if (isBlocked && !isAuto) {
    return {
      response: {
        code: 1,
        stderr:
          `X Pull request ${repoSlug}#${String(options.number())} is not ` +
          'mergeable: the base branch policy prohibits the merge.\n' +
          'To have the pull request merged after all the requirements have been ' +
          'met, add the `--auto` flag.\n' +
          'To use administrator privileges to immediately merge the pull ' +
          'request, add the `--admin` flag.\n',
      },
      state,
    };
  }

  const mergeMethod = methodOf(argv);
  if (mergeMethod === undefined)
    return { response: { code: 1, stderr: noMethodRefusal() }, state };

  if (isBlocked) {
    if (isStackMember)
      throw unmodelled('auto-merge on a stack member, which has not been observed');

    return {
      response: {},
      state: {
        ...state,
        autoMerge: {
          ...state.autoMerge,
          [String(options.number())]: {
            commitBody: bodyOf(argv, options.body),
            commitHeadline: flagValue(argv, '--subject', '-t'),
            enabledAt: options.now(),
            enabledBy: options.viewer,
            mergeMethod,
          },
        },
      },
    };
  }

  if (isStackMember) {
    /* Membership is how a stack announces itself: `pr list` does not report
       it, so this refusal is the only way the skill finds out. It comes back
       from the merge itself, which gh reports as a GraphQL error. */
    return {
      response: {
        code: 1,
        stderr:
          'GraphQL: This pull request is part of a stack and must be merged ' +
          'using the asynchronous merge REST API. For more information, see ' +
          'https://docs.github.com/rest/pulls/pulls#merge-a-pull-request-asynchronously ' +
          '(mergePullRequest)\n',
      },
      state,
    };
  }

  const number = options.number();
  return { response: {}, state: { ...state, merged: [...state.merged, number] } };
};
