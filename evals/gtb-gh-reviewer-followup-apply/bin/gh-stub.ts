#!/usr/bin/env node
// Fake `gh` for this write-path eval: logs each call and answers from canned JSON.
import { type StubOutcome, dispatch } from '@gtbuchanan/cli-doubles/dispatch';
import { allOf, argument, subcommand } from '@gtbuchanan/cli-doubles/match';
import { findScenario } from '@gtbuchanan/cli-doubles/scenario';
import {
  argv,
  emit,
  joined,
  logCallToRun,
  runLogInFlight,
} from '@gtbuchanan/cli-doubles/stub';
import { stdinBody } from '@gtbuchanan/github-cli-stub/body';
import { scenarios } from '#src/scenarios.ts';

// Undefined for a call made outside every scenario, which is refused below.
const scenario = findScenario(scenarios, process.cwd())?.scenario;

/* Logged beside argv because gh reads a reply's body from standard input, so
   argv alone cannot show what was posted. */
const stdin = stdinBody(argv);

const call = { argv, cmd: 'gh', stdin };

/* A call outside every scenario goes into the run's log only as its refusal,
   which emit records below: the checker still sees a withheld thread it
   names, and never counts it as a call that happened. */
const log = scenario === undefined ? runLogInFlight() : logCallToRun('gh', stdin);

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

const handlers = [
  {
    /* First, because it decides the outcome whatever was asked: a fixture
       names FAIL to check that the skill reports a failed call. */
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
];

const outcome: StubOutcome = scenario === undefined
  ? {
      call,
      code: 1,
      kind: 'refused',
      reason: 'called outside every scenario',
      stderr: `gh-stub: no scenario at or above ${process.cwd()}\n`,
      stdout: '',
    }
  : dispatch(call, handlers);

emit(outcome, log);
