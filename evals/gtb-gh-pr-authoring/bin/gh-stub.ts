#!/usr/bin/env node
/*
 * Fake `gh` for this eval.
 *
 * It never reaches the network: it answers from the canned scenarios in
 * `src/scenarios.ts`, picking the world by walking up from the working
 * directory to the marker the seed dropped, and records every invocation to
 * the log of the run that made it, so concurrent tests never share one.
 *
 * The body is why this logs more than argv. The skill is supposed to pass
 * prose on standard input (`--body-file -`), which keeps it out of the command
 * line entirely — so a log of argv alone could not tell a filled-in template
 * from an empty one, nor a squash message carrying the branch's trailers from
 * one that dropped them.
 *
 * What each command answers with is `@gtbuchanan/github-cli-stub/pr-records`,
 * because none of it is particular to this suite. What stays here is the list
 * of commands this suite's scenarios motivate — and nothing else, because
 * `dispatch` refuses anything no handler claimed. A double's fall-through is
 * an answer: exit 0 with no output reads as "there is nothing here", and an
 * agent believes it while every assertion about what it *did* call still
 * passes.
 *
 * Reached as `gh`: the runner installs a wrapper at the front of the eval PATH.
 * The real CLI is never reachable from a suite.
 */
import path from 'node:path';
import { dispatch } from '@gtbuchanan/cli-doubles/dispatch';
import { allOf, argument, subcommand } from '@gtbuchanan/cli-doubles/match';
import { requireRealTool } from '@gtbuchanan/cli-doubles/real-tool';
import { locateScenario } from '@gtbuchanan/cli-doubles/scenario';
import { argv, emit, joined, logCallToRun } from '@gtbuchanan/cli-doubles/stub';
import { branchAt } from '@gtbuchanan/git-fixtures/checkout';
import { stdinBody } from '@gtbuchanan/github-cli-stub/body';
import { checksAnswer } from '@gtbuchanan/github-cli-stub/checks';
import { prRecords, toWireComment } from '@gtbuchanan/github-cli-stub/pr-records';
import {
  currentHead,
  hasOpenPrFrom,
  impliedNumber,
  nextPrNumber,
} from '@gtbuchanan/github-cli-stub/pulls';
import { checksFor } from '@gtbuchanan/github-cli-stub/scenario-world';
import { pick, requestedFields } from '@gtbuchanan/github-cli-stub/selection';
import { readState, writeState } from '@gtbuchanan/github-cli-stub/state';
import { baseBranch, repoSlug, viewer } from '#src/repository.ts';
import { scenarios } from '#src/scenarios.ts';

const stdin = stdinBody(argv);

const located = locateScenario(scenarios, process.cwd());
const scenario = located.scenario;

/* Logged after the scenario is known: a `gh` call outside every checkout
   cannot be answered at all, so locateScenario has already thrown above. */
const log = logCallToRun('gh', stdin);

/**
 * Where this scenario's checkout keeps what earlier calls did.
 */
const statePath = path.join(located.dir, '.eval-state.json');
const state = readState(statePath);

const head = (): string =>
  currentHead({
    argv,
    checkoutBranch: () => branchAt(located.dir, requireRealTool('git')),
    fallback: scenario.branch,
  });

const records = prRecords({ head, repoSlug, scenario, state });

/**
 * The pull request number the call names — the first bare integer argument.
 */
const namedNumber = (): number | undefined => {
  const found = argv.find(arg => /^\d+$/v.test(arg));
  return found === undefined ? undefined : Number(found);
};

const flagValue = (flag: string): string | undefined => {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
};

/**
 * `gh` prints a bare scalar when `--jq` selects one, and JSON otherwise. This
 * does not run jq, so it emulates the selections the skill actually makes.
 */
const isSelectsBody = joined.includes('.body');

