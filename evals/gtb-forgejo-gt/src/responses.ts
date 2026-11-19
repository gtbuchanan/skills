/*
 * What the gt double prints, built from the world in `world.ts`. Kept apart
 * from the double so its dispatch reads as a list of commands, and pure, so
 * the double alone decides what gets recorded.
 *
 * Error texts are gt 2.0.0's own, copied from a live run against Forgejo
 * 17.0.1. Approximated, for want of a live sample: the wording of a 405
 * through `gt api`, `pr view`'s text form, and the descriptions and exit code
 * of `pr checks` with a check failing.
 *
 * Loaded by the double under plain `node`, so everything here stays erasable
 * syntax.
 */
import type { StubResponse } from '@gtbuchanan/cli-doubles/dispatch';
import { unmodelled } from '@gtbuchanan/cli-doubles/dispatch';
import {
  headSha,
  host,
  jobs,
  otherHost,
  pull,
  pullIndex,
  repo,
  review,
  reviewComment,
  run,
  user,
} from './world.ts';

const httpNotFound = 404;
const httpMethodNotAllowed = 405;
const jsonIndent = 2;

export const json = (body: unknown): StubResponse => ({
  stdout: `${JSON.stringify(body, undefined, jsonIndent)}\n`,
});

export const text = (body: string): StubResponse => ({ stdout: body });

export const failure = (message: string): StubResponse => ({
  code: 1,
  stderr: `Error: ${message}\n`,
});

interface HttpFailure {
  readonly endpoint: string;
  readonly instance: string;
  readonly message: string;
  readonly method: string;
  readonly status: number;
}

const httpFailure = (fault: HttpFailure): StubResponse => ({
  code: 1,
  stderr:
    `Error: ${fault.message} (HTTP ${String(fault.status)} ${fault.method} ` +
    `/api/v1/${fault.endpoint})\n`,
  stdout: `${JSON.stringify({ message: fault.message, url: `${fault.instance}/api/swagger` })}\n`,
});

export const notFound = (method: string, endpoint: string, instance = host): StubResponse =>
  httpFailure({ endpoint, instance, message: 'not found', method, status: httpNotFound });

export const noAccount = (): StubResponse =>
  failure(
    `no account for ${host}; run gt auth login --host ${host}, or use -R or ` +
    '--host to target another instance',
  );

const repoPath = `repos/${repo}`;
const pullPath = `${repoPath}/pulls/${String(pullIndex)}`;
export const reviewPath = `${pullPath}/reviews/${String(review.id)}`;
const runsPath = `${repoPath}/actions/runs`;
const statusRefs = new Set([headSha, pull.head.ref]);

const workflowRun = {
  head_branch: pull.head.ref,
  head_sha: headSha,
  html_url: `${host}/${repo}/actions/runs/${String(run.index)}`,
  id: run.id,
  index_in_repo: run.index,
  prettyref: pull.head.ref,
  status: 'failure',
  title: pull.title,
  trigger_event: 'push',
  workflow_id: 'ci.yml',
};

const combinedStatus = {
  sha: headSha,
  state: 'failure',
  statuses: jobs.map((job, index) => ({
    context: `/ ${job.name} (push)`,
    status: job.status,
    target_url: `/${repo}/actions/runs/${String(run.index)}/jobs/${String(index)}`,
  })),
  total_count: jobs.length,
};

const readRoutes: Readonly<Record<string, () => StubResponse>> = {
  [pullPath]: () => json(pull),
  [`${pullPath}/reviews`]: () => json([review]),
  [reviewPath]: () => json(review),
  [`${reviewPath}/comments`]: () => json([reviewComment]),
  [runsPath]: () => json({ total_count: 1, workflow_runs: [workflowRun] }),
  [`${runsPath}/${String(run.id)}`]: () => json(workflowRun),
  // Forgejo's job list is a bare array, which is what breaks `gt run view`.
  [`${runsPath}/${String(run.id)}/jobs`]: () =>
    json(jobs.map(({ id, name, status }) => ({ id, name, status }))),
  ...Object.fromEntries(
    jobs.map(job => [`${repoPath}/actions/jobs/${String(job.id)}/logs`, () => text(job.log)]),
  ),
};

const statusResponse = (endpoint: string): StubResponse | undefined => {
  const match = new RegExp(
    String.raw`^${repoPath}/commits/(?<ref>[^\/]+)/(?<kind>status|statuses)$`,
    'v',
  ).exec(endpoint);
  const ref = match?.groups?.['ref'];
  if (ref === undefined) return undefined;
  if (!statusRefs.has(ref)) return notFound('GET', endpoint);
  return json(
    match?.groups?.['kind'] === 'status' ? combinedStatus : combinedStatus.statuses,
  );
};

