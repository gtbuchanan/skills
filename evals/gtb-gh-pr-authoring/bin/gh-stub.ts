#!/usr/bin/env node
/*
 * Fake `gh` for the gtb-gh-pr-authoring eval.
 *
 * It never reaches the network: it records every invocation to $STUB_LOG and
 * answers from ../scenarios.ts, picking the world by walking up from the
 * working directory to the marker file the seed dropped. authoring-check.ts
 * reads the log to assert which calls the skill made, in what order, and with
 * what body.
 *
 * The body is the reason this stub logs more than argv. The skill is supposed
 * to pass prose on standard input (`--body-file -`), which keeps it out of the
 * command line entirely — so a log of argv alone could not tell a filled-in
 * template from an empty one, nor a squash message carrying the branch's
 * trailers from one that dropped them. When the call names stdin, the stub
 * reads it and records it alongside.
 *
 * Fidelity matters more here than convenience, in two places that were got
 * wrong first time round and silently invalidated the assertions built on them:
 *
 *   `--json` selects. Real gh returns exactly the fields asked for, so a stub
 *   that returns everything hands the agent surfaces it never requested — and
 *   "did it read the reviews?" then passes for an agent that never looked.
 *
 *   `pr list --base` filters, and `pr view <n>` serves the PR named. Answering
 *   every question with the scenario's own PR makes a dependent look like the
 *   one being merged, which is exactly the confusion the merge rules exist to
 *   prevent.
 *
 * Unrecognised calls, unknown fields and unknown PR numbers all fail loudly
 * rather than returning empty success. A stub's fall-through is an answer: exit
 * 0 with no output reads as "there is nothing here", and an agent will believe
 * it — an empty template, no dependent PRs, no review comments — and go on to
 * do the wrong thing while every assertion about what it *did* call passes.
 *
 * Reached as `gh`: the runner installs a wrapper at the front of the eval PATH.
 * The real CLI is never reachable from a suite.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type ReviewCommentEntry, repoSlug, viewer } from '../scenarios.ts';
import { locateScenario } from '../world.ts';
import { appendJsonl, argv, joined, writeLine } from '#lib/stub.ts';

/**
 * The body arrives on standard input only when the call asks for it. Reading
 * unconditionally would block on the calls that do not.
 */
const bodyFlags = new Set(['--body-file', '--field', '--input', '-F']);

const isWantsStdin =
  argv.some(arg => arg.endsWith('=@-')) ||
  argv.some((arg, index) => bodyFlags.has(arg) && argv[index + 1] === '-');

const stdinDescriptor = 0;

const readStdin = (): string => {
  try {
    return readFileSync(stdinDescriptor, 'utf8');
  } catch {
    /* No stdin attached: the call named it but nothing was piped, which is
       itself evidence the checker should see as an empty body. */
    return '';
  }
};

const stdin = isWantsStdin ? readStdin() : '';

const stubLog = process.env['STUB_LOG'];
if (stubLog) appendJsonl(stubLog, { argv, cmd: 'gh', stdin });

const located = locateScenario(process.cwd());
const scenario = located.scenario;

/**
 * An asynchronous merge finishes in a later process than the one that started
 * it, so the fact has to outlive both. The checkout is where they can agree.
 */
const mergedMarker = path.join(located.dir, '.eval-merged');
const isMerged = (): boolean => existsSync(mergedMarker);

/**
 * Stops the call, naming what was not canned — see the header.
 */
const refuse = (what: string): never => {
  process.stderr.write(
    `gh-stub: ${what} for "gh ${joined}" in scenario "${scenario.key}". ` +
    'Model it rather than letting the call return empty success.\n',
  );
  process.exit(1);
};

/**
 * The fields `--json` asked for, in order. Empty when the flag is absent.
 */
const requestedFields = (): string[] => {
  const flag = argv.indexOf('--json');
  if (flag === -1) return [];

  return (argv[flag + 1] ?? '')
    .split(',')
    .map(field => field.trim())
    .filter(Boolean);
};

/**
 * `gh` returns exactly the fields named and rejects any it does not know, so an
 * unmodelled one is a gap in this stub rather than something to skip over.
 */
const pick = (record: Record<string, unknown>): unknown => {
  const fields = requestedFields();
  if (fields.length === 0) return record;

  const known = new Set(Object.keys(record));
  const missing = fields.filter(field => !known.has(field));
  if (missing.length > 0)
    refuse(`unmodelled --json field(s) ${missing.join(', ')}`);

  return Object.fromEntries(fields.map(field => [field, record[field]]));
};

/**
 * The PR number the call names — the first bare integer argument.
 */
const namedNumber = (): number | undefined => {
  const found = argv.find(arg => /^\d+$/v.test(arg));
  return found === undefined ? undefined : Number(found);
};

/**
 * The PR gh pr create reports having opened. Any number the scenarios do
 * not already use will do; it only has to look like a real URL.
 */
const createdPrNumber = 101;

const prUrl = (number: number): string =>
  `https://github.com/${repoSlug}/pull/${String(number)}`;

/**
 * The mergeability fields an agent checks before merging. Constant because no
 * scenario turns on them — but modelled rather than refused, since a PR the
 * suite says is approved and green should answer that question when asked.
 */
const readiness = (reviews: readonly { readonly state: string }[]): Record<string, unknown> => ({
  mergeable: 'MERGEABLE',
  reviewDecision: reviews.some(review => review.state === 'APPROVED')
    ? 'APPROVED'
    : 'REVIEW_REQUIRED',
  statusCheckRollup: [
    { conclusion: 'SUCCESS', name: 'build', status: 'COMPLETED' },
  ],
});

