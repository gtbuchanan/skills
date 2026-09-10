# Writing inside a repository

Read this when the prose lives in a project the reader can open: documentation,
a README, an ADR, a design note, a code comment, an issue or pull request body.

## What these rules assume

**The reader has the repository you are writing inside.** They can open the
code, the config and the log, and they will come back after those have changed.
Everything below follows from that, and lapses for a reader who has only the
document.

A repository need not hold code. Documentation, configuration and
infrastructure repositories all qualify: what matters is that the prose sits
beside something the reader can read and that changes without it.

## Say what the reader cannot get elsewhere

**Being true does not earn a sentence its place.** A fact the code already
states, the config already names, or another document already owns is a copy.
It costs load, and it drifts from the original, which changes without it. Name
the source instead: the config key rather than its current value, the function
rather than a paraphrase of its signature.

**Where nothing names it, the value stays.** A figure with no source to point
at is not a copy, and cutting it leaves the reader nothing to look up. Both
kinds sit together often: a default whose key the prose gives, beside an
override it attributes to nothing. Replace the first, keep the second.

**What earns its place exists nowhere else:** why this approach, the
constraint that ruled out the obvious one, the failure mode nothing announces,
the boundary a reader would otherwise discover in production. In code that is
most of the job, since the signature already carries the types and the name.

A reference document is the exception, because being the copy is its job. A
configuration reference exists so nobody has to open the config, so it carries
each key with its default and its bounds. The rule governs prose that mentions
a value in passing, not the table a reader consults instead of the source.

**Write the state, not the path to it.** How this came to be is in the commit
log and the pull request. A sentence recounting what an earlier version did,
what was tried and abandoned, or which bug prompted the change is history the
reader can already retrieve, and it accumulates as the file ages. Keep it only
where it stops someone reintroducing a defect that looks like an improvement,
and write it as the rule to follow rather than the story of the bug.

A decision record is the exception, because there the history is the subject.
An ADR exists to hold the alternatives weighed, the constraint that decided
between them, and what the decision costs, so cutting those leaves a file that
records a choice without its reasoning. The rule bites on narration that
wandered into ordinary documentation, not on a document whose job is the
record.

## Keep what will still be true

**Figures describing the current state rot. Figures recording an event do
not.**

Perishable: a count of call sites, a test count, a coverage percentage, a
benchmark timing, a suite runtime. The code moves and the number is wrong with
nothing to flag it. Write the qualitative form ("every call site") or anchor
to a live source the reader can re-check, such as the CI report.

Permanent: a version pinned together with the reason for the pin, a commit or
pull request reference, a date in a dated entry, and everything inside a log
entry describing what happened that day, including the time it ran and how long
it took. Cutting those destroys the point of the entry.

The test is not whether it is a number. It is whether the thing the number
describes can change underneath it.

A figure the reader can check while reading survives, because it sits in the
same diff or artifact they already have open. So does one the text labels as a
snapshot, such as "as of 2026-01", where the label itself tells a later reader
not to trust it.

**Counting the structure drifts in place.** "Three settings", "two parameters",
"the four callers": the count is wrong the moment one is added, and the prose
sits next to the thing it miscounts with nothing to flag it. Name them, or drop
the quantifier and let the list count itself.
