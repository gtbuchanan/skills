---
name: gtb-gh-pr-merging
description: >-
  Landing a GitHub pull request: choosing the merge method, writing the squash
  message and carrying the branch's trailers and co-authors into it, checking
  for dependent pull requests before the head branch goes, deleting that branch
  atomically with the merge, enabling auto-merge, and the asynchronous endpoint
  a stacked request needs. Use whenever a pull request is being merged,
  squashed, auto-merged, restacked after a merge, or its branch cleaned up, as
  the author or as a reviewer landing someone else's work.
---

# Merging a GitHub pull request

**Whoever the repository lets land it merges it.** A reviewer lands what they
approved as often as the author does, so nothing here assumes you wrote the
code, only that the merge is yours to run.

Opening the request, its title and description, the check watch and the review
threads are `gtb-gh-pr-authoring`.

## Commit conventions in a squashed GitHub merge

The squash message is a commit message: its subject and body are what history
keeps of the whole branch. Load `gtb-git-commit-conventions` before writing
either.

## Choosing a merge method for a GitHub pull request

**Never rebase-merge.** `--rebase` replays each commit onto the base as a new
object, and the original signature does not come with it. For an author running
vigilant mode (GitHub's "flag unsigned commits as unverified"), every replayed
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

**Fast-forwarding marks the request merged only if its head commit reaches the
base**: GitHub infers that once and never revisits it, and a branch rewritten
since its last push no longer carries it. Confirm before merging:

```sh
git merge-base --is-ancestor "$(gh pr view <number> --json headRefOid --jq .headRefOid)" HEAD
```

## Writing the squash message for a GitHub pull request

**Write your own squash message.** What GitHub generates instead depends on a
repository setting and on how many commits the branch has, and one of those
defaults is every commit on the branch, fixups included, in a body nobody will
read and history keeps. Summarize the change as a single commit, then add the
PR reference suffix: `--subject` replaces the subject GitHub would have
generated, and nothing re-adds the number.

**Hand the body to the command as a literal multi-line string**: never
assembled inline, never staged in a file.

```sh
# POSIX shells: quoted heredoc delimiter, onto standard input
gh pr merge --squash --delete-branch \
  --subject 'Fix scheduler retry backoff (#1234)' \
  --body-file - <<'BODY'
The poller's backoff reset on every poll, so a wedged job retried forever.
BODY
```

```powershell
# PowerShell: here-string straight into --body; no pipe, no stdin
gh pr merge --squash --delete-branch --subject 'Fix scheduler retry backoff (#1234)' --body @'
The poller's backoff reset on every poll, so a wedged job retried forever.
'@
```

**Carry the branch's trailers into the squash body.** A squash keeps only the
message you supply, so trailers on the individual commits are dropped,
`Co-authored-by:` most damagingly, since nothing restores credit afterwards.
Collect them across the range, drop duplicates, and re-emit them as the body's
final paragraph:

```sh
git log <base>..<head> --format='%(trailers:only,unfold)'
```

**Credit the branch's other authors, whom no trailer names.** A teammate's
commit carries them on the commit object rather than in its message, so a body
assembled from the trailers alone drops them. GitHub puts them in the message
it would have generated; supplying your own turns that off. Read the range's
authors beside its trailers, and give everyone but the author the squash lands
under a `Co-authored-by:` line:

```sh
git log <base>..<head> --format='%aN <%aE>'
```

Dedupe across both sources, not within each: a teammate with several commits,
or one a trailer already names, otherwise lands twice.

**Ask before crediting what you would not call authorship.** A typo fix, a
formatting pass and a bot's lockfile bump all leave an author behind, and
`Co-authored-by:` is a public claim that follows them into their contribution
history, so a marginal one is the human's call. Where somebody wrote part of
the change there is nothing to decide: add them and say so.

## Deleting the head branch of a merged GitHub pull request

**The branch has to go, and nothing may still be pointing at it when it does.**
The order that gets you there is a detail. Deleting a branch some other PR is
still based on closes that PR rather than moving it, and leaving the branch
behind means it outlives the PR it belonged to.

**Check for dependents before you merge**, because the answer decides which
order to use:

```sh
gh pr list --base <branch> --state open --json number,title,headRefName
```

**With none, delete in the same command.** `--delete-branch` on the merge is
one step that cannot be forgotten, and a follow-up step is exactly what gets
skipped when the merge output is misread.

**With any, move them before the branch goes.** Merging on its own moves
nothing: only the repository's own post-merge cleanup does, where it is set to
delete the branch for you. So which order is safe depends on who deletes the
branch, and the dependent still needs replaying afterwards. Read
`references/stacked-pull-requests.md` before you merge.

**One expected failure is not a failure.** If `gh pr merge --delete-branch`
succeeds but prints `fatal: 'main' is already used by worktree at ...`, the PR
merged and the remote branch was deleted; only the local deletion failed,
because the base branch is checked out in another worktree. Do not re-run the
merge.

## Merging a stacked GitHub pull request

**If `gh pr merge` fails with "must be merged using the asynchronous merge REST
API", the PR is in a stack.** Little of what precedes applies unchanged: the
merge goes through a different endpoint, a member above the one that lands is
rebased on your behalf, and the move-the-dependents-first order is refused
outright. Read `references/stacked-pull-requests.md` before going further.

## Auto-merging a GitHub pull request

**Never enable auto-merge unless asked.** `--auto` is a bet that no more
feedback is coming, and that is the human's bet to place. It also stretches the
staleness window to an unknown length, since the merge lands at some later
moment with nobody watching. When it is asked for, read
`references/auto-merge.md`: the message it will land, and whether the branch
survives, are both settled at enable time and cannot be fixed afterwards.
