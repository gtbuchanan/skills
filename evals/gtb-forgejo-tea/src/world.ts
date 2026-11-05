/*
 * The Forgejo world every scenario stands in, read by the tea double and by the
 * checker so the facts a run is judged against are the ones it was served.
 *
 * One world rather than one per scenario: the scenarios differ in what they ask
 * of the agent, not in what the instance holds. The workspace is a bare
 * directory, never a checkout, so every call has to name its login and
 * repository.
 *
 * Loaded by the double under plain `node`, so everything here stays erasable
 * syntax.
 */

export const host = 'https://forgejo.example.com';
export const login = 'work';
export const repo = 'acme/widgets';

export const pullIndex = 7;
export const headSha = '9f3c2ab41d7e8806c5b2f19a3e0d4c6b7a8e1f20';

export const review = {
  body: '',
  commit_id: headSha,
  id: 41,
  state: 'COMMENT',
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
 * The failing context is the one a report has to name, and like the comment's
 * position it exists only here.
 */
export const failingContext = 'ci/integration';

export const combinedStatus = {
  sha: headSha,
  state: 'failure',
  statuses: [
    { context: 'ci/lint', description: 'Lint passed', state: 'success' },
    { context: failingContext, description: '3 tests failed', state: 'failure' },
  ],
  total_count: 2,
};

export const pull = {
  base: { ref: 'main', sha: '0b1e4c7d2a9f3e8b6c5d4a3f2e1d0c9b8a7f6e5d' },
  head: { ref: 'fix-retry-backoff', sha: headSha },
  html_url: `${host}/${repo}/pulls/${String(pullIndex)}`,
  number: pullIndex,
  state: 'open',
  title: 'Stop retrying client errors',
};
