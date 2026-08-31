---
name: gtb-git-commit-conventions
description: >-
  Git commit conventions — how to scope a commit, when to make one, and how to
  write the message, plus trailers, fixups, and reverts. Use whenever work in a
  Git repository is going to produce commits: implementing a feature, fixing a
  bug, refactoring, acting on review feedback, or untangling changes already
  piled up in the working tree. Also use for any explicit request to commit,
  write or reword a commit message, amend, split, squash, fixup, or revert.
---

# Git commit guidelines

The commit is the smallest durable unit of a project's history: `git log`,
`git bisect`, and `git revert` still operate on it long after the branch and
everyone who remembers the change are gone. Shape commits for those readers.
Most of that shaping happens before any message is written, which is why this
belongs at the start of the work rather than the end.

## When to make a Git commit

**Commit as soon as a logical change is complete and the project builds** — not
at the end of the session. While you are inside the change you know which edits
belong together; an hour later you are reconstructing that from a diff, and the
commits you carve out record states nothing ever built or tested.

**One logical change per commit.** A bug fix and a dependency bump, a refactor
and the feature it enabled: separate commits. That is what makes `revert`
precise, keeps `bisect` pointing at a cause rather than a bundle, and lets a
reviewer read one intention at a time.

**Two tests for whether it is one change.** Reverting the commit should remove
exactly what its subject describes and nothing else — collateral means it was
carrying a second change. And if the subject needs an "and" to stay accurate,
that "and" is usually the seam to split on.

**Atomic is not minimal.** The unit is one idea, not one file or one hunk: a
change touching a handler, its schema, and its test is one commit when it is one
thought. Splitting past that point costs more than it buys — a stream of
fragments nobody can follow, some of which do not build alone, is worse than the
tangled commit it replaced.

**Ship tests with the code they cover.** Separating them leaves the earlier
commit recording behavior nothing verified, and a later revert strands tests for
code that is gone.

**Keep mechanical churn out of semantic commits.** A reformat, bulk rename, or
import reshuffle landed alongside a fix buries the fix in noise and makes the
diff unreviewable. Give the churn its own commit; for a repo-wide reformat,
record its sha in `.git-blame-ignore-revs` so `git blame` keeps pointing at
whoever wrote the logic rather than at the formatter.

**Watch for the verb changing.** Finished extracting a helper and about to use
it, finished the feature and about to test it — the step you just finished is a
commit.

**Order commits so each stands alone.** An enabling refactor lands before the
change that needs it, so every commit builds and can be reviewed, reverted, or
bisected on its own.

**Run the project's build and checks before each commit** — its build task, its
hook runner, its test script, not a generic guess. A commit that does not build
breaks `bisect` for everyone who crosses it later.

**If work has already piled up**, split it before committing. This is recovery
rather than routine — the cost of it is exactly what committing as you go
avoids. Confirm the build at each step, and pick the coarsest tool that reaches
the seam:

- **Changes in separate files** — `git add <path>` per logical change.
- **Separate hunks in one file** — pipe one answer per hunk to `git add -p`.
  Never run it bare from a non-interactive shell: it prompts, reads EOF, stages
  nothing, and exits 0, so the no-op reads as success. `git diff` lists the
  hunks in exactly the order and count `-p` will present them, so read it
  immediately before and verify with `git diff --cached` after: the answers are
  positional, so a hunk count that shifted under you lands them on the wrong
  hunks and still exits 0.

  ```sh
  git diff | grep '^@@'            # confirm the hunks and their order
  printf 'y\nn\ny\n' | git add -p  # one answer per hunk
  ```

- **Two changes the default context merged into one hunk** — `y`/`n` cannot
  reach inside a hunk and `add -p`'s own `e` needs an editor, so cut a patch
  instead. Generate it at `-U1`: one line of context is usually enough to
  separate edits that `-U3` bundled, and it leaves `git apply` able to confirm
  the patch lands where you meant. Do not reach for `-U0` — such a patch is
  refused outright unless you pass `--unidiff-zero`, which suppresses exactly
  that check.

  ```sh
  git diff -U1 > split.patch   # cut down to one logical change
  git apply --cached split.patch
  ```

## Writing a Git commit message

Hand the message to git as one literal multi-line string — never assembled
inline, never staged in a file, never left to an editor git opens.

```sh
# POSIX shells — quoted heredoc delimiter, onto standard input
git commit -F - <<'MSG'
Fix scheduler retry backoff

The backoff interval reset on every poll, so a wedged job retried
forever at the floor delay instead of backing off.
MSG
```

