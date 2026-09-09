/*
 * The GitHub world a pull request scenario states, and the seeding it is told
 * against.
 *
 * Separate from any list of scenarios: the two grow for unrelated reasons — a
 * new scenario adds a situation, a new `gh` answer adds a field — and a suite
 * writes only the list. The record shapes themselves are `./records.ts`,
 * because what `gh` returns is not particular to any world.
 *
 * The seeding half (`branch`, `commits`, `extra`) is here rather than beside
 * the git fixtures because a scenario is one statement: the history and the
 * pull request opened against it have to agree, and splitting the type is how
 * a suite ends up describing a PR whose branch its checkout does not have.
 *
 * Loaded by stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import type { SeedCommit, SeedIdentity } from '@gtbuchanan/git-fixtures/seed-repo';
import type { CheckEntry } from './checks.ts';
import type {
  CommentEntry,
  DependentPr,
  PullRequest,
  ReviewCommentEntry,
  ReviewEntry,
} from './records.ts';

/**
 * An extra commit written after the history is seeded and pushed.
 *
 * What the shared seeder cannot express, all of which some scenario needs: a
 * commit that exists locally but not on the origin (so there is something to
 * push), a message carrying trailers (so a squash has something to carry
 * forward), and a commit somebody else wrote (so a squash has credit to derive
 * that the trailers do not state).
 */
export interface ExtraCommit {
  /**
   * Who wrote it, where that is not the account the rest of the history is
   * seeded under — a teammate's commit on the branch.
   */
  readonly author?: SeedIdentity | undefined;
  readonly push: boolean;
  readonly subject: string;
  readonly trailers: readonly string[];
  readonly tree: Readonly<Record<string, string>>;
}

export interface Scenario {
  readonly branch: string;
  readonly comments: readonly CommentEntry[];
  /**
   * What `gh pr checks` reports, where the scenario is about the check list
   * itself. Left out, {@link checksFor} serves one passing CI check — or one
   * pending one where `checksPending` says so.
   */
  readonly checks?: readonly CheckEntry[] | undefined;
  /**
   * The checks have not finished. A scenario whose task says so has to set
   * this, or `gh pr checks` reports success and contradicts its own premise.
   */
  readonly checksPending?: boolean | undefined;
  /**
   * The seeded history, oldest first. Pushed to the scenario's origin.
   */
  readonly commits: readonly SeedCommit[];
  readonly deleteBranchOnMerge: boolean;
  readonly dependents: readonly DependentPr[];
  readonly extra?: ExtraCommit | undefined;
  /**
   * The PR belongs to a stack `gh stack` knows about, so `gh pr merge` refuses
   * it and the asynchronous merge endpoint is the only way in.
   */
  readonly isStackMember?: boolean | undefined;
  readonly key: string;
  readonly pr?: PullRequest | undefined;
  readonly reviewComments: readonly ReviewCommentEntry[];
  readonly reviews: readonly ReviewEntry[];
  /**
   * The repository's PR template body, when it has one.
   */
  readonly template?: string | undefined;
}

/**
 * The check list the scenario states, or the single CI check a scenario with
 * nothing to say about checks is served.
 */
export const checksFor = (scenario: Scenario): readonly CheckEntry[] =>
  scenario.checks ?? [
    {
      bucket: scenario.checksPending === true ? 'pending' : 'pass',
      description: '',
      name: 'build',
      workflow: 'CI',
    },
  ];
