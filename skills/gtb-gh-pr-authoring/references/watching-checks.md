# Watching checks on a GitHub pull request

What the exit codes mean, and how a check watch can report something other than
what it appears to.

## Exit codes from gh pr checks

Exit 0 means every check passed and 1 means at least one failed; 8 means they
are still pending, which a completed `--watch` should not give you. Prefer the
plain watch over `--fail-fast`: learning about one failure per push costs
another full matrix each time.

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
