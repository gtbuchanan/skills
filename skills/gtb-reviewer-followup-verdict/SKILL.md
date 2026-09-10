---
name: gtb-reviewer-followup-verdict
description: >-
  Internal building block of the gtb-gh-reviewer-followup workflow: the pure
  judgment core that gtb-gh-reviewer-followup-plan delegates to; not meant to be
  invoked directly. Given a set of open review-thread concerns and the code diff
  since the reviewer's last review, it decides for each thread whether the new
  changes addressed it (exact-fix, partial, or unaddressed) with cited
  evidence, and drafts a reply for the non-exact ones. Performs NO I/O, no gh,
  git, or network, so it is deterministic to test: the diff and threads may be
  passed inline or as file paths to read.
user-invocable: false
---

# Reviewer follow-up verdict

## Purpose

Deciding whether a pushed change actually resolves a review comment is the
hard, error-prone judgment. Keeping it here, with no side effects, lets
`gtb-gh-reviewer-followup-plan` stay a thin GitHub-I/O shell and makes the
judgment testable against fixtures rather than only against a live PR.

Getting it wrong is asymmetric: calling something `exact-fix` when it wasn't
resolves a thread that still needs work, which hides the problem.

## Inputs

You are given, for one PR:

- **The diff since the reviewer's last review**: a unified diff.
- **The open review threads**: each with a file path, a line, and the concern
  (the root comment text). An optional stable `id` per thread should be echoed
  back so the caller can map verdicts to threads.

Handle whichever form you are given:

- **Inline** in the request text.
- **As file paths** (e.g. a `.diff` and a `.json`/`.md` of threads). If the
  request references paths, read them.

## Rubric

Assign each thread exactly one verdict, judged only against the diff:

- **exact-fix**: the diff fully addresses the concern. A line merely moving,
  being renamed, or being deleted is NOT enough on its own; confirm the change
  does what the thread asked.
- **partial**: the concern is only partly addressed, OR the change addressed
  the original point but introduced a new problem in that same area.
- **unaddressed**: nothing in the diff addresses the concern.

Bias against `exact-fix` when uncertain. Prefer `partial` or `unaddressed`
unless a concrete hunk proves the fix: every verdict must cite a specific hunk,
or note its absence.

## Replies

For every `partial` or `unaddressed` thread, draft a `reply` in the reviewer's
voice: specific, pointing at the exact remaining gap, collegial, and never
claiming or implying the concern is fully resolved. For `exact-fix`, the reply
is an empty string (the caller will resolve the thread instead of replying).

## Output

Your result is a JSON array with one object per thread, echoing the input `id`
when one was provided.

That array is a handoff to whoever invoked this skill, not a message to the
human. Which one it becomes depends on who called:

- **Invoked by another skill** (normally `gtb-gh-reviewer-followup-plan`): the
  array is an intermediate result, carrying no `rootCommentId` and no `action`,
  so nothing in it can be acted on until the caller joins it with the GitHub ids
  it gathered. Carry it forward into that next step rather than rendering it in
  your reply; dumping the JSON buries the compact summary the human is actually
  being asked to approve.
- **Invoked standalone**, with no caller to hand off to (a direct request, a
  test harness): the array is the answer. Emit it as raw JSON, with no markdown
  fences and no prose around it.

If it's ambiguous which case you're in, what loaded this skill settles it: a
chain that began with `gtb-gh-reviewer-followup` or
`gtb-gh-reviewer-followup-plan` is the first case. Make that call silently;
announcing which case you picked is itself prose around the array.

The shape either way:

```json
[
  {
    "threadId": "<id from input, if any>",
    "path": "src/auth.ts",
    "line": 39,
    "verdict": "exact-fix",
    "evidence": "abc123 replaces `===` with timingSafeEqual on the token compare",
    "reply": ""
  }
]
```
