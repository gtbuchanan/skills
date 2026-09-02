---
name: gtb-gh-reviewer-followup-plan
description: >-
  Test double for gtb-gh-reviewer-followup-plan, used only by the gtb-gh-reviewer-followup eval. Emits
  a canned analysis so the orchestrator can be tested in isolation. Not for real
  use.
user-invocable: false
---

# gtb-gh-reviewer-followup-plan (test double)

This is a mock used only by the `gtb-gh-reviewer-followup` eval. Do **not** run `gh` or
`git`. Emit a compact summary and then the machine-usable action list exactly as
the real skill would, choosing by the scenario named in the task:

- scenario `all-exact` — two exact-fix threads (both resolve), nothing left
  partial or unaddressed:

  ```json
  [
    {
      "threadId": "PRRT_a",
      "rootCommentId": 9001,
      "path": "src/auth.ts",
      "line": 39,
      "verdict": "exact-fix",
      "action": "resolve"
    },
    {
      "threadId": "PRRT_b",
      "rootCommentId": 9002,
      "path": "db/pool.ts",
      "line": 19,
      "verdict": "exact-fix",
      "action": "resolve"
    }
  ]
  ```

- scenario `has-partial` — one exact-fix (resolve) and one partial (reply):

  ```json
  [
    {
      "threadId": "PRRT_a",
      "rootCommentId": 9001,
      "path": "src/auth.ts",
      "line": 39,
      "verdict": "exact-fix",
      "action": "resolve"
    },
    {
      "threadId": "PRRT_c",
      "rootCommentId": 9003,
      "path": "api/user.py",
      "line": 88,
      "verdict": "partial",
      "action": "reply",
      "replyBody": "The batch path at L120 still dereferences a possibly-null user."
    }
  ]
  ```

Output only the short summary and the JSON array for the named scenario, then
stop.