```powershell
# PowerShell — here-string straight into -m; no pipe, no stdin
git commit -m @'
Fix scheduler retry backoff

The backoff interval reset on every poll, so a wedged job retried
forever at the floor delay instead of backing off.
'@
```

Each alternative fails on something a commit message routinely contains. An
inline `-m` string is shell prose: single-quoted it ends at the first
apostrophe the body has, double-quoted the shell expands `$` and backticks
before git sees them, and either way a `\n` inside it is two characters git
writes verbatim — which is how a subject and its body land on one line. A
message file written inside the repository is swept up by `git add -A` and
ships as part of the change it describes. And a bare `git commit` opens an
editor a non-interactive shell cannot answer, so it hangs or dies rather than
committing.

Quote the heredoc delimiter. Unquoted, the shell reaches into the body first,
and a message is exactly where backticks and `$` show up — an identifier in
prose becomes a command substitution.

A subject with no body still goes in `-m`: one line has no structure to lose.

These rules apply in every repository; a history full of `wip` is a reason to
raise the standard, not permission to match it. A README or CONTRIBUTING that
specifies a message format overrides them.

**Conventional Commits: off by default.** Write `Fix scheduler retry backoff`,
not `fix(scheduler): retry backoff` — the prefix earns its cost only where
tooling consumes it. This is the one question `git log` answers: a solid run of
conventional subjects means the project uses them, corroborated by config that
enforces or parses the grammar — commitlint, commitizen, semantic-release,
release-please, conventional-changelog. Check rather than assume, because the
error is asymmetric: omitting the prefix where releases derive from it silently
breaks that automation.

Release automation on its own is not the signal. What matters is whether the
tool reads commit subjects, and plenty do not — Changesets has contributors
declare each release in a `.changeset/` file, so the commit message has no
bearing on the version it picks. A project can automate releases end to end and
still want plain subjects.

**Shape the subject as a command**: one line, capitalized, imperative, no
trailing period, ≤50 characters where possible and never past 72. It should
complete _"If applied, this commit will …"_. Qualify ambiguous nouns with their
parent system, since the subject is read cold, beside commits from every other
corner of the project.

```text
Fix scheduler retry backoff       ← imperative, and clear out of context
Fixed scheduler retry backoff     ← past tense
Scheduler retry backoff fix       ← a noun, not a command
Fix retry backoff                 ← whose backoff?
```

**Separate subject from body with a blank line.** `--oneline`, `shortlog`, and
`format-patch` take the first paragraph as the title, so a body butted against
the subject is absorbed into it.

**Hard-wrap the body at 72 characters.** Git never reflows a message, and
`git log` indents it four spaces into an 80-column terminal. Do not truncate to
fit: cut implementation detail, keep the meaning.

**Spend the body on why, not how.** The diff is the authoritative account of
how. Write what it cannot show — the problem, the constraint that ruled out the
obvious approach, the consequence the next reader needs. Omit the body entirely
when the subject says everything.

**The destination decides, not the authoring tool.** Anything landing in
`git log` follows these rules, whatever composed it.

**Keep people out of the prose.** Attribution belongs in a trailer, where it is
structured and queryable. The subject and body describe the change, not who
requested, reviewed, or reported it — a name there ages badly and cannot be
edited out later.

**Avoid a leading `@`.** Hosted forges read `@name` as a user mention and notify
whoever owns that handle, permanently. Drop the sigil wherever it is not
load-bearing — `scope/package`, not `@scope/package` — and where the `@`
genuinely belongs to the identifier, expect the mention to fire.

**Keep volatile figures out.** Exact counts ("updated 14 call sites"), timings,
benchmark numbers, and version numbers drift the moment the code moves, and the
commit cannot be edited to match — prefer "update every call site". Same for
verification claims: the diff already states what changed and CI states whether
it works. Figures that record what happened are history, not drift, and belong:
a version this commit pins, a commit reference, a date in a date-keyed entry.

## Git commit message trailers

References and attribution go in a trailer block at the very end: separated from
the body by a blank line, one `Key: value` per line, no blank lines inside.

```text
Fix scheduler retry backoff

The backoff interval reset on every poll, so a wedged job retried
forever at the floor delay instead of backing off.

Resolves: #482
See-also: #467
Co-authored-by: Dana Reyes <dana@example.com>
```

Placement is strict because `git interpret-trailers` — and everything built on
it, including `git log --format='%(trailers)'` and forge tooling — parses only
the final paragraph. Prose or a blank line inside the block ends it, and every
trailer below becomes body text nothing can query.

Keys are capitalized and hyphenated. Several of these purposes have competing
synonyms in the wild; pick one spelling per purpose and keep to it:

