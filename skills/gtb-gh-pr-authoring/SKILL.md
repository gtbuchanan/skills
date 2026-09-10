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

You are acting **as the author**, from the first push to the point where the
request is somebody's to land.

A PR produces two texts here: the title and the description. Hand each to the
command as a literal multi-line string: never assembled inline, never staged
in a file.

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

Most of what this skill produces ends up in `git log`: the title becomes the
squash subject, and the branch carries its own commits. Load
`gtb-git-commit-conventions` before writing any of them.

The description is the exception. It stays in GitHub's UI, so those rules
govern what it says but not how it is formatted, except the literal body:
`''` is not an escape, and lands as two characters.

## Shape decisions made before a GitHub pull request

How many pull requests the work becomes, what each one branches from, and when
each opens are settled before the first edit, by `gtb-gh-pr-boundaries`.

## The GitHub pull request pipeline

A PR moves through these stages, and every transition after the check watch is
the human's:

1. **Draft opened**: the PR exists and CI can run against it.
1. **Checks**: every push is followed by a check watch.
1. **Author review**: the human reads the code. **Your work stops here.**
1. **Hosted agent review**: an automated reviewer follows the human's pass.
1. **Ready**: the human promotes, which invites human reviewers.
1. **Human peer review**, then the merge, which `gtb-gh-pr-merging` governs.

## Pushing to a GitHub branch

**Never push unless explicitly told to.** Committing is local and reversible;
pushing starts CI and wakes reviewers.

**Do not rewrite a branch once a review has landed on it.** GitHub anchors an
inline comment to a position on a particular commit, so a force-push with new
shas can detach the thread from the diff without saying so, and an automated
reviewer with no commit it recognises starts again on the whole branch rather
than the part that changed. Add a commit and let the squash tidy it away.

That holds during the author's own pass too, for a different reason: a commit
per point they raised shows at a glance which ones were addressed. Once they
are done, those commits can be squashed or rebased if the history wants
tidying: that is the moment for it, before anything else is anchored.

**Push once per unit of work, not once per commit.** Every push to an open PR
restarts the check matrix and re-triggers any reviewer already watching, so
three quick pushes buy three CI runs and three overlapping reviews, most of
them stale by the time they post.

## Opening a GitHub pull request

**Open every PR as a draft.** Opening one is visible either way (watchers hear
about it), but marking it ready is what _requests_ review, from CODEOWNERS and
from whatever else watches that transition.

**Use the repository's PR template if one exists.** `gh repo view` returns the
ones GitHub itself resolved, body and all, so no path needs guessing:

```sh
gh repo view --json pullRequestTemplates --jq '.pullRequestTemplates[].body'
```

`gh` fills a template in only while a human is answering its prompts.
Non-interactively you pass `--body` or `--body-file`, and that path applies no
template at all, and does so silently, because from `gh`'s side nothing is
missing.
`--template` does not rescue it either: `gh` rejects that flag outright when
either body flag is present. Fill the sections yourself and pass the result to
`--body-file`.

