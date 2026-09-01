---
name: gtb-change-decomposition
description: >-
  Plan a change into small, independently shippable units before writing any
  code — where to cut, how to order the pieces so each stands alone, and when a
  change is better left whole. Use at the start of any non-trivial work in a
  version-controlled project: implementing a feature, fixing a bug, refactoring,
  migrating, or picking up a ticket. Also use for any explicit request to break
  work down, size or sequence a change, decide whether something is one pull
  request or several, or untangle work already piled up in the working tree.
  Load it before the first edit — it governs boundaries decided while the work
  happens, and reconstructing them afterwards is strictly harder.
---

# Planning a change into units

A **unit** is one complete change: it does one thing, builds and passes its
checks on its own, and can be reviewed, reverted, or dropped without dragging
anything else with it. Commits, branches, and pull requests are that shape at
different sizes, so one plan serves all of them.

**Plan the units before the first edit.** While deciding what to write you know
which edits belong together; afterwards that has to be reconstructed from a
diff, and what you recover are boundaries that look plausible rather than the
ones that were real. Splitting later works — it just costs more, and carves out
states nothing ever built.

## What makes one unit

Each of these catches a different failure:

- **Revert** — reverting it removes exactly what its title names, nothing else.
  Collateral means it carries a second change.
- **"And"** — a title needing an "and" to stay accurate names its own seam.
- **Standalone** — it builds and its checks pass by itself, not only atop the
  units you happened to write first. Anything that bisects, reviews, or
  cherry-picks lands between two units eventually.
- **Throwaway** — you could drop it and still ship the rest. A piece that can
  never be separated in practice is half a unit, not one.

**Atomic is not minimal.** The unit is one idea, not one file or one hunk: a
handler, its schema, and its test are one unit when they are one thought.
Cutting further buys fragments nobody can follow, some of which do not build.

## Cut through the layers, not along them

**Slice vertically: one narrow behavior through every layer it touches.** The
tempting cut is by layer — all the schema, then all the API, then all the UI —
because each piece looks self-contained while you write it. But nothing works
until the last one lands, so no unit can be verified when written, none reverts
without breaking its neighbours, and a plan abandoned halfway ships nothing.

Cut the other way and each unit is one observable behavior through the real path
— schema, handler, and UI for a single field — so it works when it lands and the
plan can stop anywhere. Genuine groundwork is the exception: an extraction or
scaffold that later units build on comes first, but still lands green or it is
not its own unit.

## Separate structural changes from behavioral ones

**A unit either changes what the code does or how it is arranged, never both.**
Renames, extractions, moves, reformatting and import reshuffles are structural.
Fused into a behavioral change they make the diff unreadable — nobody can tell
which of four hundred moved lines changed behavior — and they erase the
difference in scrutiny each deserves, since a structural change is verified by
the checks still passing while a behavioral one can be wrong in ways no test
catches.

**Structural first, then behavioral.** Reshape so the behavior change becomes
easy, land that, then make the behavior change small on top. Reversed, it fights
the old shape and lands buried in the cleanup it needed.

## Where to cut when a change resists splitting

Try these and take whichever produces a piece you would ship on its own; the
earlier ones carry most of the work:

- **Happy path first** — the main route lands; error states, retries and edge
  cases follow as their own units.
- **Groundwork** — the extraction, migration, or scaffold a change needs,
  separated from the change that needed it.
- **Data** — support one type, format, or source first; widen later.
- **Rules** — narrow what the feature does: one scheduling mode, one manager per
  employee, one currency. Widen it in later units. This cut reduces scope; it
  never drops a guard on something the feature already does — see below.
- **Interface** — make it work through the plainest interface, improve it after.
- **Operations** — a "manage X" scope is create, read, update and delete wearing
  one name.
- **Spike** — timebox learning as its own unit when uncertainty is what makes
  the change unsplittable. The last cut to reach for and the first unit to run:
  it ships knowledge, not software.

