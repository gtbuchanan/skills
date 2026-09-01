# Cut lines, worked

Read this when a change resists the obvious cut, or when two cuts both look
viable and the choice is not clear. The catalogue itself is in `SKILL.md`; this
is the part that does not need to be in context every time.

## Contents

- [Choosing between two viable cuts](#choosing-between-two-viable-cuts)
- [A change run through the catalogue](#a-change-run-through-the-catalogue)
- [Each cut line, with an example](#each-cut-line-with-an-example)
- [Cuts that look right and are not](#cuts-that-look-right-and-are-not)

## Choosing between two viable cuts

Tie-breakers, in this order:

**Prefer the cut that lets you throw a piece away.** If one of the resulting
units could be deprioritized, deferred, or dropped outright and the rest still
ships, that cut found a real seam — it separated something optional from
something necessary. A cut where both halves are mandatory has divided the work
without reducing it.

**Then prefer the cut that gives more evenly sized pieces.** A cut leaving one
unit that is nearly the whole change and one that is a rounding error has not
bought a reviewer anything: they still have to read the big one in a single
sitting, and now there is a second thing to track.

A cut that fails both is usually a sign the change is one unit. Say so and move
on rather than forcing it.

## A change run through the catalogue

> Add CSV export to the reports page. Users pick a date range, we generate the
> file server-side, email a download link, and log the export for audit.

Cut by layer — schema, then endpoint, then UI — and nothing is demonstrable
until all three land. Run the catalogue instead:

- **Happy path first** — one date range, generated synchronously, downloaded
  directly. No email, no audit log. This works end to end and is shippable.
- **Rules** — the audit log is a policy requirement, not part of the export
  working. Its own unit, after.
- **Interface** — emailing a link is a better interface to the same generated
  file. Its own unit, after the direct download works.
- **Data** — if "reports" is really four report types, the first unit supports
  one and the rest follow.
- **Groundwork** — if generation needs a job queue that does not exist yet,
  that queue is structural and lands first, green, on its own.

The plan falls out in an order where every prefix is coherent:

```text
1. Add the job queue the export will run on (structural)
2. Export one report type for a date range, downloaded directly (behavioral)
3. Deliver the export as an emailed link (behavioral)
4. Record each export in the audit log (behavioral)
5. Support the remaining report types (behavioral)
```

Stop after unit 2 and something real shipped. Stop after unit 2 in the
layer-first plan and nothing did.

## Each cut line, with an example

**Happy path first.** The main route is one unit; failure handling is another.
_"Import contacts from a CSV"_ becomes importing a well-formed file, then
reporting malformed rows, then resuming a partial import. The first is most of
the value and all of the risk of being wrong about the design.

**Groundwork.** The change needs the code to be shaped differently first.
_"Add a second payment provider"_ becomes extracting the provider interface out
of the existing one — structural, behavior identical, checks still green — and
then adding the second provider behind it. Never one commit: fused, the
extraction's noise hides whether the first provider's behavior moved.

**Data.** Narrow what is supported, widen later. _"Accept uploads"_ becomes one
format, then the rest. _"Sync from the warehouse"_ becomes one table, then the
rest. The first unit proves the pipeline; the others are repetition.

**Rules.** A validation, permission, or policy relaxed at first and restored as
its own unit. _"Only admins can archive, and archived items are retained 90
days"_ is the archive behavior, then the permission, then the retention job —
three units, each independently reviewable, where the fused version is one diff
touching authorization, storage, and scheduling at once.

**Interface.** The plainest interface that exercises the behavior, improved
after. A CLI flag before the settings UI; a plain list before the drag-and-drop
reordering. Useful because the interface is usually where the effort is and
rarely where the risk is.

**Operations.** "Manage" is a giveaway. _"Let admins manage API keys"_ is
create, list, revoke, and rotate — four units, of which the first two ship
something usable on their own.

**Spike.** The change cannot be planned because something is genuinely unknown —
whether a library can do the thing, where a bottleneck actually is. Timebox
finding out as its own unit, and re-plan on what it returns. Last resort: a
spike delivers knowledge rather than software, and reaching for it early is
usually planning avoidance rather than genuine uncertainty.

## Cuts that look right and are not

**By layer.** Covered in `SKILL.md`, and it is the most common wrong cut,
because each piece genuinely does look self-contained while you write it. The
tell is that no unit but the last can be demonstrated.

**By file.** Files are an artifact of how the code is organized, not of what the
change means. One idea touching six files is one unit; two ideas in one file are
two.

**By author convenience.** "Everything I did before lunch" and "everything easy,
then everything hard" produce units whose titles need an "and". The seam has to
be in the change, not in the session.

**By size alone.** Splitting a large diff at an arbitrary midpoint yields two
units that each fail the revert test and neither of which builds. Large is a
symptom that there is a seam worth finding — not itself the seam.
