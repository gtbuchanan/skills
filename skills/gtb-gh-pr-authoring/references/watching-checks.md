# Watching checks on a GitHub pull request

What the exit codes mean, and how a check watch can report something other than
what it appears to.

## Exit codes from gh pr checks

Exit 0 means every check passed and 1 means at least one failed; 8 means they
are still pending, which a completed `--watch` should not give you.

## A check watch that returns before the checks exist

Immediately after a push, before any workflow has registered, `gh pr checks`
reports that the branch has no checks rather than waiting for some to appear —
and exits 1 for it, the status a real failure gets. `--watch` does not help:
the branch is read before the watch loop starts, so it returns rather than
waiting for checks to appear. Exit 1 on its own therefore does not mean a check
failed — read what it printed. "no checks reported" is too early rather than
red, so watch again instead of reporting the push as broken. If it keeps saying
it, the branch has nothing configured to run, which is worth saying plainly and
is still not green.

## A check watch that returns the draft's run after a promotion

An early watch reads differently after `gh pr ready`. A push has no checks yet
and says so; a promotion inherits the draft's run, complete and green, so an
instant result is probably that old run. Watch again.

If the second watch shows the same run — `gh run list --branch <branch>` says
whether a new one exists — report that and leave it there. Nothing may have
been gated on the draft, the workflow may not count the promotion among its
triggers, or a reviewer may be held up by something outside the PR. A third
watch will not separate them.

## Telling a code check from an automated reviewer's

`--watch` waits on the whole list, and an automated reviewer reports as a check
like any other, so its queue can hold the watch open long after the build has
answered. Name what is still pending rather than counting it — which check is
outstanding is the whole question:

```sh
gh pr checks --json name,workflow,bucket \
  --jq '.[] | select(.bucket == "pending") | "\(.name)\t\(.workflow)"'
```

Where GitHub Actions runs all of the CI, a `workflow` marks the checks that
test the code and a reviewer's has none. The field says "ran as a GitHub
Actions workflow" rather than "tests the code", though, so another CI service
or a deploy preview reports with no workflow either — on a repository with any,
go by the reviewer's name instead of the field.

Nothing outstanding but the reviewer means the fix can go — unless that review
is already running rather than waiting to. The check's description is where a
reviewer says which: one that reads as queued may sit behind a backlog or a
limit for as long as that takes, while one that reads as under way reports
shortly, and waiting lets a single push carry its findings with the build fix.
Pushing through it discards that run and starts another against the new head.

That answers for the moment it is asked, so ask again when the fix is ready
rather than treating one answer as a wait.

## What an automated reviewer's check reports

What its check means is the reviewer's own convention, so do not read a verdict
off it. One that passed may have finished a review that asked for changes, or
skipped a draft it declined to read, or given up on a head it never got to — a
spent rate limit passes exactly like a clean bill, and that is the one where a
reviewer meant to run and nothing on the board says it did not. Read the
description rather than the colour, and take green as no more than "nothing
further is coming from the reviewer on this head".

Where it put its findings is a third question again. Whether a reviewer submits
a review at all is a setting on its side, so a finished one can leave `reviews`
empty and the PR still reporting `REVIEW_REQUIRED`, having said everything it
had to say in a conversation comment:

```sh
gh pr view <number> --json reviewDecision,reviews,comments
```

That is the same three surfaces the review-feedback rules name, and a check
saying `pass` argues for none of them being empty.

Whether the review is required decides whether the PR can merge, not when to
push a fix — so `--required` is no way to leave it out of the wait. The
reviewer's own check may be required, and where a repository requires nothing
the flag reports exactly that and exits 1, which reads like a failure and is
not one.
