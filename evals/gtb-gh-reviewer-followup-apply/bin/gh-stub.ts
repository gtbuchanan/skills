#!/usr/bin/env node
/*
 * Fake `gh` for this write-path eval. It never touches the
 * network: it appends the invocation as a JSON line to $STUB_LOG so the
 * checker can assert exactly which GitHub calls the skill made, and returns
 * canned JSON so the skill can proceed.
 *
 * The line carries the body as well as argv, because a reply body does not
 * appear in argv at all: gh takes prose on standard input, which is what keeps
 * a reply's backticks and fenced blocks intact. A log of argv alone would hand
 * the checker a posted reply it cannot read, and the suite would fail a run
 * that did exactly the right thing.
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
import { stdinBody } from '@gtbuchanan/github-cli-stub/body';
import { dispatch } from '@gtbuchanan/stub-runtime/dispatch';
import { allOf, argument, subcommand } from '@gtbuchanan/stub-runtime/match';
import { argv, emit, joined, logCall } from '@gtbuchanan/stub-runtime/stub';

const stdin = stdinBody(argv);

logCall('gh', stdin);

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

const outcome = dispatch({ argv, cmd: 'gh', stdin }, [
  {
    matches: argument(/FAIL/v),
    name: 'injected failure',
    respond: () => ({
      code: 1,
      stderr: 'gh: GraphQL: Could not resolve to a node (HTTP 422)\n',
    }),
  },
  {
    /* Checked before `resolveReviewThread`, which is a substring of it — a
       plain match on the shorter name would swallow every unresolve call. */
    matches: allOf(subcommand('api'), argument(/unresolveReviewThread/v)),
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
    matches: allOf(subcommand('api'), argument(/resolveReviewThread/v)),
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
    matches: allOf(subcommand('api'), argument(reactionsPath)),
    name: 'comment reactions',
    respond: () => ({
      stdout: JSON.stringify({
        content: 'rocket',
        id: Number(commentId(reactionsPath)) + 1,
      }),
    }),
  },
  {
    matches: allOf(subcommand('api'), argument(repliesPath)),
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
    matches: allOf(subcommand('api'), argument(/^user$/v)),
    name: 'api user',
    respond: () => ({ stdout: JSON.stringify({ login: 'reviewer' }) }),
  },
  {
    matches: subcommand('repo', 'view'),
    name: 'repo view',
    respond: () => ({ stdout: JSON.stringify({ nameWithOwner: 'acme/widgets' }) }),
  },
]);

emit(outcome);
