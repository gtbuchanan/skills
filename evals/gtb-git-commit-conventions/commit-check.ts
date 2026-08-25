/*
 * promptfoo javascript assertion for the gtb-git-commit-conventions suite.
 *
 * The commits the agent wrote ARE the output, so this reads them back out of
 * the seeded repository with real git and checks them against the skill's
 * rules. Everything the baseline tip does not reach is the agent's work.
 *
 * The message rules themselves are pure and live in message-rules.ts. What is
 * here is the part that needs a repository: reading the new commits, the checks
 * that span several of them, and the per-scenario composition. A few rules are
 * universal and run on every commit a test produces; the rest are opt-in
 * through the vars VarsSchema declares, because they are what that particular
 * scenario is about.
 *
 * Checks are stated over the new commits as a set rather than by position,
 * because how the work is divided is the agent's call — the suite asserts the
 * division is defensible, not that it matches one particular split.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import type { NewCommit } from './message-rules.ts';
import {
  grammarProblems,
  label,
  linesBeforeBody,
  revertSubject,
  shapeProblems,
  short,
  staleFactProblems,
  universalProblems,
} from './message-rules.ts';
import { scenarioPath, scenarios } from './scenarios.ts';
import { baselinesPath } from './setup.ts';
import type { AssertionResult } from '#lib/assert.ts';
import { fromProblems } from '#lib/assert.ts';
import { parseJson } from '#lib/calls.ts';
import { skillsRoot } from '#lib/paths.ts';
import { resolveRealGit } from '#lib/real-git.ts';
import type { GitRunner } from '#lib/seed-repo.ts';
import { captureGit, probeGit } from '#lib/seed-repo.ts';

// Extracted rather than inlined to keep the schema call nesting shallow.
const StringListSchema = v.array(v.string());
const GroupListSchema = v.array(StringListSchema);
const ShaMapSchema = v.record(v.string(), v.string());

const BaselineSchema = v.object({ shas: ShaMapSchema, tip: v.string() });
const BaselinesSchema = v.record(v.string(), BaselineSchema);

const RevertSchema = v.object({ baseKey: v.string(), targetKey: v.string() });
const TrailerSchema = v.object({ key: v.string(), value: v.string() });
const TrailerListSchema = v.array(TrailerSchema);
const GrammarSchema = v.picklist(['any', 'conventional', 'plain']);

const VarsSchema = v.object({
  absentTrailers: v.optional(TrailerListSchema, []),
  body: v.optional(v.boolean(), false),
  cleanTree: v.optional(v.boolean(), false),
  disjointGroups: v.optional(GroupListSchema, []),
  maxCommits: v.optional(v.number()),
  minCommits: v.optional(v.number(), 0),
  noStaleFacts: v.optional(v.boolean(), false),
  revert: v.optional(RevertSchema),
  scenario: v.string(),
  subjectGrammar: v.optional(GrammarSchema, 'any'),
  subjectShape: v.optional(v.boolean(), false),
  trailers: v.optional(TrailerListSchema, []),
});

type Vars = v.InferOutput<typeof VarsSchema>;
type Revert = v.InferOutput<typeof RevertSchema>;
type Trailer = v.InferOutput<typeof TrailerSchema>;

const readBaselines = (): v.InferOutput<typeof BaselinesSchema> => {
  const raw = readFileSync(baselinesPath(), 'utf8');

  return v.parse(BaselinesSchema, parseJson(raw));
};

/**
 * Every commit reachable from HEAD but not from the baseline tip, oldest first.
 */
const readNewCommits = (runner: GitRunner, tip: string): NewCommit[] => {
  const listed = captureGit(runner, ['rev-list', '--reverse', `${tip}..HEAD`]);
  if (listed === '') return [];

  return listed.split('\n').map((sha) => {
    const message = captureGit(runner, ['log', '-1', '--format=%B', sha]);
    const files = captureGit(runner, ['show', '--name-only', '--format=', sha]);

    return {
      files: files === '' ? [] : files.split('\n'),
      message,
      sha,
      subject: message.split('\n', 1)[0] ?? '',
    };
  });
};

