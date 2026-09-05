#!/usr/bin/env node
/*
 * Fake `gh` for this eval.
 *
 * It never reaches the network. What it has to get right is narrower than the
 * authoring suite's double: this eval asks how many pull requests the work
 * became and where each one started, so `pr create` has to mint a distinct
 * number per call and remember the branch it came from. A double that answers
 * every create identically makes an agent that opened two indistinguishable
 * from one that opened the same one twice — which is exactly the question.
 *
 * Anything unclaimed is refused. The agent is not running with the authoring
 * skill loaded, so what it reaches for beyond creating is its own invention,
 * and inventing an answer for it would be this suite measuring the double.
 *
 * Reached as `gh`: the runner installs a wrapper at the front of the eval PATH.
 * The real CLI is never reachable from a suite.
 */
import path from 'node:path';
import { appendJsonl, argv, joined } from '@gtbuchanan/agent-skills-harness/stub';
import { dispatch } from '@gtbuchanan/github-cli-stub/dispatch';
import { currentHead, nextPrNumber } from '@gtbuchanan/github-cli-stub/pulls';
import { pick, requestedFields } from '@gtbuchanan/github-cli-stub/selection';
import { readState, writeState } from '@gtbuchanan/github-cli-stub/state';
import { branchAt } from '#src/checkout.ts';
import { baseBranch, repoSlug, viewer } from '#src/repository.ts';
import { locateScenario } from '#src/world.ts';

const located = locateScenario(process.cwd());
const scenario = located.scenario;

const logDir = process.env['STUB_LOG_DIR'];
if (logDir !== undefined)
  appendJsonl(path.join(logDir, `${scenario.key}.jsonl`), {
    argv,
    cmd: 'gh',
    stdin: '',
  });

const statePath = path.join(located.dir, '.eval-state.json');
const state = readState(statePath);

/**
 * The world this suite seeds has no pull requests until the run opens them, so
 * identity is decided entirely by what `pr create` recorded.
 */
const world = { dependents: [] };

const head = (): string =>
  currentHead({
    argv,
    checkoutBranch: () => branchAt(located.dir),
    fallback: scenario.branch,
  });

const flagValue = (flag: string): string | undefined => {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
};

/**
 * Everything `repo view` can answer, for `pick` to narrow.
 *
 * The merge settings are here because the skill tells the agent to check them:
 * how many pull requests the work is worth depends on whether the branch's
 * commits survive the merge, and it says to ask rather than assume.
 */
const repoRecord: Record<string, unknown> = {
  defaultBranchRef: { name: baseBranch },
  mergeCommitAllowed: false,
  nameWithOwner: repoSlug,
  rebaseMergeAllowed: false,
  squashMergeAllowed: true,
};

const outcome = dispatch({ argv, stdin: '' }, [
  {
    matches: () => joined.includes('api user'),
    name: 'api user',
    respond: () => ({ stdout: `${viewer}\n` }),
  },
  {
    matches: () => joined.includes('repo view'),
    name: 'repo view',
    respond: () => ({
      stdout: `${JSON.stringify(pick(repoRecord, requestedFields(argv)))}\n`,
    }),
  },
  {
    matches: () => joined.includes('pr create'),
    name: 'pr create',
    respond: () => {
      const number = nextPrNumber(state, world);
      const branch = head();

      writeState(statePath, {
        ...state,
        opened: {
          ...state.opened,
          [String(number)]: {
            baseRefName: flagValue('--base') ?? baseBranch,
            body: '',
            headRefName: branch,
            title: flagValue('--title') ?? '',
          },
        },
        ready: argv.includes('--draft') ? state.ready : [...state.ready, number],
      });

      return {
        stdout: `https://github.com/${repoSlug}/pull/${String(number)}\n`,
      };
    },
  },
]);

process.stdout.write(outcome.stdout);
process.stderr.write(outcome.stderr);
process.exit(outcome.code);
