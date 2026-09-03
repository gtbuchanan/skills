/*
 * The GitHub records a `gh` double answers with, as gh returns them.
 *
 * Shapes only. What a particular world contains is the caller's business; this
 * says what the fields are called and which of them gh actually sends, which is
 * the part a double gets wrong in ways nothing catches.
 *
 * Loaded by stubs running under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */

/**
 * A submitted review, as `gh pr view --json reviews` returns it.
 */
export interface ReviewEntry {
  readonly author: { readonly login: string };
  readonly body: string;
  readonly state: string;
}

/**
 * A conversation comment on the pull request — `--json comments`, never the
 * inline ones.
 */
export interface CommentEntry {
  readonly author: { readonly login: string };
  readonly body: string;
}

/**
 * An inline review comment. A thread root has no parent; a double renders that
 * as the null the REST endpoint actually returns, because dropping the key
 * says something different.
 */
export interface ReviewCommentEntry {
  readonly body: string;
  readonly id: number;
  readonly in_reply_to_id?: number | undefined;
  readonly path: string;
  readonly user: { readonly login: string };
}

/**
 * A pull request based on another's branch — what a merge path has to find and
 * retarget before deleting anything.
 */
export interface DependentPr {
  readonly headRefName: string;
  readonly number: number;
  readonly title: string;
}

/**
 * A pull request the world already has.
 */
export interface PullRequest {
  readonly baseRefName: string;
  readonly body: string;
  readonly headRefName: string;
  readonly isDraft: boolean;
  readonly number: number;
  readonly title: string;
}