/**
 * No commit may span two groups — that is the tangle the split was supposed to
 * undo. Files outside every group are ignored, so a scenario names only the
 * paths it cares about.
 */
const disjointProblems = (
  commits: readonly NewCommit[],
  groups: readonly (readonly string[])[],
): string[] =>
  commits.flatMap((commit) => {
    const hit = groups
      .map(group => commit.files.filter(file => group.includes(file)))
      .filter(files => files.length > 0);

    return hit.length > 1
      ? [
          `${label(commit)}: spans ${String(hit.length)} unrelated groups ` +
          `(${hit.map(files => files.join(', ')).join(' | ')})`,
        ]
      : [];
  });

/**
 * Trailers are checked by asking git rather than by matching raw text: only the
 * final paragraph parses as trailers, so a block buried mid-message would
 * satisfy a regex while being invisible to every tool that consumes trailers.
 */
const parsedTrailers = (runner: GitRunner, message: string): string[] => {
  const parsed = probeGit(runner, ['interpret-trailers', '--parse'], {
    input: message,
  }).stdout.trim();

  return parsed === '' ? [] : parsed.split('\n');
};

/**
 * Key compared case-insensitively, as git treats it, but the value exactly: a
 * substring match would let `Resolves: #4820` satisfy a required `#482`, which
 * is a different issue entirely.
 */
const hasTrailer = (lines: readonly string[], want: Trailer): boolean =>
  lines.some((line) => {
    const at = line.indexOf(':');
    if (at === -1) return false;

    return (
      line.slice(0, at).toLowerCase() === want.key.toLowerCase() &&
      line.slice(at + 1).trim() === want.value
    );
  });

const trailerProblems = (
  runner: GitRunner,
  commits: readonly NewCommit[],
  vars: Vars,
): string[] => {
  const all = commits.flatMap(commit => parsedTrailers(runner, commit.message));
  const summary = all.join(' / ') || 'none';

  return [
    ...vars.trailers
      .filter(want => !hasTrailer(all, want))
      .map(
        want =>
          `no parsed trailer "${want.key}: …${want.value}" (parsed: ${summary})`,
      ),
    ...vars.absentTrailers
      .filter(unwanted => hasTrailer(all, unwanted))
      .map(
        unwanted =>
          `trailer "${unwanted.key}:" names ${unwanted.value}, which this ` +
          'commit does not close',
      ),
  ];
};

/**
 * A real revert: git's own message form, naming the commit it undoes, and a
 * tree that genuinely is the inverse. The tree check is the one a plausible
 * hand edit cannot satisfy.
 */
const revertProblems = (
  runner: GitRunner,
  commits: readonly NewCommit[],
  revert: Revert,
  shas: Record<string, string>,
): string[] => {
  const target = shas[revert.targetKey] ?? '';
  const base = shas[revert.baseKey] ?? '';
  if (target === '' || base === '') {
    return [`scenario has no sha for ${revert.targetKey}/${revert.baseKey}`];
  }

  const naming = commits.filter(commit => commit.message.includes(target));
  const inverse = probeGit(runner, ['diff', '--quiet', base, 'HEAD']);
  const isWrongForm =
    naming.length > 0 &&
    naming.every(commit => !commit.subject.startsWith(revertSubject));

  return [
    ...(naming.length === 0
      ? [
          `no new commit names ${short(target)} as reverted — a hand-written ` +
          'undo leaves no link to what it undid',
        ]
      : []),
    ...(isWrongForm
      ? [
          'the commit undoing the change is not in the form git revert writes ' +
          `(subjects: ${naming.map(commit => commit.subject).join(' / ')})`,
        ]
      : []),
    ...(inverse.status === 0
      ? []
      : [
          `HEAD is not tree-identical to ${short(base)} — the undo is not the ` +
          'exact inverse of the reverted change',
        ]),
  ];
};

