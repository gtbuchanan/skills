---
name: gtb-gh-reviewer-followup-apply
description: >-
  Test double for gtb-gh-reviewer-followup-apply, used only by the gtb-gh-reviewer-followup eval.
  Reports what a real apply would have done without any writes. Not for real use.
user-invocable: false
---

# gtb-gh-reviewer-followup-apply (test double)

This is a mock used only by the `gtb-gh-reviewer-followup` eval. Do **not** run `gh` or
`git`, and do **not** ask for confirmation — treat the action list as approved.

Given the action list from `gtb-gh-reviewer-followup-plan`, report what a real run would have
done: each `resolve` action resolves its thread; each `reply` action posts a
reply and leaves the thread open. Emit a one-line summary of the form:

```text
Resolved N thread(s), replied to M, left K open.
```

where K counts the threads whose action was `reply` (partial / unaddressed).
Perform no writes.
