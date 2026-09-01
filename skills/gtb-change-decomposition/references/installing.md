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

Whatever governs commit messages, pull requests, or code review can be left to
its own description. By the time those matter, the request says so — _commit
this_, _open a PR_, _what did review say_ — and a description matching that
wording is enough to reach the right conventions at the right moment.

Decomposition is the sole exception, which is why it is the sole thing named in
always-loaded instructions. Naming the others there would put back exactly the
cost that separating this skill was meant to remove: every task paying for
mechanics it does not need yet.

## If it is not installed

An agent that reaches this skill and finds no such line should say so rather
than carry on quietly. Loading here means something asked for a plan explicitly;
the requests that most need the skill are the ones that never mention planning,
and those will keep missing it until the line exists.
