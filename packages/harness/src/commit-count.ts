/*
 * The expectation that a run's work arrived as several commits rather than one.
 *
 * Kept out of the matcher engine because it is the only expectation that needs
 * a repository. Everything in `expectations.ts` reads a call log and nothing
 * else, so a suite whose scenarios are a tree of fixtures — a config directory,
 * a set of documents, anything a skill is run against — uses the engine without
 * git coming with it. A suite that does seed repositories adds this one.
 *
 * A count rather than an inspection: what the messages say belongs to whichever
 * skill governs commit messages, and to that skill's own suite. What can be
 * answered from outside is how many there are.
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { probeGit } from '@gtbuchanan/git-fixtures/seed-repo';
import { parseJson } from '@gtbuchanan/stub-runtime/calls';
import { scenarioPath } from '@gtbuchanan/stub-runtime/scenario';
import * as v from 'valibot';
import { skillsRoot } from './paths.ts';

/**
 * The vars this check reads. Parsed on its own rather than through the engine's
 * schema, so a suite that never counts commits is never offered the option.
 */
const VarsSchema = v.object({
  minCommits: v.optional(v.number(), 0),
  scenario: v.string(),
});

const TipsSchema = v.record(v.string(), v.string());

/**
 * Where the seed recorded each scenario's baseline tip.
 */
export interface CommitCountOptions {
  readonly baselinesPath: () => string;
}

/**
 * Counts what the run added on top of the recorded baseline.
 *
 * Counting from the recorded tip rather than from the branch point is what
 * keeps the seeded history out of the total — count from the branch point and
 * the baseline commits satisfy the rule on their own.
 */
export const commitCountCheck = (
  options: CommitCountOptions,
): ((rawVars: unknown) => string[]) =>
  (rawVars) => {
    const vars = v.parse(VarsSchema, rawVars ?? {});
    if (vars.minCommits === 0) return [];

    /* A manifest that is not there at all is the same class of failure as one
       missing this scenario's key — the seed never recorded a tip — and has to
       be reported as one. Letting the read throw would put an ENOENT through a
       contract that returns problems, so it would reach the runner as an error
       rather than as a scenario that failed and said why. Caught rather than
       probed with `existsSync`, which is what `recordTip` does for the same
       read and which also covers a file that exists and cannot be read. */
    let contents = '';
    try {
      contents = fs.readFileSync(options.baselinesPath(), 'utf8');
    } catch {
      return [`no baselines recorded at ${options.baselinesPath()}`];
    }

    const baselines = v.parse(TipsSchema, parseJson(contents) ?? {});
    const tip = baselines[vars.scenario];
    /* No baseline is a harness failure and no commits is a skill failure, so
       reporting the second for the first would blame the run for something the
       seed never recorded. */
    if (tip === undefined) return [`no recorded baseline for ${vars.scenario}`];

    const cwd = path.join(skillsRoot(), ...scenarioPath(vars.scenario).split('/'));
    const result = probeGit({ cwd, git: resolveRealGit() }, [
      'rev-list',
      '--count',
      `${tip}..HEAD`,
    ]);
    if (result.status !== 0)
      return [`could not count commits in ${vars.scenario}: ${result.stderr.trim()}`];

    const added = Number(result.stdout.trim());
    return added >= vars.minCommits
      ? []
      : [
          `added ${String(added)} commit(s) over the baseline, expected at least ` +
          `${String(vars.minCommits)} — one per finding, not one for all of them`,
        ];
  };
