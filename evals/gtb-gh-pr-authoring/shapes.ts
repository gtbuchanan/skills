/*
 * The shape of the GitHub world a scenario states, separate from the list of
 * scenarios stating it.
 *
 * Split from scenarios.ts so the scenario list reads as a list of situations:
 * the two grow for unrelated reasons — a new scenario adds a situation, a new
 * `gh` answer adds a field — and only the stubs and the seeder need the types.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import type { SeedCommit } from '#lib/seed-repo.ts';

/**
 * A submitted review, as `gh pr view --json reviews` returns it.
 */
export interface ReviewEntry {
  readonly author: { readonly login: string };
  readonly body: string;
  readonly state: string;
}

/**
 * A conversation comment on the PR — `--json comments`, never the inline ones.
 */
export interface CommentEntry {
  readonly author: { readonly login: string };
  readonly body: string;
}

/**
 * An inline review comment. A thread root has no parent; the stub renders that
 * as the null the REST endpoint actually returns.
 */
export interface ReviewCommentEntry {
  readonly body: string;
  readonly id: number;
  readonly in_reply_to_id?: number | undefined;
  readonly path: string;
  readonly user: { readonly login: string };
}

/**
 * One entry in `gh pr checks`.
 *
 * `workflow` is what an agent reads to tell a check that ran in CI from one an
 * automated reviewer posted, so a reviewer's entry states it as empty rather
 * than omitting it — the field being absent and the field being blank are
 * different answers, and only the second is what gh sends.
 */
export interface CheckEntry {
  readonly bucket: 'cancel' | 'fail' | 'pass' | 'pending' | 'skipping';
  /**
   * What the check says about itself — where a reviewer distinguishes a queued
   * review from one under way, this is where it says so.
   */
  readonly description: string;
  readonly name: string;
  readonly workflow: string;
}

/**
 * A pull request based on the scenario's branch — what the merge path has to
 * find and retarget before deleting anything.
 */
export interface DependentPr {
  readonly headRefName: string;
  readonly number: number;
  readonly title: string;
}

/**
 * The PR the scenario is about, when it already has one.
 */
export interface PullRequest {
  readonly baseRefName: string;
  readonly body: string;
  readonly headRefName: string;
  readonly isDraft: boolean;
  readonly number: number;
  readonly title: string;
}

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