const outcome = dispatch({ argv, cmd: 'gh', stdin }, [
  {
    matches: allOf(subcommand('api'), argument(/^user$/v)),
    name: 'api user',
    respond: () => ({ stdout: `${viewer}\n` }),
  },
  {
    matches: subcommand('repo', 'view'),
    name: 'repo view',
    respond: () => {
      /* One record, then `pick` narrows it. Answering each field from its own
         branch meant asking for two at once returned only one of them. */
      if (isSelectsBody && joined.includes('pullRequestTemplates'))
        return { stdout: `${scenario.template ?? ''}\n` };
      if (joined.includes('deleteBranchOnMerge') && joined.includes('--jq'))
        return { stdout: `${String(scenario.deleteBranchOnMerge)}\n` };

      return {
        stdout: `${JSON.stringify(pick(records.repository(), requestedFields(argv)))}\n`,
      };
    },
  },
  {
    matches: subcommand('pr', 'list'),
    name: 'pr list',
    respond: () => ({
      stdout: `${JSON.stringify(
        records.listing(argv).map(record => pick(record, requestedFields(argv))),
      )}\n`,
    }),
  },
  {
    matches: subcommand('pr', 'checks'),
    name: 'pr checks',
    respond: () => checksAnswer(checksFor(scenario), { argv, branch: scenario.branch, repoSlug }),
  },
  {
    matches: subcommand('pr', 'view'),
    name: 'pr view',
    respond: () => {
      const viewed = pick(records.named(namedNumber()), requestedFields(argv));
      return { stdout: `${JSON.stringify(viewed)}\n` };
    },
  },
  {
    matches: allOf(subcommand('api'), argument(/\/replies/v)),
    name: 'review comment reply',
    respond: () => ({ stdout: `${JSON.stringify({ id: 9001 })}\n` }),
  },
  {
    /* Checked after the reply endpoint, which extends this one — a reply path
       ends `/comments/<id>/replies`, so the shorter pattern claims it too. */
    matches: allOf(subcommand('api'), argument(/\/pulls\/\d+\/comments/v)),
    name: 'review comments',
    respond: () => ({
      stdout: `${JSON.stringify(scenario.reviewComments.map(toWireComment))}\n`,
    }),
  },
  {
    matches: subcommand('pr', 'create'),
    name: 'pr create',
    respond: () => {
      const branch = head();
      if (hasOpenPrFrom(state, scenario, branch)) {
        return {
          code: 1,
          stderr:
            `a pull request for branch '${branch}' into branch ` +
            `'${baseBranch}' already exists\n`,
        };
      }

      const number = nextPrNumber(state, scenario);
      writeState(statePath, {
        ...state,
        opened: {
          ...state.opened,
          [String(number)]: {
            baseRefName: flagValue('--base') ?? baseBranch,
            body: stdin,
            headRefName: branch,
            title: flagValue('--title') ?? '',
          },
        },
        ready: argv.includes('--draft') ? state.ready : [...state.ready, number],
      });

      return { stdout: `${records.url(number)}\n` };
    },
  },
  {
    matches: subcommand('pr', 'ready'),
    name: 'pr ready',
    respond: () => {
      const number = namedNumber() ?? impliedNumber(state, scenario, head());
      writeState(statePath, { ...state, ready: [...state.ready, number] });
      return {
        stdout: `✓ Pull request ${repoSlug}#${String(number)} is marked as ready\n`,
      };
    },
  },
  {
    matches: subcommand('pr', 'edit'),
    name: 'pr edit',
    respond: () => {
      const base = flagValue('--base');
      const number = namedNumber() ?? scenario.pr?.number ?? 0;
      if (base !== undefined) {
        writeState(statePath, {
          ...state,
          retargeted: { ...state.retargeted, [String(number)]: base },
        });
      }

      return { stdout: `${records.url(number)}\n` };
    },
  },
  {
    matches: subcommand('pr', 'comment'),
    name: 'pr comment',
    respond: () => ({
      stdout: `${records.url(namedNumber() ?? 0)}#issuecomment-1\n`,
    }),
  },
  {
    matches: allOf(subcommand('api'), argument(/\/merge-async/v)),
    name: 'asynchronous merge',
    respond: () => {
      writeState(statePath, {
        ...state,
        merged: [...state.merged, namedNumber() ?? scenario.pr?.number ?? 0],
      });
      return { stdout: `${JSON.stringify({ status: 'pending' })}\n` };
    },
  },
  {
    matches: subcommand('pr', 'merge'),
    name: 'pr merge',
    respond: () => {
      if (scenario.isStackMember === true) {
        return {
          code: 1,
          stderr:
            'pull request is part of a stack and must be merged using the ' +
            'asynchronous merge REST API\n',
        };
      }

      /* --auto only defers the merge when something is outstanding; nothing
         here is, so it lands now and the record has to say so. */
      const number = namedNumber() ?? impliedNumber(state, scenario, head());
      writeState(statePath, { ...state, merged: [...state.merged, number] });
      return { stdout: `✓ Merged pull request ${repoSlug}#${String(number)}\n` };
    },
  },
]);

emit(outcome, log);