/**
 * The PR with this number: the scenario's own, or one of the dependents stacked
 * on its branch. A dependent is modelled fully enough to be told apart from the
 * PR being merged — its own number and head, and a base pointing at the branch
 * that is about to disappear.
 */
const prRecordFor = (number: number | undefined): Record<string, unknown> => {
  const own = scenario.pr;
  if (own !== undefined && (number === undefined || number === own.number)) {
    return {
      ...own,
      ...readiness(scenario.reviews),
      comments: scenario.comments,
      reviews: scenario.reviews,
      state: isMerged() ? 'MERGED' : 'OPEN',
      url: prUrl(own.number),
    };
  }

  const dependent = scenario.dependents.find(other => other.number === number);
  if (dependent === undefined)
    return refuse(`no pull request ${String(number ?? 0)}`);

  return {
    ...readiness([]),
    baseRefName: scenario.branch,
    body: '',
    comments: [],
    headRefName: dependent.headRefName,
    isDraft: false,
    number: dependent.number,
    reviews: [],
    state: 'OPEN',
    title: dependent.title,
    url: prUrl(dependent.number),
  };
};

/**
 * Every open PR in the world: the scenario's own and anything stacked on its
 * branch. `pr list` shows the lot, exactly as it would in a real repository —
 * an agent that lists them all and reads `baseRefName` is doing the same work
 * as one that passes `--base`, so the double must not force the flag.
 */
const allRecords = (): Record<string, unknown>[] => [
  ...(scenario.pr === undefined ? [] : [prRecordFor(scenario.pr.number)]),
  ...scenario.dependents.map(dependent => prRecordFor(dependent.number)),
];

/**
 * `pr list`, honouring `--base` when it is given.
 */
const listRecords = (): Record<string, unknown>[] => {
  const flag = argv.indexOf('--base');
  const base = flag === -1 ? undefined : argv[flag + 1];

  return allRecords().filter(
    record => base === undefined || record['baseRefName'] === base,
  );
};

/**
 * A review comment as the REST endpoint returns it. A thread root is stated
 * there as an explicit null, and the skill keys on exactly that, so the wire
 * shape has to carry it rather than omitting the field.
 */
const toWireComment = (comment: ReviewCommentEntry): unknown => ({
  ...comment,
  /* eslint-disable-next-line unicorn/no-null --
     null is the value GitHub sends for a thread root; undefined would drop the
     key entirely and stop the suite exercising the rule that reads it. */
  in_reply_to_id: comment.in_reply_to_id ?? null,
});

const templates = scenario.template === undefined
  ? []
  : [{ body: scenario.template, filename: 'pull_request_template.md' }];

/**
 * `gh` prints a bare scalar when `--jq` selects one, and JSON otherwise. The
 * stub does not run jq, so it emulates the selections the skill actually makes.
 */
const isSelectsBody = joined.includes('.body');

if (joined.includes('api user')) {
  writeLine(viewer);
} else if (joined.includes('repo view')) {
  if (joined.includes('pullRequestTemplates')) {
    if (isSelectsBody) writeLine(scenario.template ?? '');
    else writeLine(JSON.stringify(pick({ pullRequestTemplates: templates })));
  } else if (joined.includes('deleteBranchOnMerge')) {
    const isValue = scenario.deleteBranchOnMerge;
    if (joined.includes('--jq')) writeLine(String(isValue));
    else writeLine(JSON.stringify(pick({ deleteBranchOnMerge: isValue })));
  } else {
    writeLine(JSON.stringify(pick({ nameWithOwner: repoSlug })));
  }
} else if (joined.includes('pr list')) {
  const listed = listRecords().map(record => pick(record));
  writeLine(JSON.stringify(listed));
} else if (joined.includes('pr checks')) {
  writeLine('All checks were successful');
} else if (joined.includes('pr view')) {
  const viewed = pick(prRecordFor(namedNumber()));
  writeLine(JSON.stringify(viewed));
} else if (joined.includes('/replies')) {
  writeLine(JSON.stringify({ id: 9001 }));
} else if (/\/pulls\/\d+\/comments/v.test(joined)) {
  writeLine(JSON.stringify(scenario.reviewComments.map(toWireComment)));
} else if (joined.includes('pr create')) {
  writeLine(prUrl(createdPrNumber));
} else if (joined.includes('pr ready')) {
  writeLine(
    `✓ Pull request ${repoSlug}#${String(namedNumber() ?? 0)} is marked as ready`,
  );
} else if (joined.includes('pr edit')) {
  writeLine(prUrl(namedNumber() ?? 0));
} else if (joined.includes('pr comment')) {
  writeLine(`${prUrl(namedNumber() ?? 0)}#issuecomment-1`);
} else if (joined.includes('merge-async')) {
  writeFileSync(mergedMarker, 'merged\n');
  writeLine(JSON.stringify({ status: 'pending' }));
} else if (joined.includes('pr merge')) {
  if (scenario.isStackMember === true) {
    process.stderr.write(
      'pull request is part of a stack and must be merged using the ' +
      'asynchronous merge REST API\n',
    );
    process.exit(1);
  }
  writeLine(`✓ Merged pull request ${repoSlug}#${String(namedNumber() ?? 0)}`);
} else {
  refuse('no canned response');
}

process.exit(0);