Where the repository has none, write
[the default description](#the-default-github-pull-request-description) instead.

**Write the title as a commit subject, not a PR headline.** Squashed (the
typical case), it becomes the first line of a permanent commit, so the commit
subject rules apply, prefix grammar included. Fast-forwarded instead, it never
reaches history and the branch's own commits carry the change.

**Do not hard-wrap the description.** GitHub soft-wraps prose, so hard wraps
buy nothing and break list continuation, blockquotes and tables. Same for issue
bodies and comments.

**Address it to the reviewer whose time you are asking for**, the one audience
a commit body does not have: which of the plausible approaches you ruled out,
and why.

**State the change, not its history.** The title and description describe the
code as it stands now, as one logical set, never a running log of "addressed
feedback" and "fixed CI". That belongs to the commits and the review threads.
Which means rewriting them as the work changes; editing is part of pushing a
fix, not a courtesy afterwards:

```sh
gh pr edit <number> --title 'Fix scheduler retry backoff' --body-file -
```

**Put the closing reference in the description.** GitHub accepts the colon
form, so write `Resolves: #123`, character for character the trailer a commit
would carry, rather than a second synonym for the same job. An issue the PR
only advances takes no keyword. That trailer on a branch commit does not
survive a squash merge unless you carry it into the squash message, which is
what makes the description the reliable place for it.

**Promote to ready only when told to.** `gh pr ready <number>` invites human
reviewers. Green checks are not the signal for it, and neither is a clean bot
pass.

## The default GitHub pull request description

**With no template to fill in, write prose and stop.** The default description
is one to three sentences saying what the change does and why, then the closing
reference:

```text
The poller's backoff reset on every poll, so a wedged job retried forever at
the floor delay. Compute it from the attempt count instead.

Resolves: #482
```

Headings are what a large change earns, not the form a small one is poured
into. A heading over two lines of text is furniture.

**When the change is large enough that a reviewer has to navigate it**, add
headings from this set, in this order, and no others:

- `## Summary`: what changed, once one paragraph no longer holds it.
- `## Testing`: what you ran and what you saw.
- `## Notes for reviewers`: where to start, what to read hardest, what you are
  unsure of.

The set is closed: a description whose shape shifts between pull requests costs
the reader the one thing a convention buys, which is knowing where to look
without reading first. A change that needs another heading usually wanted
splitting.

**Leave a section out rather than filling it.** A heading over "N/A", or over a
sentence restating the summary, teaches the next reader to skip headings, which
is what makes the ones carrying something invisible.

**`## Testing` is for what the checks cannot show.** Whether the suite passes,
lints or type-checks is already on the pull request in a form a reviewer trusts
more than prose, so restating it buries the one line that earned the section.
What they cannot see is the path you exercised by hand, the case you checked,
the edge you decided to leave, and any suite CI does not run.

If you did not exercise the change, say so: an unearned claim here is the one
part of a description that cannot be checked against the diff.

## Stacked GitHub pull requests

A unit branched from another unit's branch rather than from the trunk arrives
here as a stack. This skill covers opening the pull requests for one; landing
it is `gtb-gh-pr-merging`, and differs from an ordinary merge throughout.

**`gh stack link` is the command worth driving.** It takes branch names, PR
numbers or URLs, bottom to top, and needs no local tracking state, so it works
from a worktree, where `gh stack init` does not. Branches without a PR get one,
opened as a draft.

```sh
gh extension install github/gh-stack   # once, if `gh stack` is not installed
gh stack link auth-layer api-routes ui-components
```

**`gh stack` is an extension rather than part of `gh`.** Absent it, the command
fails as an unknown one, which reads like a typo rather than a missing
install, so name the install instead of retrying the command.

Some of what it does belongs to the human rather than to you: it pushes branch
arguments to the remote before looking them up, and `--open` marks PRs ready
for review, new and existing alike, so it can promote a draft that was
deliberately left as one.

## Watching checks after a push to an open GitHub pull request

**After every push to a PR that already exists, draft or ready, watch its
checks.** A push you do not follow up on is a claim that the work is done,
backed by nothing.

**Run the watch in the background.** A green matrix takes minutes, and a
foreground call wastes the whole wait; in Claude Code that is `Bash` with
`run_in_background: true`. Report what you pushed, say checks are running, and
pick the result up when it lands.

```sh
gh pr checks --watch --fail-fast
```

**`--fail-fast` says when to start diagnosing, never when to push.** It returns
on the first failure, with the run still going.

**Push once the checks that test the code have finished**, so the push carries
every failure the run found rather than the first. An automated reviewer
reports as a check too and can sit queued far longer than the build, so waiting
on that is how a review holds up a fix it has nothing to do with. One already
running is worth the wait: a single push can carry its findings as well.

A watch can report green, or a failure, having earned neither: before the
checks exist, and after a promotion. `references/watching-checks.md` has
those, the exit codes, and how to tell a code check from a reviewer's.

## Watching checks after promoting a GitHub pull request to ready

**Watch the checks after `gh pr ready`, the same as after a push.** Marking a
PR ready starts what was waiting on it: jobs that skip drafts, and a reviewer
that skips drafts. You are not summoning any of it; you are checking on what
your own command started.

**An instant green after a promotion is the draft's own run**, still there and
still passing while nothing new has registered yet.
`references/watching-checks.md` covers what to do with that, and when to stop
watching.

## Acting on review feedback on a GitHub pull request

**Do not summon an automated reviewer, and do not wait for one.** Firing it is
the human's move, and it comes after their own pass over the code. A review
aimed at code the author has not read yet burns tokens and rate-limit budget on
findings that reading would have made moot.

**Your work ends at green checks.** Report and stop. The findings come back to
you when the human brings them, often in a later session.

Read the pass yourself rather than working from whatever was quoted at you: a
summary of a review is not the review. Feedback lands on separate surfaces: the
body of each submitted review, the inline comments anchored to lines, and the
conversation comments on the PR. Reviewers routinely split an overview from its
specifics across two of them.

```sh
gh pr view <number> --json reviews,comments
gh api --paginate repos/{owner}/{repo}/pulls/<number>/comments
```

`--json comments` never includes the inline comments, and its ids belong to a
different space: they 404 against the review-comment endpoint. Ask for every
page of them: without `--paginate` a busy PR hands back the first page and the
rest of the findings simply are not there.

`gh` fills in `{owner}` and `{repo}` from the current repository, but some
shells read braces as their own. PowerShell is one, and eats them unless the
endpoint is quoted.

**Judge the findings; do not apply them reflexively.** Confident false
positives are common, and no reviewer knows the constraint you were working
under. Fix what is real, decline what is not, batch the fixes into one push,
and bring the description back in line with what the code now does.

**One finding, one commit. Still one push.** Review fixes are ordinary work,
so the commit rules apply unchanged: fix one problem, commit it,
take the next, and push the run of them together. Fixing everything and carving
it up afterwards ends in a single "Address review feedback": a subject naming
the process instead of the change, over a diff nobody can revert a piece of.

**Push the fixes, then reply.** A reply written first is a promise; the same
reply after the push is a report pointing at a commit.

**Reply only to accounts other than the one you post from**: `gh api user
--jq .login`. Review comments the author leaves are work handed to you, not a
conversation: answering reads as the author agreeing with the author. Do the
work, say what you did in the session, and leave the thread for them to resolve.

**Answer on the surface the point was raised on.** Conversation comments take
`gh pr comment`; an inline reply goes on the thread root, the comment whose
`in_reply_to_id` is null:

The reply body goes in on standard input like every other one: `-F body=@-`,
not `-f body='…'`. An inline field argument is shell prose again, and Markdown
is what suffers: backticks, quotes and fenced blocks get eaten on the way
through.

```sh
gh api repos/{owner}/{repo}/pulls/<number>/comments \
  --jq '.[] | "\(.id) \(.path) \(.in_reply_to_id)"'
gh api repos/{owner}/{repo}/pulls/<number>/comments/<root-id>/replies \
  -F body=@- <<'BODY'
Applied in 2f8665e.
BODY
```

The `@` here belongs to gh, not to the shell, which is what separates this from
`--body` above. A PowerShell here-string goes straight into `--body` because
that value is an ordinary argument; written as `-F body=@'…'@` it never reaches
PowerShell's parser at all: gh reads `@` as its own read-from-file syntax and
dies opening a file named after the first line of the message. Only `@-` means
standard input, so the here-string is piped in rather than passed:

```powershell
@'
Applied in 2f8665e.
'@ | gh api 'repos/{owner}/{repo}/pulls/<number>/comments/<root-id>/replies' -F body=@-
```

## Merging a GitHub pull request

**Not here, and not necessarily yours.** A reviewer lands what they approved as
often as the author does, so the merge method, the squash message, the branch
deletion and auto-merge are `gtb-gh-pr-merging`. Load it when a request is
actually being landed.