/*
 * Any other run or job under the repository is one Forgejo has no record of:
 * run 2, the number the check links show, is the usual miss.
 */
const missingAction = new RegExp(String.raw`^${repoPath}/actions/(?:runs|jobs)/\d+`, 'v');

const gitOnlyRoute = new RegExp(
  String.raw`^${pullPath}/comments/\d+/replies$|^${repoPath}/pulls/comments/\d+/(?:un)?resolve$`,
  'v',
);

const readRoute = (endpoint: string): StubResponse => {
  const read = readRoutes[endpoint];
  const response = read === undefined ? statusResponse(endpoint) : read();
  if (response !== undefined) return response;
  if (missingAction.test(endpoint)) return notFound('GET', endpoint);
  throw unmodelled(`no GET ${endpoint}`);
};

/**
 * Answers a request gt would send to the Forgejo instance. A reply is handed
 * to `postReply`, which owns recording it.
 */
export const route = (
  request: {
    readonly body: Readonly<Record<string, unknown>> | undefined;
    readonly endpoint: string;
    readonly method: string;
  },
  postReply: (body: Readonly<Record<string, unknown>>) => StubResponse,
): StubResponse => {
  const { body, endpoint, method } = request;
  if (gitOnlyRoute.test(endpoint))
    return httpFailure({
      endpoint,
      instance: host,
      message: 'Method Not Allowed',
      method,
      status: httpMethodNotAllowed,
    });
  if (method === 'GET') return readRoute(endpoint);
  if (body !== undefined && method === 'POST' && endpoint === `${reviewPath}/comments`)
    return postReply(body);
  throw unmodelled(`no ${method} ${endpoint}`);
};

export const postedReply = (body: Readonly<Record<string, unknown>>): StubResponse =>
  json({
    body: body['body'],
    id: reviewComment.id + 1,
    path: body['path'],
    position: body['new_position'],
    pull_request_review_id: review.id,
  });

/*
 * What `pr review reply|resolve|unresolve <pr> <comment-id>` print: they reach
 * the routes Forgejo lacks.
 */
export const reviewRefusal = (action: string, number: string, comment: string): StubResponse =>
  failure(
    'Gitea API returned HTTP 405 for POST /api/v1/' +
    (action === 'reply'
      ? `${repoPath}/pulls/${number}/comments/${comment}/replies`
      : `${repoPath}/pulls/comments/${comment}/${action}`),
  );

const pullFields: Readonly<Record<string, unknown>> = {
  base: pull.base.ref,
  head: pull.head.ref,
  head_sha: pull.head.sha,
  number: pull.number,
  state: pull.state,
  title: pull.title,
  url: pull.html_url,
};
const pullFieldNames = new Set(Object.keys(pullFields));

export const pullView = (requested: string | undefined): StubResponse => {
  if (requested === undefined)
    return text(
      `#${String(pull.number)} ${pull.title} (${pull.state})\n` +
      `${pull.head.ref} → ${pull.base.ref}\n${pull.html_url}\n`,
    );
  const names = requested.split(',');
  const unknown = names.find(name => !pullFieldNames.has(name));
  return unknown === undefined
    ? json(Object.fromEntries(names.map(name => [name, pullFields[name]])))
    : failure(
        `unknown JSON field "${unknown}"\navailable fields: ${[...pullFieldNames].join(', ')}`,
      );
};

export const pullChecks = (): StubResponse => ({
  code: 1,
  stdout: jobs
    .map((job, index) =>
      [
        `/ ${job.name} (push)`,
        job.status,
        job.status === 'success' ? 'Successful in 34s' : 'Failing after 1m2s',
        `${host}/${repo}/actions/runs/${String(run.index)}/jobs/${String(index)}`,
      ].join('\t'),
    )
    .map(line => `${line}\n`)
    .join(''),
});

export const reviewList = (): StubResponse =>
  text(`${String(review.id)}\t${review.user.login}\tCommented\t${review.submitted_at}\t1\t\n`);

export const reviewComments = (): StubResponse =>
  text(
    `${String(reviewComment.id)}\t${reviewComment.path}:${String(reviewComment.position)}\t` +
    `${reviewComment.user.login}\t\t${reviewComment.body}\n`,
  );

export const runList = (): StubResponse => ({
  stderr:
    '! workflow listing is unsupported: the server does not provide ' +
    'GET /repos/{owner}/{repo}/actions/workflows\n',
  stdout: `${workflowRun.status}\t\t${String(run.id)}\t\t\t\t${workflowRun.trigger_event}\t\t\n`,
});

export const authStatus = (hasLogin: boolean): StubResponse =>
  text(
    (hasLogin ? `${host}\t${user}\ttrue\thttpsign\t\ttrue\t\t\t\n` : '') +
    `${otherHost}\t${user}\ttrue\thttpsign\t\ttrue\t\t\t\n`,
  );
