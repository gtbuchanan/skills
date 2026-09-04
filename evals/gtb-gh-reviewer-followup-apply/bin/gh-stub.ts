#!/usr/bin/env node
/*
 * Fake `gh` for this write-path eval. It never touches the
 * network: it appends the invocation (argv) as a JSON line to $STUB_LOG so the
 * checker can assert exactly which GitHub calls the skill made, and returns
 * canned JSON so the skill can proceed.
 *
 * Reached as `gh`: the runner installs a wrapper into STUB_BINDIR, at the front
 * of the eval PATH, that execs this file. The real gh CLI is never reachable
 * from a suite.
 *
 * Failure injection: any invocation whose args contain the token FAIL exits
 * non-zero with an error, so a fixture can verify the skill reports the failure
 * instead of claiming success. It is first because it is a guard rather than a
 * command — it decides the outcome whatever was being asked.
 *
 * Anything unclaimed is refused rather than answered with an empty `{}`, which
 * reads as "there is nothing here" rather than "I don't know" — an agent acts
 * on it, and every assertion about what it did call still passes.
 */
import { argv, joined, logCall } from '@gtbuchanan/agent-skills-harness/stub';
import { dispatch } from '@gtbuchanan/github-cli-stub/dispatch';

logCall('gh');

/**
 * The thread a mutation names, as gh's `-f threadId=` spells it.
 */
const threadId = (): string =>
  /threadId=(?<threadId>\S+)/v.exec(joined)?.groups?.['threadId'] ?? '';

/**
 * The comment a REST path names.
 */
const commentId = (pattern: RegExp): string =>
  pattern.exec(joined)?.groups?.['id'] ?? '0';

const reactionsPath = /comments\/(?<id>\d+)\/reactions/v;
const repliesPath = /comments\/(?<id>\d+)\/replies/v;

const outcome = dispatch({ argv, stdin: '' }, [
  {
    matches: () => joined.includes('FAIL'),
    name: 'injected failure',
    respond: () => ({
      code: 1,
      stderr: 'gh: GraphQL: Could not resolve to a node (HTTP 422)\n',
    }),
  },
  {
    /* Checked before `resolveReviewThread`, which is a substring of it — a
       plain match on the shorter name would swallow every unresolve call. */
    matches: () => joined.includes('unresolveReviewThread'),
    name: 'unresolveReviewThread',
    respond: () => ({
      stdout: JSON.stringify({
        data: {
          unresolveReviewThread: { thread: { id: threadId(), isResolved: false } },
        },
      }),
    }),
  },
  {
    matches: () => joined.includes('resolveReviewThread'),
    name: 'resolveReviewThread',
    respond: () => ({
      stdout: JSON.stringify({
        data: {
          resolveReviewThread: { thread: { id: threadId(), isResolved: true } },
        },
      }),
    }),
  },
  {
    matches: () => reactionsPath.test(joined),
    name: 'comment reactions',
    respond: () => ({
      stdout: JSON.stringify({
        content: 'rocket',
        id: Number(commentId(reactionsPath)) + 1,
      }),
    }),
  },
  {
    matches: () => repliesPath.test(joined),
    name: 'comment replies',
    respond: () => {
      const id = commentId(repliesPath);

      return {
        stdout: JSON.stringify({
          html_url: `https://example.test/pull/42#discussion_r${id}`,
          id: Number(id) + 1,
        }),
      };
    },
  },
  {
    matches: () => joined.includes('api user'),
    name: 'api user',
    respond: () => ({ stdout: JSON.stringify({ login: 'reviewer' }) }),
  },
  {
    matches: () => joined.includes('repo view'),
    name: 'repo view',
    respond: () => ({ stdout: JSON.stringify({ nameWithOwner: 'acme/widgets' }) }),
  },
]);

process.stdout.write(outcome.stdout);
process.stderr.write(outcome.stderr);
process.exit(outcome.code);
