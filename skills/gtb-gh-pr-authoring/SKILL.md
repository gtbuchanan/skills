---
name: gtb-gh-pr-authoring
description: >-
  Author-side conventions for GitHub pull requests — opening one as a draft,
  using the repository's template, what belongs in the title and description,
  watching checks after every push, acting on review feedback once it is
  brought to you, and squash-merging with atomic branch cleanup. Use whenever
  work is headed for a GitHub PR or one is already open: creating a PR, pushing
  to a branch that has one, marking it ready for review, reading CI results,
  answering or acting on review comments, or merging and deleting the branch.
  Reviewing someone else's PR is the opposite job — that is what the
  gtb-pr-review-* skills are for.
---

# Authoring a GitHub pull request

You are acting **as the author**, from the first push through the merge.

A PR produces three texts: the title, the description, and the squash message.
Hand each to the command as a literal multi-line string — never assembled
inline, never staged in a file.

```sh
# POSIX shells — quoted heredoc delimiter, onto standard input
gh pr create --draft --title 'Fix scheduler retry backoff' --body-file - <<'BODY'
The backoff reset on every poll, so a wedged job retried forever.
BODY
```

```powershell
# PowerShell — here-string straight into --body; no pipe, no stdin
gh pr create --draft --title 'Fix scheduler retry backoff' --body @'
The backoff reset on every poll, so a wedged job retried forever.
'@
```

## Commit conventions in a GitHub pull request

Most of what this skill produces ends up in `git log`: the title becomes the
squash subject, the squash body becomes that commit's body, and the branch
carries its own commits, review fixes included. Load
`gtb-git-commit-conventions` before writing any of them — it governs all of it,
and none of its rules are repeated here.

The description is the exception. It stays in GitHub's UI, so those rules
govern what it says but not how it is formatted.

## The GitHub pull request pipeline

A PR moves through six stages, and the last three transitions are the human's:

1. **Draft opened** — the PR exists and CI can run against it; no review is
   requested.
1. **Checks** — every push is followed by a check watch.
1. **Author review** — the human reads the code on GitHub. **Your work stops
   here:** report what you pushed and what the checks said.
1. **Hosted agent review** — the human fires an automated reviewer once their
   own pass is done. You neither summon it nor wait for it; you act on the
   findings when they are brought to you.
1. **Ready** — the human promotes, which invites human reviewers.
1. **Human peer review** — and then the merge.

Each gate spares the next reader what the previous one would have caught:
checks before the author, the author before the machine, the machine before the
peers. Skipping ahead costs somebody real budget or real attention.

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
tidying — that is the moment for it, before anything else is anchored.

**Push once per unit of work, not once per commit.** Every push to an open PR
restarts the check matrix and re-triggers any reviewer already watching, so
three quick pushes buy three CI runs and three overlapping reviews, most of
them stale by the time they post.

## Opening a GitHub pull request

**Open every PR as a draft.** Opening one is visible either way — watchers hear
about it — but marking it ready is what _requests_ review, from CODEOWNERS and
from whatever else watches that transition.

**Use the repository's PR template if one exists.** `gh repo view` returns the
ones GitHub itself resolved, body and all, so there are no paths to guess at:

```sh
gh repo view --json pullRequestTemplates --jq '.pullRequestTemplates[].body'
```

`gh` fills a template in only while a human is answering its prompts.
Non-interactively you pass `--body` or `--body-file`, and that path applies no
template at all — silently, because from `gh`'s side nothing is missing.
`--template` does not rescue it either: `gh` rejects that flag outright when
either body flag is present. Fill the sections yourself and pass the result:

```sh
gh pr create --draft --title 'Fix scheduler retry backoff' --body-file -
```

