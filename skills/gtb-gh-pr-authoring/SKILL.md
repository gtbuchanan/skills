---
name: gtb-gh-pr-authoring
description: >-
  Author-side conventions for GitHub pull requests: opening one as a draft,
  using the repository's template, what belongs in the title and description,
  watching checks after every push, and acting on review feedback once it is
  brought to you. Use whenever work is headed for a GitHub PR or one is already
  open: creating a PR, pushing to a branch that has one, marking it ready for
  review, reading CI results, or answering and acting on review comments.
  Landing one is gtb-gh-pr-merging.
---

# Authoring a GitHub pull request

You are the author here, from the first push until the request is someone
else's to land.

Pass the title and the description as literal multi-line strings. Never build
one inline. Never stage one in a file.

```sh
# POSIX shells: quoted heredoc delimiter, onto standard input
gh pr create --draft --title 'Fix scheduler retry backoff' --body-file - <<'BODY'
The poller's backoff reset on every poll, so a wedged job retried forever.
BODY
```

```powershell
# PowerShell: here-string straight into --body; no pipe, no stdin
gh pr create --draft --title 'Fix scheduler retry backoff' --body @'
The poller's backoff reset on every poll, so a wedged job retried forever.
'@
```

## Commit conventions in a GitHub pull request

Most of what this skill produces ends up in `git log`. The title becomes the
squash subject, and the branch carries its own commits. Load
`gtb-git-commit-conventions` first.

The description is the exception. It stays in GitHub's UI, so those rules
govern what it says, not how it is formatted. Both forms above are literal, so
`''` is not an escape. It lands as two characters.

## Shape decisions made before a GitHub pull request

`gtb-gh-pr-boundaries` settles how many pull requests the work becomes, what
each one branches from, and when each one opens. All of it is decided before
the first edit.

## The GitHub pull request pipeline

A PR moves through these stages. Every transition after the check watch belongs
to the human.

1. **Draft opened.** The PR exists and CI can run against it.
1. **Checks.** Every push is followed by a check watch.
1. **Author review.** The human reads the code. **Your work stops here.**
1. **Hosted agent review.** An automated reviewer follows the human's pass.
1. **Ready.** The human promotes, which invites human reviewers.
1. **Human peer review**, then the merge, which `gtb-gh-pr-merging` governs.

**A reviewer that skips drafts runs after the promotion.** Its findings arrive
after the author review by design.

## Pushing to a GitHub branch

**Never push unless you are told to.** Committing is local and reversible.
Pushing starts CI and wakes reviewers.

**Do not rewrite a branch after a review lands on it.** New shas detach inline
threads from the diff, and nothing says so. A reviewer that recognises no
commit re-reads the whole branch. Add a commit instead and let the squash tidy
it away. The same holds during the author's own pass, where one commit per
point shows what you addressed. Squash or rebase once they finish, before
anything else anchors.

**Push once per unit of work, not once per commit.** Every push restarts the
check matrix and re-triggers any reviewer watching. Three quick pushes buy
three overlapping reviews, most already stale.

## Opening a GitHub pull request

**Open every PR as a draft.** Opening one is visible either way. Marking it
ready is what _requests_ review, from CODEOWNERS and from whatever else watches
that transition.

**Use the repository's PR template if it has one.** `gh repo view` returns the
templates GitHub itself resolved, body and all, so no path needs guessing.

```sh
gh repo view --json pullRequestTemplates --jq '.pullRequestTemplates[].body'
```

