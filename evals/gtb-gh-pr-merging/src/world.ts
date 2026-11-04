/*
 * The GitHub side of a merging scenario, as the fake GitHub serves it to the
 * real gh.
 *
 * Spike: modelled from what gh actually asked for while the merging skill's
 * commands ran, and nothing more. A field nobody needed yet is an error naming
 * it, which is how the next one gets added.
 */
import { resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { runGit } from '@gtbuchanan/git-fixtures/seed-repo';
import type { RestAnswer, World } from '@gtbuchanan/github-api-fake/world';
import { checksFor } from '@gtbuchanan/github-cli-stub/scenario-world';
import type { Scenario } from '@gtbuchanan/github-cli-stub/scenario-world';
import { repoSlug, viewer } from './repository.ts';

/**
 * What calls have changed, kept for as long as the world is.
 */
interface Changes {
  readonly autoMerge: Map<number, {
    readonly commitBody?: string | undefined;
    readonly commitHeadline?: string | undefined;
    readonly mergeMethod: string;
  }>;
  readonly merged: Set<number>;
  readonly retargeted: Map<number, string>;
}

const slashAt = repoSlug.indexOf('/');
const owner = repoSlug.slice(0, slashAt);
const name = repoSlug.slice(slashAt + 1);

/**
 * A REST route the world answers, matched on the decoded path.
 */
interface Route {
  readonly answer: (groups: Record<string, string | undefined>) => RestAnswer;
  readonly method: string;
  readonly pattern: RegExp;
}

const prUrl = (number: number): string =>
  `https://github.localhost/${repoSlug}/pull/${String(number)}`;

const headOid = '0000000000000000000000000000000000000001';

/**
 * A connection's page info when the page holds everything. GitHub sends an
 * explicit null cursor; a key holding `undefined` resolves to it.
 */
const lastPage = { endCursor: undefined, hasNextPage: false };

const emptyConnection = { nodes: [], pageInfo: lastPage, totalCount: 0 };

const conclusionOf = (bucket: string): string | undefined => {
  if (bucket === 'pending') return undefined;
  return bucket === 'pass' ? 'SUCCESS' : 'FAILURE';
};

/**
 * The CI check list as GraphQL's status rollup states it.
 */
const rollupContexts = (scenario: Scenario): Record<string, unknown> => ({
  checkRunCount: checksFor(scenario).length,
  checkRunCountsByState: [],
  nodes: checksFor(scenario).map(check => ({
    __typename: 'CheckRun',
    checkSuite: { workflowRun: { event: 'pull_request', workflow: { name: check.workflow } } },
    completedAt: check.bucket === 'pending' ? '0001-01-01T00:00:00Z' : '2026-05-08T10:00:00Z',
    conclusion: conclusionOf(check.bucket),
    detailsUrl: `https://github.localhost/${repoSlug}/runs/1`,
    isRequired: () => true,
    name: check.name,
    startedAt: '2026-05-08T09:55:00Z',
    status: check.bucket === 'pending' ? 'IN_PROGRESS' : 'COMPLETED',
  })),
  pageInfo: lastPage,
  statusContextCount: 0,
  statusContextCountsByState: [],
});

export const mergingWorld = (scenario: Scenario, origin: string): World => {
  const changes: Changes = { autoMerge: new Map(), merged: new Set(), retargeted: new Map() };

  const own = scenario.pr;
  const pulls = [
    ...(own === undefined ? [] : [{ ...own, reviews: scenario.reviews }]),
    ...scenario.dependents.map(dependent => ({
      baseRefName: scenario.branch,
      body: '',
      headRefName: dependent.headRefName,
      isDraft: false,
      number: dependent.number,
      reviews: [],
      title: dependent.title,
    })),
  ];

  const autoMergeRequest = (number: number): Record<string, unknown> | undefined => {
    const autoMerge = changes.autoMerge.get(number);
    return autoMerge === undefined
      ? undefined
      : {
          authorEmail: undefined,
          commitBody: autoMerge.commitBody,
          commitHeadline: autoMerge.commitHeadline,
          enabledAt: '2026-05-08T10:00:00Z',
          enabledBy: { __typename: 'User', id: 'U_viewer', login: viewer, name: viewer },
          mergeMethod: autoMerge.mergeMethod,
        };
  };

  const mergeStateStatus = (number: number): string => {
    if (changes.merged.has(number)) return 'UNKNOWN';
    return number === own?.number && scenario.checksPending === true ? 'BLOCKED' : 'CLEAN';
  };

  const pullRequest = (pull: (typeof pulls)[number]): Record<string, unknown> => {
    const isOwn = pull.number === own?.number;
    const isMerged = changes.merged.has(pull.number);

    return {
      __typename: 'PullRequest',
      autoMergeRequest: autoMergeRequest(pull.number),
      additions: 0,
      assignedActors: emptyConnection,
      assignees: emptyConnection,
      author: { __typename: 'User', id: 'U_viewer', login: viewer, name: viewer },
      baseRefName: changes.retargeted.get(pull.number) ?? pull.baseRefName,
      body: pull.body,
      comments: emptyConnection,
      closed: isMerged,
      createdAt: '2026-05-08T09:00:00Z',
      deletions: 0,
      commits: () => ({
        nodes: [
          {
            commit: {
              oid: headOid,
              statusCheckRollup: isOwn
                ? { contexts: () => rollupContexts(scenario) }
                : undefined,
            },
          },
        ],
        totalCount: 1,
      }),
      headRefName: pull.headRefName,
      headRefOid: headOid,
      headRepository: { id: 'R_widgets', name, nameWithOwner: repoSlug },
      headRepositoryOwner: { __typename: 'Organization', id: 'O_acme', login: owner },
      id: `PR_${String(pull.number)}`,
      isCrossRepository: false,
      isDraft: pull.isDraft,
      isInMergeQueue: false,
      labels: emptyConnection,
      maintainerCanModify: false,
      isMergeQueueEnabled: false,
      mergeStateStatus: mergeStateStatus(pull.number),
      mergeable: 'MERGEABLE',
      reactionGroups: [],
      projectCards: emptyConnection,
      projectItems: emptyConnection,
      milestone: undefined,
      mergedAt: isMerged ? '2026-05-08T10:00:00Z' : undefined,
      number: pull.number,
      reviewRequests: emptyConnection,
      reviews: () => ({
        nodes: pull.reviews.map((review, index) => ({
          author: { __typename: 'User', login: review.author.login },
          authorAssociation: 'MEMBER',
          body: review.body,
          commit: { oid: headOid },
          id: `PRR_${String(index)}`,
          includesCreatedEdit: false,
          reactionGroups: [],
          state: review.state,
          submittedAt: '2026-05-08T09:30:00Z',
        })),
        pageInfo: lastPage,
        totalCount: pull.reviews.length,
      }),
      reviewDecision: pull.reviews.some(review => review.state === 'APPROVED')
        ? 'APPROVED'
        : 'REVIEW_REQUIRED',
      state: isMerged ? 'MERGED' : 'OPEN',
      title: pull.title,
      url: prUrl(pull.number),
    };
  };

  const byNumber = (number: number): (typeof pulls)[number] | undefined =>
    pulls.find(pull => pull.number === number);

  const byId = (id: unknown): (typeof pulls)[number] => {
    const found = pulls.find(pull => `PR_${String(pull.number)}` === id);
    if (found === undefined) throw new Error(`no pull request ${String(id)}`);
    return found;
  };

  /**
   * Whether a filter argument admits a value: an absent filter admits all.
   */
  const isAdmitted = (filter: string | readonly string[] | undefined, value: unknown): boolean => {
    if (filter === undefined) return true;
    return typeof filter === 'string' ? filter === value : filter.includes(String(value));
  };

  const pullRequests = (args: {
    baseRefName?: string;
    headRefName?: string;
    states?: readonly string[];
  }): Record<string, unknown> => {
    const nodes = pulls
      .map(pullRequest)
      .filter(record => isAdmitted(args.states, record['state']))
      .filter(record => isAdmitted(args.baseRefName, record['baseRefName']))
      .filter(record => isAdmitted(args.headRefName, record['headRefName']));

    return { nodes, pageInfo: lastPage, totalCount: nodes.length };
  };

  const repository = {
    defaultBranchRef: { name: 'main' },
    deleteBranchOnMerge: scenario.deleteBranchOnMerge,
    id: 'R_widgets',
    mergeCommitAllowed: false,
    name,
    nameWithOwner: repoSlug,
    owner: { __typename: 'Organization', id: 'O_acme', login: owner },
    pullRequest: ({ number }: { number: number }) => {
      const pull = byNumber(number);
      if (pull === undefined)
        throw new Error(`Could not resolve to a PullRequest with the number of ${String(number)}.`);
      return pullRequest(pull);
    },
    pullRequests,
    rebaseMergeAllowed: false,
    squashMergeAllowed: true,
    viewerPermission: 'ADMIN',
  };

  const deleteBranch = (branch: string): void => {
    runGit({ cwd: origin, git: resolveRealGit() }, ['branch', '-D', branch]);
  };

  /**
   * Merges a pull request, and deletes its head where the repository does that
   * for itself, as GitHub would.
   */
  const land = (pull: (typeof pulls)[number]): void => {
    changes.merged.add(pull.number);
    if (scenario.deleteBranchOnMerge) deleteBranch(pull.headRefName);
  };

  const routes: readonly Route[] = [
    {
      answer: (groups) => {
        const pull = byNumber(Number(groups['number']));
        if (pull === undefined) return { body: { message: 'Not Found' }, status: 404 };
        land(pull);
        return { body: { status: 'pending' }, status: 202 };
      },
      method: 'PUT',
      pattern: new RegExp(String.raw`^/repos/${repoSlug}/pulls/(?<number>\d+)/merge-async$`, 'v'),
    },
    {
      answer: (groups) => {
        deleteBranch(groups['branch'] ?? '');
        return { body: undefined, status: 204 };
      },
      method: 'DELETE',
      pattern: new RegExp(`^/repos/${repoSlug}/git/refs/heads/(?<branch>.+)$`, 'v'),
    },
    {
      answer: () => ({ body: { login: viewer }, status: 200 }),
      method: 'GET',
      pattern: /^\/user$/v,
    },
  ];

  return {
    graphql: {
      enablePullRequestAutoMerge: ({ input }: { input: {
        commitBody?: string;
        commitHeadline?: string;
        mergeMethod?: string;
        pullRequestId: string;
      }; }) => {
        const pull = byId(input.pullRequestId);
        changes.autoMerge.set(pull.number, {
          commitBody: input.commitBody,
          commitHeadline: input.commitHeadline,
          mergeMethod: input.mergeMethod ?? 'MERGE',
        });
        return { clientMutationId: undefined };
      },
      node: ({ id }: { id: string }) => pullRequest(byId(id)),
      mergePullRequest: ({ input }: { input: { pullRequestId: string } }) => {
        const pull = byId(input.pullRequestId);
        if (scenario.isStackMember === true && pull.number === own?.number)
          throw new Error(
            'This pull request is part of a stack and must be merged using the ' +
            'asynchronous merge REST API. For more information, see ' +
            'https://docs.github.com/rest/pulls/pulls#merge-a-pull-request-asynchronously',
          );
        land(pull);
        return { clientMutationId: undefined };
      },
      repository: (args: { name: string; owner: string }) =>
        args.owner === owner && args.name === name ? repository : undefined,
      updatePullRequest: ({ input }: {
        input: { baseRefName?: string; pullRequestId: string };
      }) => {
        const pull = byId(input.pullRequestId);
        if (input.baseRefName !== undefined) changes.retargeted.set(pull.number, input.baseRefName);
        return { clientMutationId: undefined, pullRequest: pullRequest(pull) };
      },
      viewer: { login: viewer },
    },
    rest: (request) => {
      // gh encodes the slash in `heads/<branch>`, so routes match decoded.
      const decoded = decodeURIComponent(request.path);
      const route = routes.find(
        candidate => candidate.method === request.method && candidate.pattern.test(decoded),
      );
      return route?.answer(route.pattern.exec(decoded)?.groups ?? {});
    },
  };
};
