---
name: pr-review-verdict
description: >-
  Internal building block of the pr-review-followup workflow — the pure
  judgment core that pr-review-diff delegates to; not meant to be invoked
  directly. Given a set of open review-thread concerns and the code diff since
  the reviewer's last review, it decides for each thread whether the new changes
  addressed it — exact-fix, partial, or unaddressed — with cited evidence, and
  drafts a reply for the non-exact ones. Performs NO I/O — no gh, git, or
  network — so it is deterministic to test: the diff and threads may be passed
  inline or as file paths to read.
user-invocable: false
---

# PR review verdict

## Purpose

This is the pure decision core of the review-follow-up workflow. Deciding
whether a pushed change actually resolves a review comment is the hard,
error-prone judgment; isolating it here (with no side effects) keeps that logic
in one place, lets `pr-review-diff` stay a thin GitHub-I/O shell around it, and
makes the judgment testable against fixtures rather than only against a live PR.

Getting the verdict wrong is asymmetric: calling something `exact-fix` when it
wasn't leads to resolving a thread that still needs work — a mistake that hides
the problem. So the rubric below deliberately biases toward the safer verdict
when evidence is thin.

## Inputs

You are given, for one PR:

- **The diff since the reviewer's last review** — a unified diff.
- **The open review threads** — each with a file path, a line, and the concern
  (the root comment text). An optional stable `id` per thread should be echoed
  back so the caller can map verdicts to threads.

These may be provided two ways; handle whichever you are given:

- **Inline** in the request text.
- **As file paths** (e.g. a `.diff` and a `.json`/`.md` of threads). If the
  request references paths, read them.

## Rubric

Assign each thread exactly one verdict, judged only against the diff:

- **exact-fix** — the diff fully addresses the concern. A line merely moving,
  being renamed, or being deleted is NOT enough on its own; confirm the change
  does what the thread asked.
- **partial** — the concern is only partly addressed, OR the change addressed
  the original point but introduced a new problem in that same area.
- **unaddressed** — nothing in the diff addresses the concern.

Bias against `exact-fix` when uncertain. Prefer `partial` or `unaddressed`
unless a concrete hunk proves the fix — every verdict must cite a specific hunk,
or note its absence. A verdict with no cited evidence is a guess.

## Replies

For every `partial` or `unaddressed` thread, draft a `reply` in the reviewer's
voice: specific, pointing at the exact remaining gap, collegial, and never
claiming or implying the concern is fully resolved. For `exact-fix`, the reply
is an empty string (the caller will resolve the thread instead of replying).

## Output

Return ONLY a raw JSON array — no markdown fences, no prose around it — with one
object per thread, echoing the input `id` when one was provided:

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

Keep `verdict` to exactly one of `exact-fix` / `partial` / `unaddressed`.