Where the repository has none, write
[the default description](#the-default-github-pull-request-description) instead.

**Write the title as a commit subject, not a PR headline.** Squashed — the
typical case — it becomes the first line of a permanent commit, so the commit
subject rules apply, prefix grammar included. Fast-forwarded instead, it never
reaches history and the branch's own commits carry the change.

**Do not hard-wrap the description.** GitHub soft-wraps prose, so hard wraps
buy nothing and break list continuation, blockquotes and tables. Same for issue
bodies and comments.

**Address it to the reviewer whose time you are asking for** — the one audience
a commit body does not have. Where to start, what to read hardest, which of the
plausible approaches you ruled out and why.

**State the change, not its history.** The title and description describe the
code as it stands now, as one logical set, never a running log of "addressed
feedback" and "fixed CI". That belongs to the commits and the review threads.
Which means rewriting them as the work changes — editing is part of pushing a
fix, not a courtesy afterwards:

```sh
gh pr edit <number> --title 'Fix scheduler retry backoff' --body-file -
```

**Put the closing reference in the description.** GitHub accepts the colon
form, so write `Resolves: #123` — character for character the trailer a commit
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
The backoff reset on every poll, so a wedged job retried forever at the floor
delay. Compute it from the attempt count instead.

Resolves: #482
```

Headings are what a large change earns, not the form a small one is poured into
— much of what the largest repositories ship as a template renders nothing at
all, and their merged pull requests look the same. A heading over two lines of
text is furniture.

**When the change is large enough that a reviewer has to navigate it**, add
headings from this set, in this order, and no others:

- `## Summary` — what changed, once one paragraph no longer holds it.
- `## Testing` — what you ran and what you saw.
- `## Notes for reviewers` — where to start, what to read hardest, what you are
  unsure of.

The set is closed because a description whose shape changes from one pull
request to the next costs the reader the only thing a convention buys them,
which is knowing where to look without reading first. A change that seems to
need a fourth heading usually wanted splitting.

**Leave a section out rather than filling it.** A heading over "N/A", or over a
sentence restating the summary, teaches the next reader to skip headings — which
is what makes the ones carrying something invisible.

**`## Testing` is for what the checks cannot show.** Whether the suite passes,
whether it lints, whether it type-checks — all of that is already on the pull
request in a form a reviewer trusts more than prose, so restating it pads the
section and buries the one line that earned it. What they cannot see is the path
you exercised by hand, the case you checked, the edge you decided to leave, and
any suite CI does not run. Naming those is the whole job; naming a green check
is filler that reads as diligence, which is what makes it easy to write.

If you did not exercise the change, say so — an unearned claim here is the one
part of a description that cannot be checked against the diff.

## Splitting work across stacked GitHub pull requests

**Default to one pull request.** A stack is expensive where it ends: `gh pr
merge` refuses its members, nothing bypasses a requirement without unstacking
first, and each PR above the one that lands may need retargeting or restacking
by hand. Splitting has to buy more than that costs.

**Split when a reviewer would otherwise have to accept two decisions at once.**
An enabling refactor and the feature it enables can be read and approved
separately; bundled, the reviewer takes both or blocks both. The same goes for
a bulk rename that would otherwise bury the change it was made for.

**Split when the diff is too large to hold in one reading.** A reviewer who
cannot keep the whole change in their head approves it on trust, which is the
outcome review exists to avoid.

**Split when work you need to start is blocked behind work that has not
merged.** Here the stack buys you the second PR early, and that is worth the
merge-time cost.

**Do not split when the pieces are independent.** Separate PRs off the trunk
cost nothing at merge time and land in any order — a stack of things that did
not need ordering is pure overhead. And do not split what has to land together
anyway: that is one change wearing several hats.

Once you have decided to split, read `references/stacked-pull-requests.md`:
creating a stack and merging one both differ from what follows here.

## Watching checks after a push to an open GitHub pull request

**After every push to a PR that already exists — draft or ready — watch its
checks.** A push you do not follow up on is a claim that the work is done,
backed by nothing.

**Run the watch in the background.** A green matrix takes minutes, and a
foreground call wastes the whole wait; in Claude Code that is `Bash` with
`run_in_background: true`. Report what you pushed, say checks are running, and
pick the result up when it lands.

```sh
gh pr checks --watch
```

Exit 0 means every check passed and 1 means at least one failed; 8 means they
are still pending, which a completed `--watch` should not give you. Prefer the
plain watch over `--fail-fast`: learning about one failure per push costs
another full matrix each time.

Immediately after a push, before any workflow has registered, `gh pr checks`
reports that the branch has no checks rather than waiting for some to appear —
and exits 1 for it, the status a real failure gets. `--watch` does not help:
the branch is read before the watch loop starts, so it returns rather than
waiting for checks to appear. Exit 1 on its own therefore does not mean a check
failed — read what it printed. "no checks reported" is too early rather than
red, so watch again instead of reporting the push as broken. If it keeps saying
it, the branch has nothing configured to run, which is worth saying plainly and
is still not green.

## Acting on review feedback on a GitHub pull request

**Do not summon an automated reviewer, and do not wait for one.** Firing it is
the human's move, and it comes after their own pass over the code. A review
aimed at code the author has not read yet burns tokens and rate-limit budget on
findings that reading would have made moot.

**Your work ends at green checks.** Report and stop. The findings come back to
you when the human brings them, often in a later session.

Read the pass yourself rather than working from whatever was quoted at you — a
summary of a review is not the review. Feedback lands on three surfaces: the
body of each submitted review, the inline comments anchored to lines, and the
conversation comments on the PR. Reviewers routinely split an overview from its
specifics across two of them.

```sh
gh pr view <number> --json reviews,comments
gh api --paginate repos/{owner}/{repo}/pulls/<number>/comments
```

`--json comments` never includes the inline comments, and its ids belong to a
different space — they 404 against the review-comment endpoint. Ask for every
page of them: without `--paginate` a busy PR hands back the first page and the
rest of the findings simply are not there.

`gh` fills in `{owner}` and `{repo}` from the current repository, but some
shells read braces as their own. PowerShell is one, and eats them unless the
endpoint is quoted.

**Judge the findings; do not apply them reflexively.** Confident false
positives are common, and no reviewer knows the constraint you were working
under. Fix what is real, decline what is not, batch the fixes into one push,
and bring the description back in line with what the code now does.

**One finding, one commit — still one push.** Review fixes are ordinary work,
so the commit rules apply unchanged: fix one problem, commit it,
take the next, and push the run of them together. Fixing everything and carving
it up afterwards ends in a single "Address review feedback" — a subject naming
the process instead of the change, over a diff nobody can revert a piece of.

**Push the fixes, then reply.** A reply written first is a promise; the same
reply after the push is a report pointing at a commit.

**Reply only to accounts other than the one you post from** — `gh api user
--jq .login`. Review comments the author leaves are work handed to you, not a
conversation: answering reads as the author agreeing with the author. Do the
work, say what you did in the session, and leave the thread for them to resolve.

**Answer on the surface the point was raised on.** Conversation comments take
`gh pr comment`; an inline reply goes on the thread root, the comment whose
`in_reply_to_id` is null:

The reply body goes in on standard input like every other one — `-F body=@-`,
not `-f body='…'`. An inline field argument is shell prose again, and Markdown
is what suffers: backticks, quotes and fenced blocks get eaten on the way
through.

```sh
gh api repos/{owner}/{repo}/pulls/<number>/comments \
  --jq '.[] | "\(.id) \(.path) \(.in_reply_to_id)"'
gh api repos/{owner}/{repo}/pulls/<number>/comments/<root-id>/replies \
  -F body=@-
```

## Merging a GitHub pull request

**Never rebase-merge.** `--rebase` replays each commit onto the base as a new
object, and the original signature does not come with it. For an author running
vigilant mode — GitHub's "flag unsigned commits as unverified" — every replayed
commit then lands publicly marked **Unverified** against their name, and
nothing puts the signature back. It also lands a run of commits carrying no PR
reference. Squash unless told otherwise.

**Do not reach for `--admin` unless asked.** It merges past requirements the
repository put there deliberately. Say the PR is blocked and let the human
decide.

**Check when the checks last ran.** A run says the branch was compatible with
the base at that moment; nothing re-runs it when something else lands on the
base. Two PRs green on the same commit can still break it once both land. If
the last run predates a merge touching the same files, say so rather than
merging on it.

**Write your own squash message.** What GitHub generates instead depends on a
repository setting and on how many commits the branch has, and one of those
defaults is every commit on the branch, fixups included, in a body nobody will
read and history keeps. Do not leave it to chance.
Summarize the change as a single commit, then add the PR
reference suffix — `--subject` replaces the subject GitHub would have
generated, and nothing re-adds the number.

```sh
gh pr merge --squash --delete-branch \
  --subject 'Fix scheduler retry backoff (#1234)' \
  --body-file -
```

**Carry the branch's trailers into the squash body.** A squash keeps only the
message you supply, so trailers on the individual commits are dropped —
`Co-authored-by:` most damagingly, since nothing restores credit afterwards.
Collect them across the range, drop duplicates, and re-emit them as the body's
final paragraph:

```sh
git log <base>..<head> --format='%(trailers:only,unfold)'
```

**The branch has to go, and nothing may still be pointing at it when it does.**
Those are the two things that matter; the order that gets you there is a
detail. Deleting a branch some other PR is still based on closes that PR rather
than moving it, and leaving the branch behind means it outlives the PR it
belonged to.

**Check for dependents before you merge**, because the answer decides which
order to use:

```sh
gh pr list --base <branch> --state open --json number,title,headRefName
```

**With none, delete in the same command.** `--delete-branch` on the merge is
one step that cannot be forgotten, and a follow-up step is exactly what gets
skipped when the merge output is misread.

**With any, move them before the branch goes.** Deleting a branch another PR is
based on closes that PR rather than retargeting it, and merging on its own
moves nothing — only the repository's own post-merge cleanup does, where it is
set to delete the branch for you. So which order is safe depends on who deletes
the branch, and the dependent still needs replaying afterwards. Read
`references/stacked-pull-requests.md` before you merge.

**If `gh pr merge` fails with "must be merged using the asynchronous merge REST
API", the PR is in a stack.** Little of what follows applies unchanged — read
`references/stacked-pull-requests.md` before going further.

**Never enable auto-merge unless asked.** `--auto` is a bet that no more
feedback is coming, and that is the human's bet to place. It also stretches the
staleness window to an unknown length, since the merge lands at some later
moment with nobody watching. When it is asked for, read
`references/auto-merge.md` — the message it will land, and whether the branch
survives, are both settled at enable time and cannot be fixed afterwards.

**One expected failure is not a failure.** If `gh pr merge --delete-branch`
succeeds but prints `fatal: 'main' is already used by worktree at ...`, the PR
merged and the remote branch was deleted; only the local deletion failed,
because the base branch is checked out in another worktree. Do not re-run the
merge.
