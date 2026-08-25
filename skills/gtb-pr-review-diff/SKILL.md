---
name: gtb-pr-review-diff
description: >-
  Internal building block of the gtb-pr-review-followup workflow — invoked by that
  orchestrator, not meant to be used directly. Read-only analysis for following
  up on a GitHub PR review as the reviewer: computes the diff since the current
  reviewer's last submitted review and maps each OPEN review thread to a verdict
  (exact-fix / partial / unaddressed) with evidence, producing a proposal table
  of resolve/reply actions. Does NOT write to the PR — it produces the action
  list that gtb-pr-review-apply executes.
user-invocable: false
---

# PR review diff analysis

## Purpose

When you review a PR, leave threads, and the author pushes fixes, the tedious
part is re-reading the whole PR to figure out _which_ of your threads each new
commit addressed. This skill does that comparison mechanically: it scopes the
review to only what changed since your last pass, pulls your open threads, and
judges each one against the new diff — so the follow-up is grounded in evidence
instead of a from-scratch re-read.

It is strictly read-only. Its output is a proposal that a human approves before
`gtb-pr-review-apply` writes anything back to GitHub.

## Inputs

- PR number (from the invoking command's argument, or inferred from the current
  branch via `gh pr view`).
- The working tree is expected to already be the PR's checkout (the
  `/gtb-pr-review-followup` command enters the worktree first). If not, operate off
  the GitHub API compare endpoint instead of local `git`.

## Procedure

Run these in order. The goal at each step is to gather enough to justify a
verdict per thread — not to re-review the entire PR.

1. Resolve identity and repo context — the "reviewer" is the authenticated
   user, since we are following up on our own review:

   ```bash
   VIEWER=$(gh api user --jq .login)
   REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)  # owner/repo
   OWNER=${REPO%/*}; NAME=${REPO#*/}
   ```

1. Find the review baseline — the commit your last review was submitted
   against. REST reviews carry `commit_id`; `gh pr view --json reviews` does
   not, so use the API:

   ```bash
   gh api repos/$OWNER/$NAME/pulls/<pr>/reviews \
     --jq "[.[] | select(.user.login==\"$VIEWER\" and .submitted_at!=null)] \
           | sort_by(.submitted_at) | last | {commit_id, submitted_at, state}"
   ```

   The `commit_id` is the baseline SHA. The since-last-review diff is
   `BASELINE..HEAD`.

   If the viewer has no submitted review (e.g. you only left loose comments),
   there is no reliable baseline. Do not guess silently — report this and fall
   back to diffing against the PR base branch (`git merge-base` of base..head),
   noting in the output that the scope is the whole PR, not an incremental
   slice.

1. Compute the new diff. In the worktree:

   ```bash
   git fetch --quiet
   git diff <baseline>..HEAD          # full patch
   git diff --stat <baseline>..HEAD   # changed-file overview
   ```

   Read the patch for the files that your open threads touch. You do not need
   to read unrelated changes — the verdicts only concern files/lines under
   existing feedback.

1. Pull review threads via GraphQL. REST can't tell you whether a thread is
   resolved or _who_ resolved it — only GraphQL exposes `isResolved` and
   `resolvedBy`. Capture the thread node `id` (for `resolveReviewThread` /
   `unresolveReviewThread`), each comment's `databaseId` (the REST id for both
   replies and reactions), and the root comment's existing reactions:

   ```bash
   gh api graphql -f query='
   query($owner:String!,$name:String!,$pr:Int!){
     repository(owner:$owner,name:$name){
       pullRequest(number:$pr){
         reviewThreads(first:100){
           nodes{
             id isResolved isOutdated path line originalLine
             resolvedBy{ login } viewerCanUnresolve
             comments(first:50){
               nodes{
                 databaseId author{login} body createdAt
                 reactionGroups{ content viewerHasReacted }
               }
             }
           }
         }
       }
     }
   }' -F owner=$OWNER -F name=$NAME -F pr=<pr>
   ```

   Then decide which threads to judge by _who_ closed them, not merely whether
   they're closed. Filtering on `isResolved == false` alone has a silent hole:
   anyone with write access — usually the PR author — can resolve a thread, so a
   premature or self-serving resolve would drop your concern out of the
   follow-up entirely and you'd never see that it wasn't actually handled. The
   only resolve you can trust sight-unseen is your own. So judge a thread when
   any of these hold:

   - `isResolved == false` (still open), or
   - `isResolved == true` **and** `resolvedBy.login != VIEWER` **and** you have
     not already vouched for it — the root comment's `reactionGroups` carries no
     `ROCKET` whose `viewerHasReacted` is `true`.

   Skip a thread only when you resolved it yourself, or when a resolved-by-other
   thread already carries your 🚀 `ROCKET` (you verified it on an earlier pass —
   see `ack` in the Output section; that mark is what keeps re-runs from
   re-judging the same closed thread every time). Record, per thread, whether it
   was **resolved-by-other**: the verdict uses the same rubric regardless, but
   the action it maps to differs. The thread's concern is the root comment
   (first in `comments.nodes`); later comments are the discussion.