`gh` fills in a template only while a human answers its prompts. Behind
`--body` or `--body-file` it applies none, and it says nothing about that.
`--template` does not help, because `gh` rejects that flag when either body
flag is present. Fill the sections yourself and pass the result to
`--body-file`. With no template, write
[the default description](#the-default-github-pull-request-description).

**Write the title as a commit subject, not a headline.** Squashed, which is
typical, it becomes a permanent commit's first line, so the subject rules
apply, prefix grammar included. Fast-forwarded, it never reaches history at
all.

**Do not hard-wrap the description.** GitHub soft-wraps prose. Hard wraps break
list continuation, blockquotes and tables, and buy nothing. The same goes for
issues and comments.

**Write for the reviewer whose time you are asking for.** They are the one
audience a commit body does not have. Tell them which plausible approach you
ruled out, and why.

**State the change, not its history.** The description covers the code as it
stands. It is not a log of "addressed feedback" and "fixed CI", which is what
the commits and the threads are for. Rewrite it as the work changes. Editing it
is part of pushing a fix.

```sh
gh pr edit <number> --title 'Fix scheduler retry backoff' --body-file -
```

**Put the closing reference in the description.** Write `Resolves: #123`,
character for character the trailer a commit would carry. An issue the PR only
advances takes no keyword. On a branch commit that trailer dies in the squash
unless you carry it into the squash message, which is what makes the
description the reliable place for it.

**Promote to ready only when you are told to.** `gh pr ready <number>` invites
human reviewers. Green checks are not the signal. Neither is a clean bot pass.

**A request to promote reports the author's own review complete.** Treat the
branch as read from then on.

## The default GitHub pull request description

**With no template to fill in, write prose and stop.** One to three sentences
say what the change does and why. Then the closing reference.

```text
The poller's backoff reset on every poll, so a wedged job retried forever at
the floor delay. Compute it from the attempt count instead.

Resolves: #482
```

**Add headings only when a reviewer has to navigate the change.** Take them
from this set, in this order, and add no others.

- `## Summary`: what changed, once one paragraph no longer holds it.
- `## Testing`: what you ran and what you saw.
- `## Notes for reviewers`: where to start, what to read hardest, what you are
  unsure of.

**The set is closed, and a section is left out rather than filled.** A shape
that shifts between requests costs the reader what a convention buys, which is
knowing where to look without reading. A heading over "N/A", a restated
summary, or two lines of text teaches them to skip headings, and that hides the
ones carrying something. A change wanting another heading usually wanted
splitting.

**`## Testing` is for what the checks cannot show.** Whether the suite passes
or lints is already on the request, in a form a reviewer trusts more than
prose, so restating it buries the line that earned the section. What they
cannot see is the path you exercised by hand, the case you checked, the edge
you left, and any suite CI does not run.

**Say so if you did not exercise the change.** An unearned claim here is the
one part of a description the diff cannot check.

## Stacked GitHub pull requests

A unit branched from another unit's branch rather than from the trunk arrives
here as a stack. Read `references/stacked-pull-requests.md` before you open the
pull requests. Linking a stack pushes your branches, and it can promote a draft
you meant to leave as one.

## Watching checks after a push to an open GitHub pull request

**Watch the checks after every push to an open PR, draft or ready.** A push you
do not follow up on claims the work is done and backs it with nothing.

**Run the watch in the background.** A green matrix takes minutes. In Claude
Code that is `Bash` with `run_in_background: true`. Report what you pushed, say
the checks are running, and pick the result up when it lands.

```sh
gh pr checks --watch --fail-fast
```

**`--fail-fast` tells you when to start diagnosing, not when to push.** It
returns on the first failure. The rest of the run keeps going.

**Let the code checks finish before you push again.** Then the push carries
every failure, not just the first. An automated reviewer also reports as a
check, and it can sit queued far longer than the build. Waiting on that holds
up a fix it has nothing to do with. Still wait for a review already running,
because one push can carry its findings too.

**A watch can report green or red before it has earned either.** That happens
before the checks exist, and again after a promotion.
`references/watching-checks.md` covers both, the exit codes, and how to tell a
code check from a reviewer's.

## Watching checks after promoting a GitHub pull request to ready

**Watch the checks after `gh pr ready`, the same as after a push.** Promotion
starts what was waiting on it: jobs that skip drafts, and a reviewer that skips
drafts. You are not summoning any of it. You are checking what your own command
started.

**An instant green after a promotion is the draft's own run.** It is still
passing, and nothing new has registered yet. `references/watching-checks.md`
covers what to do with that, and when to stop watching.

## Acting on review feedback on a GitHub pull request

**Leave summoning an automated reviewer to the author.** A review of code the
author has not read spends tokens and rate-limit budget on findings their
reading would have made moot.

**Read a review whose check has already reported.** Reading one costs nothing,
and what it found belongs in the same report as the check result.

**Your work ends at green checks.** Report them, report any completed review,
then stop. The findings come back when the author brings them, often a session
later.

**Read `references/review-feedback.md` when the author brings the findings
back, before you touch one.** It covers the surfaces they arrive on, the
commands that reach them, judging a finding instead of applying it, one finding
per commit, and which accounts you may reply to. From memory you will answer
the wrong account on the wrong surface, in Markdown the shell has eaten.

## Merging a GitHub pull request

**Merging is not this skill's job, and it may not be yours.** A reviewer lands
what they approved as often as the author does. The merge method, the squash
message, the branch deletion and auto-merge all belong to `gtb-gh-pr-merging`.
Load it when a request is being landed.
