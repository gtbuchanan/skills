# Installing this skill

## The line to add

Put this in your always-loaded agent instructions (`AGENTS.md`, `CLAUDE.md`, or
whatever your agent reads on every task):

```text
When asked to plan or make changes in a repo, load the gtb-change-decomposition
skill before your first edit. It governs how the work gets split into units, and
that is decided while you work — consulting it once the change is written is too
late.
```

## Why a line is needed at all

The frontmatter description names the work this skill applies to, implementing a
feature and fixing a bug among it. Being applicable is not the same as being
selected: selection matches on what a request says, and _fix the retry logic_
says nothing resembling decomposition, so nothing puts the skill in front of the
agent that would have used it. What selection reaches reliably is a request
whose subject is the decomposition itself — _break this up_, _is this one PR or
two_, _sort out this pile of changes_.

The gap between those two sets is the whole problem, because it is the requests
that never mention planning where the boundaries actually get decided. A skill
arriving after the change is written has arrived too late to affect it; the
splitting is then recovery rather than planning. An always-loaded line closes
the gap by not depending on the wording of the request at all.

## Why the later phases need no such line

The mechanics of a later phase can be left to its own description. By the time
those matter, the request says so — _commit this_, _open a PR_, _what did review
say_ — and a description matching that wording reaches the right conventions at
the right moment.

That holds for mechanics and only for mechanics, which is a narrower claim than
it first looks. A phase skill also collects decisions its phase merely
_reveals_: how many reviews the work is split across, and what each one branches
from, both surface when the first one is opened and are both settled long before
it. A description keyed to _open a PR_ reaches those a branch too late, and no
wording repairs it — that is a deadline rather than a matching problem.

The test is whether acting on a rule needs something to have been done
differently earlier. Where it does, the rule belongs with planning, whichever
phase it appears to describe.

That does not make it this skill's rule. Decisions like those are specific to a
host — what a squash keeps, what a stack costs, whether reviews are pull requests
at all — and this skill stays ignorant of that on purpose, which is what lets it
describe a project of any shape. So they belong in a small always-loaded skill of
their own, beside this one:

> Boundaries are always-loaded. Mechanics are triggered.

That is a second line in your instructions rather than a first, and worth it at
the size boundaries come in. What this argument objects to is naming the phase
skills — charging every task for a template, a check watch and a merge it does
not need yet. A few dozen lines deciding how many reviews the work becomes is
not that, and it is the half that was arriving late.

## If it is not installed

An agent that reaches this skill and finds no such line should say so rather
than carry on quietly. Loading here means something asked for a plan explicitly;
the requests that most need the skill are the ones that never mention planning,
and those will keep missing it until the line exists.