1. Classify each in-scope thread against the new diff by delegating to the
   `gtb-pr-review-verdict` skill — do not re-derive the rubric here. Pass it the
   diff from step 3 and the in-scope threads from step 4 (path, line, concern,
   and the thread node `id` so verdicts map back), including the resolved-by-
   other ones — judging them is the whole point of not silently trusting a
   resolve you didn't make. It returns, per thread, a verdict
   (`exact-fix` / `partial` / `unaddressed`) with cited evidence and a drafted
   reply for the non-exact ones. Keeping that judgment in one pure, side-effect-
   free skill is what lets it be tested against fixtures instead of a live PR;
   this skill's job is only to feed it real GitHub data and act on the result.

   `isOutdated: true` on a thread is useful corroboration to include in what you
   pass along (the flagged line changed), but the verdict skill still confirms
   the change does what the thread asked, not just that the line moved.

   `gtb-pr-review-verdict`'s return is an intermediate result, **not** the
   deliverable. It gives you a verdict, evidence, and a reply per thread — but it
   does not know the `rootCommentId` (needed to post a reply) or the `action`. You
   must join each verdict back with the ids captured in step 4 to build the action
   list in the Output section. Do not return verdict's raw array; every action
   object must carry the `rootCommentId` and an `action`.

## Output

Real reviews can have dozens of open threads, so do NOT dump a full row-per-
thread table into the conversation — that buries the signal and makes a single
"approve?" prompt meaningless. Lead with a compact summary; the per-thread
detail belongs in `gtb-pr-review-apply`'s walk-through, where the human decides one
group at a time.

Emit two things:

1. A short summary the human can absorb at a glance — counts by verdict plus a
   one-line-per-thread index, exact-fix first (quick wins), then partial, then
   unaddressed, and finally the resolved-by-other threads you re-checked so the
   human sees which closed threads you reopened or vouched for:

   ```text
   12 open · 3 resolved-by-others → 7 exact-fix · 4 partial · 4 unaddressed

   exact-fix (propose resolve)
     [1] src/auth.ts:42     constant-time compare  → timingSafeEqual (abc123)
     [2] db/pool.ts:19      close on error         → finally block added (abc123)
     ...
   partial (propose reply)
     [8] api/user.py:88     handle null user       → single path fixed, batch path L120 not
   unaddressed (propose reply)
     [11] ui/form.tsx:15    debounce input         → no change in file
   rechecked — resolved by others (propose ack / reply+reopen)
     [13] db/pool.ts:19     close on error   → @author resolved, verified real → ack 🚀
     [14] api/order.py:44   validate amount  → @author resolved, but still unvalidated → reply + reopen
   ```

   Scope is strictly existing threads — never a brand-new conversation. The
   actions are **resolve** (open + exact fix), **reply** (open + partial /
   unaddressed), **ack** (resolved-by-other + exact fix — a 🚀 that records you
   verified it), and **reply + reopen** (resolved-by-other + partial /
   unaddressed — reply and unresolve so the buried concern resurfaces). Full
   concern text, diff evidence, and draft reply wording are surfaced per-thread
   during the walk-through, not here.

1. A machine-usable action list that `gtb-pr-review-apply` consumes — one object per
   thread, joining each `gtb-pr-review-verdict` result with the ids gathered in
   step 4 (`threadId` for resolve/reopen, `rootCommentId` for replies and acks).
   Map the verdict to an action using whether the thread was resolved-by-other:

   | thread state      | verdict             | action             |
   | ----------------- | ------------------- | ------------------ |
   | open              | exact-fix           | `resolve`          |
   | open              | partial/unaddressed | `reply`            |
   | resolved-by-other | exact-fix           | `ack`              |
   | resolved-by-other | partial/unaddressed | `reply` + `reopen` |

   `ack` adds the 🚀 that makes the next follow-up skip this thread instead of
   re-judging it; `reopen` (a boolean alongside `reply`) unresolves the thread so
   a still-unaddressed concern isn't left buried under a resolved checkmark.

   ```json
   [
     {
       "threadId": "PRRT_kwDO...",
       "rootCommentId": 1234567,
       "path": "src/auth.ts",
       "line": 42,
       "verdict": "exact-fix",
       "action": "resolve"
     },
     {
       "threadId": "PRRT_kwDO...",
       "rootCommentId": 1234570,
       "path": "api/user.py",
       "line": 88,
       "verdict": "partial",
       "action": "reply",
       "replyBody": "Thanks — covered the single fetch; the batch path at L120 still dereferences a possibly-null user."
     },
     {
       "threadId": "PRRT_kwDO...",
       "rootCommentId": 1234580,
       "path": "db/pool.ts",
       "line": 19,
       "verdict": "exact-fix",
       "resolvedByOther": true,
       "action": "ack"
     },
     {
       "threadId": "PRRT_kwDO...",
       "rootCommentId": 1234590,
       "path": "api/order.py",
       "line": 44,
       "verdict": "unaddressed",
       "resolvedByOther": true,
       "action": "reply",
       "reopen": true,
       "replyBody": "`amount` still isn't validated before the charge at L44 — non-positive or non-numeric values reach it unchecked."
     }
   ]
   ```

The `replyBody` text comes straight from `gtb-pr-review-verdict`; the human can edit
any line during `gtb-pr-review-apply`'s walk-through before it is posted.

## Guardrails

- Never call a mutating endpoint from this skill (no resolve, no unresolve, no
  reply, no reaction, no comment). Its contract is analysis only; every write —
  including the `ack` reaction and the `reopen` unresolve — is
  `gtb-pr-review-apply`'s job behind a confirmation gate.
