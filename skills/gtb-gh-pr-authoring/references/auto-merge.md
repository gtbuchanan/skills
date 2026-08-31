# Auto-merging a GitHub pull request

What `gh pr merge --auto` settles at enable time and cannot be asked again
later. The merge lands unattended, so everything here is a decision made once,
in the dark, against code nobody is watching.

## The auto-merge message lands as supplied

**The message goes in with the flag.** The merge runs using whatever was given
at enable time, so leaving `--subject` and `--body-file` off lands GitHub's
default message permanently.

```sh
gh pr merge --auto --squash \
  --subject 'Fix scheduler retry backoff (#1234)' \
  --body-file -
```

**A stored message goes stale the moment the PR moves on.** Before making any
further change, take auto-merge off with `gh pr merge --disable-auto`, then
re-enable with the message rewritten against the code as it now stands.

## Auto-merge and branch deletion

**`--delete-branch` does nothing once auto-merge is actually armed.** `gh`
treats `--auto` as auto-merge only when the PR cannot merge yet; when nothing is
outstanding it merges directly instead, and the flag behaves as it always does.
So the same command deletes the branch or silently does not, depending on
whether a requirement happened to be pending — and when it is pending, `gh` has
returned long before the merge, so both the local and the remote branch stay.

Whether that costs anything is a repository setting:

```sh
gh repo view --json deleteBranchOnMerge
```

That setting states an intention rather than an outcome: a branch protection
rule or a repository ruleset restricting deletion stops the cleanup, and
`deleteBranchOnMerge` still reads `true` afterwards. Where a rule might cover
the head branch, the answer is what the branch did, not what the setting said.

Where the repository does delete head branches itself, `--auto` gives up
nothing. Where it does not, the branch outlives the session that could have
removed it,
so settle it before enabling: take the wait and merge synchronously, or say in
the handoff that the branch is left to sweep up. The local branch is left either
way.

**The dependent-PR check still applies, and lands unattended.** Everything in
`stacked-pull-requests.md` about deleting a branch another PR still points at
holds here, with nobody present to notice it going wrong.
