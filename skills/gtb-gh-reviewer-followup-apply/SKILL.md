---
name: gtb-gh-reviewer-followup-apply
description: >-
  Internal building block of the gtb-gh-reviewer-followup workflow — invoked by
  that orchestrator after a human has approved the actions, not meant to be
  used directly. Executes review-thread actions on a GitHub PR as the reviewer:
  resolves threads (GraphQL resolveReviewThread) for verified exact fixes and
  posts replies (REST review-comment replies) on partial or unaddressed threads.
  Propose-then-confirm: it only writes after the human confirms the action list,
  and it never opens brand-new conversations.
user-invocable: false
---

# GitHub reviewer follow-up apply

## Purpose

This skill performs the write half of the review follow-up: it takes an approved
list of thread actions and executes them against GitHub. It is deliberately
separated from `gtb-gh-reviewer-followup-plan` so that all analysis stays read-only and every
mutation sits behind an explicit human confirmation — resolving the wrong thread
or posting a wrong-headed reply is publicly visible and annoying to walk back.

## Inputs

- The action list from `gtb-gh-reviewer-followup-plan` (the machine-usable JSON: `threadId`,
  `rootCommentId`, `verdict`, `action`, `replyBody` for replies, and `reopen`
  on a reply whose thread should also be unresolved).
- Repo context: `OWNER`, `NAME`, and the PR number.

## Confirmation gate

Do not write anything until the human has approved the specific actions. But
approval on a big review is not one yes/no on a wall of rows — a 40-thread table
followed by "approve?" gives the human nothing to actually reason about. Walk
through the decisions in a way that scales with the risk of each action:

1. Start from the compact summary `gtb-gh-reviewer-followup-plan` produced (counts + one-line
   index). This is the map, not the decision.

1. **Batch the low-risk group.** The `exact-fix` items are mechanical and
   verified against a diff hunk — `resolve` (open threads) and `ack` (threads
   someone else already resolved, where you confirmed the fix is real). Both just
   record "this is handled," so offer them as one batch: list the one-liners and
   ask a single question — "resolve/ack all N, or review any individually?" Most
   reviews this clears the bulk in one confirmation. If the human wants to
   inspect one, show its concern + evidence hunk, then continue the batch.

1. **Walk the judgment group one at a time.** Each `partial` / `unaddressed`
   reply carries wording the human may want to tune, so present them singly:
   show the concern (root comment), the relevant diff evidence, the draft
   `replyBody`, and — for a resolved-by-other thread — that approving also
   **reopens** it (the fix others marked done is still incomplete). Take a
   decision: post as-is / edit the text / skip, and for a reopen, confirm the
   unresolve is intended. Apply each as it is approved so progress is visible;
   don't collect all edits and fire at the end.

Treat an edited `replyBody` or a downgraded action (resolve → reply, or dropping
a `reopen`) as the new truth. If approval is partial ("just the resolves",
"skip #8"), act only on what was clearly approved and leave the rest untouched.

The write actions are **resolve**, **reply**, **ack** (a 🚀 reaction), and
**reopen** (unresolve, always paired with a reply). There is no new-conversation
action — a concern the fix missed becomes a reply on its existing thread, never a
fresh comment.

For a small review (a handful of threads) this walk-through collapses naturally
into a short back-and-forth; the point is to never force a single blind approval
over content the human hasn't actually read.

## Procedure

Act on each approved item by its `action`:

1. **resolve** — mark the thread resolved via the GraphQL mutation (REST has no
   equivalent):

   ```bash
   gh api graphql -f query='
   mutation($threadId:ID!){
     resolveReviewThread(input:{threadId:$threadId}){
       thread{ id isResolved }
     }
   }' -F threadId="<threadId>"
   ```

   Confirm the response shows `isResolved: true` before counting it done.

1. **reply** — post a reply onto the existing thread. Reply to the thread's root
   comment (`rootCommentId` — the `databaseId` from `gtb-gh-reviewer-followup-plan`, not an id
   from any `--json comments` output, which is a different id space and 404s):

   ```bash
   gh api repos/$OWNER/$NAME/pulls/<pr>/comments/<rootCommentId>/replies \
     -f body='<replyBody>'
   ```

   For a partial fix, some reviewers prefer to reply _and_ leave the thread open
   (the default here) so the author sees it still needs work. Only resolve a
   thread when the fix is complete.

1. **ack** — for a thread someone else resolved whose fix you verified is real,
   add a 🚀 reaction to the root comment (same `rootCommentId`). This deliberately
   does not touch thread state — it stays resolved. Its only job is to mark the
   thread as personally checked so the next follow-up pass skips it instead of
   re-judging the same closed thread:

   ```bash
   gh api repos/$OWNER/$NAME/pulls/comments/<rootCommentId>/reactions \
     -f content='rocket'
   ```

   The reactions endpoint is idempotent — re-adding a reaction you already left
   returns the existing one, so a repeated pass is harmless.

1. **reopen** — when a resolved-by-other thread's fix is incomplete, post the
   reply first (as above), then unresolve the thread, so the author gets the
   context alongside the state change and the still-open concern resurfaces
   instead of staying buried under a resolved checkmark. Only attempt this when
   `gtb-gh-reviewer-followup-plan` saw `viewerCanUnresolve: true`:

   ```bash
   gh api graphql -f query='
   mutation($threadId:ID!){
     unresolveReviewThread(input:{threadId:$threadId}){
       thread{ id isResolved }
     }
   }' -F threadId="<threadId>"
   ```

   Confirm the response shows `isResolved: false` before counting it done.

## Output

After acting, report a concise summary of what changed on the PR — how many
threads resolved, how many replied to, and any that were skipped or failed, with
the failure reason. Link or reference each affected thread by `path:line` so the
human can spot-check. Keep the numbers descriptive rather than baking exact
counts into anything durable.

## Guardrails

- Never resolve or `ack` a thread that was not marked `exact-fix` and approved.
  Both signal "this is handled"; doing either prematurely loses the author's
  signal that work remains.
- Never `reopen` (unresolve) a thread except as the approved counterpart of a
  reply on a resolved-by-other thread whose fix is incomplete. The unresolve
  itself is a silent state change, but it is publicly visible and reverses a
  teammate's resolve, so it must be a deliberate, approved judgment — never a
  reflex on every resolved thread you didn't close.
- Never fabricate or reword an approved `replyBody` — post it as approved.
- If a write fails (permissions, stale thread id, network), stop and report it
  rather than retrying blindly or moving the action to a different thread.
