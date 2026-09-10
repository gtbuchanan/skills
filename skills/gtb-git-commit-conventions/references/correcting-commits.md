# Correcting an earlier Git commit

What to do about a commit that already exists and turned out wrong: changing it
where the history is still yours to rewrite, undoing it where it is not.

## Amending

1. `git commit --fixup=<sha>`: a fixup pinned to its target.
1. `git rebase --autosquash <base>`: replays the branch, squashing each fixup
   into the commit it names.

Preferred because it is non-interactive. `git rebase -i` needs an editor driven
through todo-list edits, which agents cannot do reliably; reset-and-recommit and
cherry-pick reconstructions discard authorship and author dates and are easy to
get silently wrong. Plain `git commit --amend` is fine when the target is `HEAD`.

**Amending a message replaces it.** `--amend -F -` swaps the whole message for
what you hand it, so anything you do not retype is gone: a dropped
`Co-authored-by:` takes the credit with it, and nothing restores it later. Pass
`--no-edit` where only the tree is changing, and where the message is what you
are there for, re-supply the trailers through `--trailer` rather than typing the
block back into the body, exactly as on a fresh commit.

**Once someone else can see the branch, prefer adding a commit to rewriting
one.** A fixup-and-rebase rewrites published history: anyone holding the branch
has to reconcile it, and a reviewer loses the incremental diff since they last
looked. Land the correction as its own commit and let the eventual squash tidy
it away.

The criterion is whether anyone is watching, not whether `push` has run: a
branch pushed for backup, or a PR nobody has opened yet, is still yours to
rewrite. When you do rewrite a pushed branch, the push needs
`--force-with-lease`, never a bare `--force`: the lease refuses when the remote
moved under you instead of overwriting that work. A local-only amend needs no
force at all; check `git status` against the tracking branch first. Never
force-push a shared base branch like `main`.

## Reverting

Use `git revert <sha>` rather than hand-editing the code back. It computes the
exact inverse diff, so nothing is missed, and it records the reverted commit's
sha and subject, so the history states what happened and the revert can itself
be reverted. A manual undo is a reconstruction from memory: it drifts from the
original, and it leaves no link to what it was undoing.

- `git revert -m 1 <sha>` for a merge commit, which has no single parent to
  invert against, so name the one to keep.
- `git revert -n <sha>` stages the inverse without committing, for combining the
  revert with other work. Name a contiguous run as `<oldest>^..<newest>`; do not
  write a bare `<sha>...`, which git reads as a symmetric-difference range and
  will quietly revert a commit other than the one you named.
- Keep git's generated message and add the why to the body. Whether `git revert`
  stops to let you write that depends on whether it was given a terminal, so
  settle it rather than inherit it: take the generated message with `--no-edit`,
  read it back, and amend it with the why written in. Git writes the reverted
  sha there in full, and that reference is what makes the revert auditable, so
  it has to come through the round trip character for character.

  ```sh
  git revert --no-edit <sha>
  git log -1 --format=%B   # the message to carry through, verbatim
  git commit --amend -F - <<'MSG'
  Revert "Switch the limiter to a fixed window"

  This reverts commit 87a8aa57a2d179e57ead661e27c4f5e6dbc3aa14.

  The fixed window let a full limit through on either side of a bucket
  boundary, so a caller could spend twice its budget in a few seconds.
  MSG
  ```

If the commit is unpushed and on your own branch, dropping it is cleaner than
carrying both it and its revert, but that is a rebase, not a hand-undo.
