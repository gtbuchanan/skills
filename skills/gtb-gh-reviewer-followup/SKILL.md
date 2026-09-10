---
name: gtb-gh-reviewer-followup
description: >-
  Orchestrates a reviewer's follow-up pass on a GitHub PR after the author
  pushed changes: check out the PR, re-review only what changed since your last
  review, then resolve the threads that were fixed and reply to the ones that
  weren't. Use whenever you are following up on / re-reviewing / acting on your
  own review feedback for a pull request (e.g. "follow up on my review of PR
  123"). It sequences the gtb-gh-reviewer-followup-plan and
  gtb-gh-reviewer-followup-apply skills and does NOT reimplement their logic. It
  can write to the PR, but only through gtb-gh-reviewer-followup-apply's
  per-action confirmation gate.
---

# GitHub reviewer follow-up

You are acting **as the reviewer**, following up on your own review after the
author has pushed changes.

Target PR: the number passed when this skill is invoked (e.g.
`/gtb-gh-reviewer-followup 123`). If none is given, infer it from the current
branch (`gh pr view`); if that fails, ask which PR.

Run these steps in order, pausing where noted.

1. **Check out the PR into an isolated worktree** so the working tree reflects
   the PR head without disturbing other work. If a worktree for this PR already
   exists, switch into it rather than recreating it.
   - In Claude Code with worktrunk: `wt switch pr:<number>`, then enter that
     worktree. In another environment, use that agent's equivalent PR-checkout
     into an isolated workspace.
   - **Fast-forward it to the latest PR head** (`git pull --ff-only`): a
     reused worktree can be stale, and a plain `git fetch` won't advance the
     checked-out branch. It's review-only with no local commits, so if the
     fast-forward can't apply, stop and report rather than merging.

1. **Analyze, using the `gtb-gh-reviewer-followup-plan` skill.** It computes the
   diff since your last submitted review, pulls your review threads, and
   returns a compact per-verdict summary plus a machine-usable action list.
   It judges threads _someone else_ resolved as well as your open ones, since
   anyone can resolve a thread and trusting every resolve would let an
   unaddressed concern slip through. This step is read-only.

1. **Walk through and confirm, using the `gtb-gh-reviewer-followup-apply`
   skill.** It takes the action list and gates every write on your approval: it
   batches the low-risk `resolve`/`ack` items into one confirmation and walks
   the `reply`s (and any `reopen`s) one at a time so you can tune the wording.
   Scope stays on existing threads: resolve, reply, ack, or reopen, never a
   brand-new conversation.

1. **Happy path: offer to approve and merge.** If every thread was an exact fix
   and got resolved (nothing left partial or unaddressed), the review is fully
   addressed: ask whether to approve and squash-merge, and do so only on an
   explicit yes. If anything stayed unresolved, skip this and leave the PR open.

1. **Clean up.** The follow-up used a review-only checkout with no local
   commits, so nothing needs preserving. Tear it back down.
   - In Claude Code with worktrunk: exit the session's worktree context
     (`ExitWorktree`), then `git fetch` and `wt remove <branch>` to delete the
     worktree and its local branch. Elsewhere, discard the throwaway checkout
     the equivalent way.

   Finally, print a short summary: how many threads were resolved, how many
   replied to, and anything skipped.

Stop and surface the situation (don't guess) if: you have no submitted review on
this PR to use as a baseline, the PR has no open threads, or a GitHub write
fails. In each case tell the user what you found and what you'd do next.