| Trailer           | For                                             |
| ----------------- | ----------------------------------------------- |
| `Resolves:`       | the issue or ticket this commit closes outright |
| `See-also:`       | work this commit relates to but does not close  |
| `Co-authored-by:` | additional authors, as `Name <email>`           |
| `Signed-off-by:`  | the DCO sign-off, in projects that require one  |

The line between the first two is closure, not relevance: a parent epic this
commit advances is `See-also:`, because tooling acts on `Resolves:` and would
close work that is not done.

Use `git commit --trailer` rather than typing the block. One flag per entry, it
composes with `-m` and `-F`, and each value routes through
`interpret-trailers` — so the body you author never contains the block:

```sh
git commit -F - \
  --trailer 'Resolves: #482' \
  --trailer 'Co-authored-by: Dana Reyes <dana@example.com>' <<'MSG'
Fix scheduler retry backoff

The backoff interval reset on every poll, so a wedged job retried
forever at the floor delay instead of backing off.
MSG
```

That matters most for trailers added by convention rather than by thought — an
agent's own `Co-authored-by:`, a required sign-off — which are exactly the ones
that get hand-appended on autopilot into the wrong paragraph.

A trailer value is a reference or an identity, never prose, and is exempt from
the 72-column wrap: it is one logical line, so wrapping a long URL breaks the
parse.

## Amending an earlier Git commit

1. `git commit --fixup=<sha>` — a fixup pinned to its target.
1. `git rebase --autosquash <base>` — replays the branch, squashing each fixup
   into the commit it names.

Preferred because it is non-interactive. `git rebase -i` needs an editor driven
through todo-list edits, which agents cannot do reliably; reset-and-recommit and
cherry-pick reconstructions discard authorship and author dates and are easy to
get silently wrong. Plain `git commit --amend` is fine when the target is `HEAD`.

**Amending a message replaces it.** `--amend -F -` swaps the whole message for
what you hand it, so anything you do not retype is gone — a dropped
`Co-authored-by:` takes the credit with it, and nothing restores it later. Pass
`--no-edit` where only the tree is changing, and where the message is what you
are there for, re-supply the trailers through `--trailer` rather than typing the
block back into the body, exactly as on a fresh commit.

**Once someone else can see the branch, prefer adding a commit to rewriting
one.** A fixup-and-rebase rewrites published history: anyone holding the branch
has to reconcile it, and a reviewer loses the incremental diff since they last
looked. Land the correction as its own commit and let the eventual squash tidy
it away.

The criterion is whether anyone is watching, not whether `push` has run — a
branch pushed for backup, or a PR nobody has opened yet, is still yours to
rewrite. When you do rewrite a pushed branch, the push needs
`--force-with-lease`, never a bare `--force`: the lease refuses when the remote
moved under you instead of overwriting that work. A local-only amend needs no
force at all; check `git status` against the tracking branch first. Never
force-push a shared base branch like `main`.

## Reverting a Git commit

Use `git revert <sha>` rather than hand-editing the code back. It computes the
exact inverse diff, so nothing is missed, and it records the reverted commit's
sha and subject, so the history states what happened and the revert can itself
be reverted. A manual undo is a reconstruction from memory: it drifts from the
original, and it leaves no link to what it was undoing.

- `git revert -m 1 <sha>` for a merge commit — a merge has no single parent to
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
carrying both it and its revert — but that is a rebase, not a hand-undo.

## Signing Git commits from an agent session

Set `AI_AGENT=1` on git commands that trigger GPG signing — `commit`, `tag`, and
any `merge` or `rebase` that re-signs:

```sh
AI_AGENT=1 git commit -m 'Fix widget cache invalidation on tenant switch'
```

It is a conventional indicator that the caller is a non-interactive agent. A
signing setup that wraps GPG can read it and skip the TTY-loopback pinentry an
agent's shell has no way to answer, so a cache miss raises a prompt a human can
approve instead of hanging the commit. Inert where nothing reads it.

## Installing these Git commit conventions

This skill needs a line in your always-loaded agent instructions (`AGENTS.md`,
`CLAUDE.md`, or the equivalent) naming it:

```text
When asked to plan or make changes in a Git repo, load the
gtb-git-commit-conventions skill before your first edit. It governs how the
work gets split into commits, and that is decided while you work — consulting
it once the change is written is too late.
```

Description-based selection will not stand in for that. It reaches requests
whose subject is the history itself — squash these, write a message, sort out
this branch — but not "fix the retry logic" or "implement the caching layer",
which carry no cue resembling commit conventions and which an agent can perform
without consulting anything. Those are the cases where commit boundaries are
actually being decided.

If you are reading this because the skill loaded and no such line exists, say
so: it will keep failing to load on exactly the work it is most needed for.
