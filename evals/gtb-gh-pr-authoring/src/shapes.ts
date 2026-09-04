/*
 * The GitHub world a scenario states, separate from the list of scenarios
 * stating it.
 *
 * Split from scenarios.ts so the scenario list reads as a list of situations:
 * the two grow for unrelated reasons — a new scenario adds a situation, a new
 * `gh` answer adds a field — and only the stubs and the seeder need the types.
 *
 * The record shapes themselves live in `@gtbuchanan/github-cli-stub/records`,
 * because what `gh` returns is not particular to this suite. What is left here
 * is the seeding: which situation to build, and the history to build it from.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import type { SeedCommit } from '@gtbuchanan/agent-skills-harness/seed-repo';
import type { CheckEntry } from '@gtbuchanan/github-cli-stub/checks';
import type {
  CommentEntry,
  DependentPr,
  PullRequest,
  ReviewCommentEntry,
  ReviewEntry,
} from '@gtbuchanan/github-cli-stub/records';

/**
 * An extra commit written after the history is seeded and pushed.
 *
 * Two things the shared seeder cannot express, both of which a scenario needs:
 * a commit that exists locally but not on the origin (so there is something to
 * push), and a message carrying trailers (so the squash path has something to
 * carry forward).
 */
export interface ExtraCommit {
  readonly push: boolean;
  readonly subject: string;
  readonly trailers: readonly string[];
  readonly tree: Readonly<Record<string, string>>;
}

export interface Scenario {
  readonly branch: string;
  readonly comments: readonly CommentEntry[];
  /**
   * The seeded history, oldest first. Pushed to the scenario's origin.
   */
  readonly commits: readonly SeedCommit[];
  /**
   * The checks have not finished. A scenario whose task says so has to set
   * this, or `gh pr checks` reports success and contradicts its own premise.
   */
  readonly checksPending?: boolean | undefined;
  /**
   * What `gh pr checks` reports, where the scenario is about the check list
   * itself. Left out, the double serves one passing CI check — or one pending
   * one where `checksPending` says so — which is all the other scenarios need.
   */
  readonly checks?: readonly CheckEntry[] | undefined;
  readonly deleteBranchOnMerge: boolean;
  readonly dependents: readonly DependentPr[];
  readonly extra?: ExtraCommit | undefined;
  /**
   * The PR belongs to a stack `gh stack` knows about, so `gh pr merge`
   * refuses it and the asynchronous merge endpoint is the only way in.
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
