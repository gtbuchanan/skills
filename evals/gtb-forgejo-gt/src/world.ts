/*
 * The Forgejo world every scenario stands in, read by the gt double and by the
 * checker so the facts a run is judged against are the ones it was served.
 *
 * One world rather than one per scenario: the scenarios differ in what they ask
 * of the agent, not in what the instance holds. The workspace is a bare
 * directory, never a checkout, and gt holds a second login besides this one,
 * so every call has to name its host and repository.
 *
 * Loaded by the double under plain `node`, so everything here stays erasable
 * syntax.
 */

export const host = 'https://forgejo.example.com';
export const otherHost = 'https://gitea.com';
export const user = 'agent';
export const repo = 'acme/widgets';

/*
 * The agent-held key the login scenario names. Only the double accepts it, so a
 * login carrying it proves the run used the fingerprint it was given.
 */
export const keyFingerprint = 'SHA256:q3Vn8bXo4fJt0wKcR2yLm7hDsE9aPzUgN6iTvB1xQ5M';

export const pullIndex = 7;
export const headSha = '9f3c2ab41d7e8806c5b2f19a3e0d4c6b7a8e1f20';

export const review = {
  body: '',
  commit_id: headSha,
  id: 41,
  state: 'COMMENT',
  submitted_at: '2026-11-17T15:02:11Z',
  user: { login: 'reviewer' },
};

/*
 * The thread the reply scenario answers. Its path and position are what a reply
 * has to repeat to land beside it, and they appear nowhere but the double's
 * answers, so a reply carrying them proves the run read them.
 */
export const reviewComment = {
  body: 'This retries forever on a 4xx.',
  diff_hunk: '@@ -12,6 +12,9 @@ func retry(',
  id: 112,
  original_position: 18,
  path: 'internal/poll/retry.go',
  position: 18,
  pull_request_review_id: review.id,
  user: { login: 'reviewer' },
};

/*
 * The run behind the pull request's checks. Forgejo numbers it twice: the web
 * UI and the check links say run 2, the API knows it as 26. A run that asks the
 * API for run 2 gets nothing.
 */
export const run = { id: 26, index: 2 };

/*
 * The failing job and the one line of its log a report has to quote. Like the
 * comment's position, the line exists only in the double's answers.
 */
export const failingLine = '--- FAIL: TestRetryStopsOn4xx (0.02s)';

export const jobs = [
  {
    id: 40,
    log: 'ok  \tacme/widgets/internal/lint\t0.4s\n',
    name: 'lint',
    status: 'success',
  },
  {
    id: 41,
    log:
      '=== RUN   TestRetryStopsOn4xx\n' +
      '    retry_test.go:31: retried 5 times on 404\n' +
      `${failingLine}\n` +
      'FAIL\tacme/widgets/internal/poll\t0.02s\n',
    name: 'integration',
    status: 'failure',
  },
];

export const pull = {
  base: { ref: 'main', sha: '0b1e4c7d2a9f3e8b6c5d4a3f2e1d0c9b8a7f6e5d' },
  head: { ref: 'fix-retry-backoff', sha: headSha },
  html_url: `${host}/${repo}/pulls/${String(pullIndex)}`,
  number: pullIndex,
  state: 'open',
  title: 'Stop retrying client errors',
};