**Controls ride with the behavior they govern.** Authorization, audit and
compliance records, and safety limits are not scope to be narrowed and deferred:
they constrain who may perform an operation and what must be recorded when
someone does, so a unit that ships the operation without them ships something
nobody intended to be possible. "Admins can archive" is one unit, not archiving
followed by the permission. Every unit is shippable by definition, which is
exactly why this cannot be left to a later one.

Worked examples, and how to choose between two viable cuts, are in
`references/cut-lines.md`. Read it when the obvious cut is not obvious.

## Ordering the units

- **Enabling before enabled**, structural before behavioral, so nothing reaches
  forward to what has not landed.
- **Uncertainty first.** A unit that could prove the approach wrong opens the
  plan — a spike always does — because discovering that last means rewriting
  whatever was built on it meanwhile.
- **Prefer an order that survives being abandoned.** Work stops for reasons
  unrelated to the work, so an order whose every prefix is coherent beats one
  that only pays off complete.

## How small, and when not to split

Stop when the next cut would produce something that does not build alone, or
that no reviewer would want separately. The ceiling is a unit someone can hold
in one reading — past that they approve on trust, which is what review exists to
prevent.

**Leave it whole when the pieces cannot be separated in practice** — that is one
change wearing several hats, and splitting it yields intermediate states that do
not work. Same when it is genuinely one idea, however many files it touches:
files are not units.

**Do not plan into fog.** When the shape of the work is unknown, planning ten
units invents nine. Plan the one or two that deliver something and teach you
what the rest should be, then plan again. An accurate first unit beats a
confident plan.

Where a spike leads, everything after it is provisional by construction — say
which units its answer could invalidate, and re-plan when it returns. And two
units that would supersede one another depending on that answer are not two
units; they are one decision you have not made, and planning both guarantees one
is waste. Let the spike choose, then plan the winner.

## Stating the plan

Before the first edit, state the units in order — one line each: imperative
title, what it touches, and whether it is structural, behavioral, or a spike.

```text
1. Extract the retry policy from the poller (structural) — src/poll.ts
2. Compute backoff from the attempt count (behavioral) — src/retry.ts, src/retry.test.ts
3. Add jitter to the computed backoff (behavioral) — src/retry.ts, src/retry.test.ts
```

**Scale the plan to the change.** One unit needs one sentence, not a document —
ceremony over a one-line fix teaches the reader to skip the plan on the change
that needed one.

When a caller asks for the plan structured, emit a JSON array of objects with
`title`, `kind` (`structural`, `behavioral`, or `spike`), `touches` (the paths
the unit changes), and `why` (one clause on what makes it its own unit), ordered
as it should be executed.

**Name paths that exist.** Look before planning: paths taken from the shape of
the request rather than from the project read as confident while describing a
codebase nobody has. Where a unit creates a file, put it where the existing ones
live.

## Working the plan

**Take one unit to done before starting the next.** Writing them all at once and
separating afterwards recreates the tangle the plan avoided, at the point where
undoing it costs most.

**A unit is not done until the project's own checks pass on it** — its build,
its hook runner, its test script, not a generic guess. The standalone test is a
promise to whoever lands between two units later.

**The plan is a hypothesis.** When the code disagrees, re-plan rather than
widening the current unit to swallow the surprise; out-of-scope work becomes its
own unit or a follow-up, never a passenger. Say what changed — a plan silently
abandoned is worse than none, since the earlier units were shaped for an order
nothing is following now.

## Where the units land

This skill decides boundaries and order, not what a unit is called or how it
ships. Those are separate jobs with their own conventions, living wherever your
project keeps them; load those when you reach that point rather than improvising
their rules from here.

## Installing this skill

This skill only works if your always-loaded agent instructions (`AGENTS.md`,
`CLAUDE.md`, or equivalent) name it: a description reaches "break this up" but
not "fix the retry logic", which is exactly when boundaries get decided. The
line to add is in `references/installing.md`.

If you are reading this because the skill loaded and no such line exists, say
so: it will keep failing to load on the work it is most needed for.
