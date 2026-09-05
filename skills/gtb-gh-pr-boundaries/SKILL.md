---
name: gtb-gh-pr-boundaries
description: >-
  How planned units of work become GitHub pull requests — how many there are,
  where each branch starts, and when each one opens. Load before the first edit
  of work headed for GitHub, alongside whatever plans the units: all three are
  settled while the code is written, and a branch already carrying four units
  cannot be re-cut into four pull requests without redoing the work. Also use
  for any explicit question about whether work is one pull request or several,
  whether two should be stacked, or when to open one. Opening, reviewing and
  merging belong to gtb-gh-pr-authoring; this decides only the boundaries.
---

# Where a change's boundaries fall on GitHub

Planning a change produces **units** — each one complete, each passing its own
checks, each revertable alone. Whatever governs that planning owns where the
seams fall. This skill owns what becomes of those seams on GitHub: how many pull
requests carry them, where each branch starts, and when each one opens.

All three are settled while the work is written, which is the only reason this
is separate from `gtb-gh-pr-authoring`. That skill governs everything a pull
request needs once it exists, and it is reached when one is being opened — by
which point a branch carrying four units already exists, and none of what
follows can be applied to it without redoing the work.

## How many GitHub pull requests

**One unit, one pull request, by default.** Bundling is the exception and needs
a reason — units too small to be worth a pass of their own, or that cannot be
verified apart. A reviewer approves a pull request rather than a unit, so a
request carrying two decisions gets one judgment covering both.

**Under a squash merge the pull request is the only boundary that reaches
history.** The branch's commits are replaced by the single one the merge writes,
so units bundled into one request arrive as one commit, and the revert, the
bisect and the blame they were shaped for go with them. That makes the count a
decision about history rather than about review convenience — and squash is what
`gtb-gh-pr-authoring` merges with unless told otherwise.

Where the repository lands a branch intact instead, its commits survive the
merge and bundling costs less. Check rather than assume:

```sh
gh repo view --json mergeCommitAllowed,rebaseMergeAllowed,squashMergeAllowed
```

Even then the reviewer's attention is an argument on its own, and usually
enough.

## Where a GitHub branch starts

**Dependency decides, and it decides before the unit is written.** A unit
blocked behind one that has not merged branches from its predecessor and arrives
as a stack. An independent unit branches from the trunk, costs nothing at merge
time, and lands in any order.

A stack assembled afterwards, out of units written onto one branch, means
re-cutting every branch around code that already exists — which is the work the
plan was supposed to save.

**Prefer the trunk wherever the dependency is not real.** A stack is expensive
where it ends. `gh pr merge` will not merge a pull request that belongs to one:
every member is refused, the bottom one included, and the merge has to go
through a separate REST endpoint instead. Nothing bypasses a branch protection
requirement without unstacking first, and each pull request above the one that
lands may need retargeting by hand.

## When a GitHub pull request opens

**Open a unit's pull request when that unit goes green, before the next one
begins.** A unit whose checks pass is finished as code and not yet finished as a
unit: left sitting on the branch while the next is written, the two arrive
together whatever the plan said.

Nothing fails when this is skipped, which is why it is the step that quietly
does not happen. Writing every unit first and deciding afterwards how to divide
them is how a four-unit plan lands as one pull request.

## Then the mechanics

Once a pull request is actually being opened, `gtb-gh-pr-authoring` governs the
rest — the draft, the repository's template, the title and description, the
check watch, review feedback, and the merge. None of it is repeated here.