/**
 * The pending work has to actually reach the history.
 *
 * Without this every other check is satisfiable by a degenerate answer: restore
 * the working tree to the baseline and make the required number of
 * `--allow-empty` commits. The count, subject, grouping and clean-tree checks
 * all pass, because an empty commit touches no files and a reverted tree is
 * clean. Comparing HEAD's content against what the scenario seeded is what ties
 * the assertions to the work they are supposed to be about.
 */
const pendingProblems = (runner: GitRunner, scenario: string): string[] => {
  const seeded = scenarios.find(entry => entry.key === scenario);
  if (seeded === undefined) return [];

  return Object.entries(seeded.pending).flatMap(([relative, contents]) => {
    const shown = probeGit(runner, ['show', `HEAD:${relative}`]);
    if (shown.status !== 0) return [`${relative} never reached the history`];

    return shown.stdout === contents
      ? []
      : [`${relative} at HEAD does not match the work the scenario staged`];
  });
};

const countProblems = (commits: readonly NewCommit[], vars: Vars): string[] => {
  const count = String(commits.length);

  return [
    ...(commits.length < vars.minCommits
      ? [`${count} new commit(s), expected at least ${String(vars.minCommits)}`]
      : []),
    ...(vars.maxCommits !== undefined && commits.length > vars.maxCommits
      ? [`${count} new commit(s), expected at most ${String(vars.maxCommits)}`]
      : []),
  ];
};

const perCommitProblems = (
  commits: readonly NewCommit[],
  vars: Vars,
): string[] =>
  commits.flatMap(commit => [
    ...universalProblems(commit),
    ...grammarProblems(commit, vars.subjectGrammar),
    ...(vars.subjectShape ? shapeProblems(commit) : []),
    ...(vars.noStaleFacts ? staleFactProblems(commit) : []),
  ]);

const scenarioProblems = (
  runner: GitRunner,
  commits: readonly NewCommit[],
  vars: Vars,
  shas: Record<string, string>,
): string[] => {
  const dirty = vars.cleanTree
    ? captureGit(runner, ['status', '--porcelain'])
    : '';
  const isBodied = commits.some(
    commit => commit.message.split('\n').length > linesBeforeBody,
  );
  const isWantingTrailers =
    vars.trailers.length > 0 || vars.absentTrailers.length > 0;

  return [
    ...(!isBodied && vars.body
      ? ['no commit carries a body explaining the change']
      : []),
    ...pendingProblems(runner, vars.scenario),
    ...disjointProblems(commits, vars.disjointGroups),
    ...(isWantingTrailers ? trailerProblems(runner, commits, vars) : []),
    ...(vars.revert === undefined
      ? []
      : revertProblems(runner, commits, vars.revert, shas)),
    ...(dirty === ''
      ? []
      : [`work left uncommitted: ${dirty.replaceAll('\n', ', ')}`]),
  ];
};

/**
 * Asserts the commits the agent wrote follow the skill's rules.
 */
export default function assertCommits(
  _output: unknown,
  context: { vars?: unknown },
): AssertionResult {
  const vars = v.parse(VarsSchema, context.vars ?? {});
  const baseline = readBaselines()[vars.scenario];
  if (baseline === undefined) {
    return fromProblems([`no seeded baseline for scenario "${vars.scenario}"`]);
  }

  const runner: GitRunner = {
    cwd: path.join(skillsRoot(), ...scenarioPath(vars.scenario).split('/')),
    git: resolveRealGit(),
  };
  const commits = readNewCommits(runner, baseline.tip);

  return fromProblems([
    ...countProblems(commits, vars),
    ...perCommitProblems(commits, vars),
    ...scenarioProblems(runner, commits, vars, baseline.shas),
  ]);
}
