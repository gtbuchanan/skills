# Stacked GitHub pull requests

Everything that changes when a pull request has another one sitting on top of
it — whether a stacking tool put it there or the branches were pointed at each
other by hand. The ordinary PR rules still hold; these replace the ones they
contradict.

## Creating a stack with gh stack link

**`gh stack link` is the command worth driving.** It takes branch names, PR
numbers or URLs, bottom to top, and needs no local tracking state — so it works
from a worktree, where `gh stack init` does not. Branches without a PR get one,
opened as a draft.

```sh
gh stack link auth-layer api-routes ui-components
```

Two of its behaviours belong to the human rather than to you: it pushes branch
arguments to the remote before looking them up, and `--open` marks PRs ready
for review — new and existing alike, so it can promote a draft that was
deliberately left as one.

## Merging a stacked pull request

**`gh pr merge` will not merge a stack member.** It fails with "must be merged
using the asynchronous merge REST API". This is about being in a stack, not
about where you sit in one: the bottom PR, based on the trunk with nothing
under it, fails the same way. Membership also outlives the merges: the last
member standing, with everything below it already landed, is refused just like
the first.

`gh pr list` does not report membership, so the error is how you find out.
After that, the API can tell you what the stack looks like and whether you are
allowed to bypass:

```sh
gh api graphql -f query='query { repository(owner: "OWNER", name: "REPO") {
  pullRequest(number: 123) {
    viewerCanMergeAsAdmin
    stackEntry { position stack { number size } }
  } } }'
```

```sh
gh api --method PUT 'repos/{owner}/{repo}/pulls/<number>/merge-async' \
  -f merge_method=squash -f sha=<head-sha> \
  -f commit_title='Fix scheduler retry backoff (#1234)' -F commit_message=@-
```

That returns `status: pending`, so poll until the PR reads `MERGED`. It can
also return `status: failed` with an HTTP 400 — a draft PR does that — so check
the response before you start polling. Pin `sha` so a push landing between the
read and the merge cannot be the thing that merges. The endpoint takes no
branch-deletion flag, so a branch that disappears anyway went to the
repository's `deleteBranchOnMerge`.

**A member above the one that merged is moved for you.** GitHub retargets it
onto the new base either way — that much is not what the stack buys you. What a
real stack adds is the rebase: the member's commits are replayed onto the new
base, so it arrives ready rather than carrying work the base already has. A
plain stack — only a base pointer, with no `gh stack` behind it — gets the
pointer moved and nothing else, so it still wants restacking by hand.

**That move is a rebase, so the member's commits lose their signatures.** They
are replayed as new objects the original signatures do not cover, and an author
running vigilant mode sees them marked Unverified under their own name. There
is no flag to decline it; the stack rebases on your behalf.

It stops at the branch, though, provided you squash. A squash merge replaces
those commits outright: GitHub builds the one that lands on the trunk, commits
it as itself and signs it, so what history keeps is verified whatever the
branch looked like. Fast-forwarding a member instead preserves exactly what is
on the branch, which after the stack's rebase is the unsigned version — so it
is squashing that saves you here, not merging in general.

**No CLI route bypasses a requirement here.** `merge-async` takes the request
and answers `status: pending` exactly as it would for a mergeable PR, then
leaves it blocked and never merges it — so the refusal arrives looking like
success, and a poll waiting for `MERGED` waits forever. `--admin` gets further
and still
fails: the base-branch complaint does disappear, so the bypass itself worked,
and the merge then falls over on stack membership instead. The merge box on the
PR page is not so limited: with the rights to use it, a "merge without waiting
for requirements to be met" checkbox appears there for a blocked stack member,
including one with unmerged PRs still above it. That is their call to make, so
say the PR is blocked and leave it to them.

Unstacking is the other way round it — leave the stack, merge as an ordinary
PR, restack — and it costs more than it looks. The PRs above were not stack
members when the merge happened, so none of them was rebased and each needs
restacking by hand. And an ordinary PR merges through `gh pr merge`, which puts
`--delete-branch` back in play with those PRs pointing at the branch it is
about to delete, so retarget them first, as
[deleting the branch under a dependent](#deleting-the-branch-under-a-dependent-pull-request)
describes.

**`gh stack merge` is not a way round it either.** It merges a stack
atomically, which is genuinely useful, but it exposes no subject or body flag,
so from the CLI what lands is the default message. The web UI does let you
write one, so this is a gap in the extension rather than a limit on stacked
merges. Give it a bare number and it reads that as a stack number before trying
it as a PR number.

## Deleting the branch under a dependent pull request

**The deletion has to wait for the dependents.** Merging retargets a dependent
onto the merged PR's base on its own, but `--delete-branch` does not wait for
that, so the branch goes while the PR still points at it — and deleting a branch
another PR is based on closes that PR rather than moving it. Either retarget
them yourself first and then merge with `--delete-branch`, or merge without it,
let GitHub move them, and delete the branch afterwards. What you cannot do is
delete while something still points there — and having merged, do not retarget
by hand out of habit, since that is work GitHub has already done.

```sh
gh pr edit <dependent-number> --base <base-branch>
git push origin --delete <branch>
```

**Retargeted is not restacked.** Moving the base pointer is the whole of what
happens to a dependent that no stacking tool is managing; its own branch still
carries the commits that just merged, so its diff against the new base opens
with work that has already landed. Replay it onto the new base yourself. The
merged PR still reports the sha its branch was deleted at, which is the
boundary to replay from:

```sh
gh pr view <merged-number> --json headRefOid --jq '.headRefOid'
git log --oneline <head-sha>..<dependent-branch>   # read before replaying
git rebase --onto <base-branch> <head-sha> <dependent-branch>
git push --force-with-lease origin <dependent-branch>
```

**Read that range before you replay it.** `--onto` replays everything reachable
from the dependent and not from `<head-sha>`, which is the dependent's own work
only while the parent's history is the one the dependent forked from. Amend or
force-push the parent after that, and the dependent still holds the pre-rewrite
copies of the parent's commits — different shas, so unreachable from
`<head-sha>`, so replayed too. What you get is the parent's work committed
twice, once in each form, and conflicts where the rewrite touched anything.

The range says which case you are in without your having to reconstruct the
branch's history: if it lists only commits you recognise as the dependent's,
the boundary is right. Anything else in there means the parent moved under it,
and the sha to replay from is wherever the two histories actually diverge —
`git merge-base <head-sha> <dependent-branch>` — with the duplicated commits
dropped by hand.

A stacking tool and a hand-rolled stack are the same hazard for the deletion,
because only the base pointer matters there. They part company over the restack:
a real stack replays the dependent for you, at the cost in signatures
[the merge section](#merging-a-stacked-pull-request) covers.

**If one has already been closed this way, reopen it rather than replacing
it.** Reopening is refused outright while the base branch is missing, and
`--delete-branch` took your local copy of it too — but the merged PR still
reports the sha it was deleted at, so nothing is actually lost:

```sh
gh pr view <merged-number> --json headRefOid --jq '.headRefOid'
git push origin <sha>:refs/heads/<deleted-branch>
gh pr reopen <closed-number>
gh pr edit <closed-number> --base <base>
```

That restores the same pull request — its number, its threads, its review
history — which is the reason to do it rather than open a replacement and lose
all of it. Delete the branch again once the reopened PR points elsewhere.
