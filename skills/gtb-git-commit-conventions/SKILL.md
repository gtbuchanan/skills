---
name: gtb-git-commit-conventions
description: >-
  Git commit conventions — when to make a commit and how to write the message,
  plus trailers, fixups, reverts, and the recovery moves for work already piled
  up in the working tree. Use whenever work in a Git repository is going to
  produce commits: implementing a feature, fixing a bug, refactoring, or acting
  on review feedback. Also use for any explicit request to commit, write or
  reword a commit message, amend, split, squash, fixup, or revert.
---

# Git commit guidelines

The commit is the smallest durable unit of a project's history: `git log`,
`git bisect`, and `git revert` still operate on it long after the branch and
everyone who remembers the change are gone. Shape commits for those readers.

## When to make a Git commit

**Commit as soon as a logical change is complete and the project builds** — not
at the end of the session. While you are inside the change you know which edits
belong together; an hour later you are reconstructing that from a diff, and the
commits you carve out record states nothing ever built or tested.

**What counts as one change is decided before the first edit**, along with how
the pieces are ordered and when something is better left whole. A commit is one
of those units written down. `gtb-change-decomposition` governs all of it and
none of its rules are repeated here — reach for it when the question is where
the boundary falls rather than what to call it.

**Record a repo-wide reformat in `.git-blame-ignore-revs`.** Its own commit is
still a wall of moved lines, and without the sha listed there `git blame` credits
the formatter instead of whoever wrote the logic.

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

The poller's backoff interval reset on every poll, so a wedged job retried
forever at the floor delay instead of backing off.
MSG
```

```powershell
# PowerShell — here-string straight into -m; no pipe, no stdin
git commit -m @'
Fix scheduler retry backoff

The poller's backoff interval reset on every poll, so a wedged job retried
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

**Both forms are literal — write the body exactly as it should land.** `''`
escapes a quote inside a single-quoted string and means nothing in either, so a
doubled apostrophe lands as two characters in permanent history.

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

The poller's backoff interval reset on every poll, so a wedged job retried
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

The poller's backoff interval reset on every poll, so a wedged job retried
forever at the floor delay instead of backing off.
MSG
```

That matters most for trailers added by convention rather than by thought — an
agent's own `Co-authored-by:`, a required sign-off — which are exactly the ones
that get hand-appended on autopilot into the wrong paragraph.

A trailer value is a reference or an identity, never prose, and is exempt from
the 72-column wrap: it is one logical line, so wrapping a long URL breaks the
parse.

## Correcting an earlier Git commit

A commit that has landed and turned out wrong is corrected one of two ways:
amended where the history is still yours to rewrite, reverted where it is not.
Read `references/correcting-commits.md` before amending, fixing up, squashing or
reverting — which of the two you are entitled to is the first thing it settles,
and choosing wrong rewrites history somebody else is already holding.

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
