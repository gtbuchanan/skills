#!/usr/bin/env node
/*
 * Fake `gh` for this eval.
 *
 * It never reaches the network: it answers from the canned scenarios in
 * `src/scenarios.ts`, picking the world by walking up from the working
 * directory to the marker the seed dropped, and records every invocation to
 * the log of the run that made it, so concurrent tests never share one.
 *
 * The body is why this logs more than argv. A squash message goes in on
 * standard input, which keeps it out of the command line entirely — so a log
 * of argv alone could not tell a message carrying the branch's trailers and
 * its other authors from one that dropped them, which is most of what this
 * suite is asking.
 *
 * The handlers are only what a merge motivates. Opening a pull request,
 * promoting it, reading review threads and replying to them are all absent,
 * and `dispatch` refuses anything no handler claimed — so a run that wandered
 * into them fails loudly here rather than being answered. That refusal is the
 * point: a double's fall-through is an answer, and exit 0 with no output reads
 * as "there is nothing here" to an agent that will act on it.
 *
 * Reached as `gh`: the runner installs a wrapper at the front of the eval PATH.
 * The real CLI is never reachable from a suite.
 */
import path from 'node:path';
import { branchAt } from '@gtbuchanan/git-fixtures/checkout';
import { stdinBody } from '@gtbuchanan/github-api-fake/body';
import { checksAnswer } from '@gtbuchanan/github-cli-stub/checks';
import { prRecords } from '@gtbuchanan/github-cli-stub/pr-records';
import { currentHead, impliedNumber } from '@gtbuchanan/github-cli-stub/pulls';
import { checksFor } from '@gtbuchanan/github-cli-stub/scenario-world';
import { pick, requestedFields } from '@gtbuchanan/github-cli-stub/selection';
import { readState, writeState } from '@gtbuchanan/github-cli-stub/state';
import { dispatch } from '@gtbuchanan/stub-runtime/dispatch';
import { allOf, argument, subcommand } from '@gtbuchanan/stub-runtime/match';
import { locateScenario } from '@gtbuchanan/stub-runtime/scenario';
import { argv, emit, joined, logCallToRun } from '@gtbuchanan/stub-runtime/stub';
import { repoSlug } from '#src/repository.ts';
import { scenarios } from '#src/scenarios.ts';

const stdin = stdinBody(argv);

const located = locateScenario(scenarios, process.cwd());
const scenario = located.scenario;

/* Logged after the scenario is known: a `gh` call outside every workspace
   cannot be answered at all, so locateScenario has already thrown above. */
const log = logCallToRun('gh', stdin);

/**
 * Where this scenario's workspace keeps what earlier calls did.
 */
const statePath = path.join(located.dir, '.eval-state.json');
const state = readState(statePath);

const head = (): string =>
  currentHead({
    argv,
    checkoutBranch: () => branchAt(located.dir),
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

const outcome = dispatch({ argv, cmd: 'gh', stdin }, [
  {
    matches: subcommand('repo', 'view'),
    name: 'repo view',
    respond: () => {
      /* The merge rules read this one field to decide who deletes the branch,
         and read it through `--jq`, which this double does not run. */
      if (joined.includes('deleteBranchOnMerge') && joined.includes('--jq'))
        return { stdout: `${String(scenario.deleteBranchOnMerge)}\n` };

      const narrowed = pick(records.repository(), requestedFields(argv));
      return { stdout: `${JSON.stringify(narrowed)}\n` };
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
    matches: allOf(subcommand('api'), argument(/\/merge-async/v)),
    name: 'asynchronous merge',
    respond: () => {
      writeState(statePath, {
        ...state,
        merged: [...state.merged, namedNumber() ?? scenario.pr?.number ?? 0],
      });
      /* The endpoint answers before the merge has happened, which is why the
         skill polls rather than treating this as done. */
      return { stdout: `${JSON.stringify({ status: 'pending' })}\n` };
    },
  },
  {
    matches: subcommand('pr', 'merge'),
    name: 'pr merge',
    respond: () => {
      if (scenario.isStackMember === true) {
        /* Membership is how a stack announces itself: `pr list` does not report
           it, so this refusal is the only way the skill finds out. */
        return {
          code: 1,
          stderr:
            'pull request is part of a stack and must be merged using the ' +
            'asynchronous merge REST API\n',
        };
      }

      /* --auto only defers the merge while something is outstanding. This
         world's checks decide which of those happened. */
      const number = namedNumber() ?? impliedNumber(state, scenario, head());
      const isDeferred = argv.includes('--auto') && scenario.checksPending === true;

      /* Recorded only when the merge actually happened. Writing it while the
         answer says the merge is deferred leaves the next process reading a
         pull request that is merged and absent from `pr list`, which is the
         opposite of what this scenario states and what its task asked for. */
      if (!isDeferred)
        writeState(statePath, { ...state, merged: [...state.merged, number] });

      return isDeferred
        ? {
            stdout:
              `✓ Pull request ${repoSlug}#${String(number)} will be ` +
              'automatically merged when all requirements are met\n',
          }
        : { stdout: `✓ Merged pull request ${repoSlug}#${String(number)}\n` };
    },
  },
]);

emit(outcome, log);
