---
name: gtb-technical-writing
description: >-
  How to write prose an engineer reads: documentation, README and ADR text,
  code comments, design notes, issue and pull request bodies, runbooks and
  postmortems. Sentence-level craft drawn from Orwell, Strunk and Pinker, each
  rule attached to the figure it names. Use whenever writing or revising
  technical prose, whether it stands alone as a document or sits inside code
  as a comment.
---

# Technical writing

## Writing inside a repository

**Prose kept in a repository takes rules of its own.** The reader can open the
code, the config and the log, so a fact those already carry is a copy; and they
return after those have changed, so a figure describing the current state rots.
Read `references/repositories.md` before writing documentation, a README, an
ADR, a code comment, or an issue or pull request body.

## Say each point once

**State a point, then move on.** Restating it in new words is _commoratio_. It
persuades a reader who might disagree, and an agreeing reader pays for emphasis
nobody needed. Every sentence after the claim must add a mechanism, a failure
mode, or an exception. Where the job is to persuade or to teach rather than to
inform, restating a point is a tool.

The tell is a paragraph that states a rule, argues it from another angle, then
closes by summarising itself.

## Prefer the plain word

**"Never use a long word where a short one will do."** (Orwell 1946, rule 2)

A figure longer than the term it replaces is _periphrasis_: "an expenditure
with nothing purchased in return" for "waste", "at a later point in time" for
"later", "no longer of any use" for "stale".

A figure _shorter_ than the literal statement earns its place: "flaky" for a
test that passes and fails on the same code. Compare the figure against the
plain word and keep whichever is shorter.

## Use definite, specific, concrete language

**"Use definite, specific, concrete language."** (Strunk 1918, rule 12)

"The suite takes ninety seconds" carries what "the suite is slow" does not, and
"drops the connection" carries what "handles the failure poorly" does not. An
abstraction reads as though it means more than it does, and the reader cannot
check it against anything.

Pinker's metaconcepts are the words to watch, "concepts about concepts":
approach, assumption, concept, condition, context, framework, issue, level,
model, perspective, process, prospect, role, strategy, subject, tendency,
variable. Each can stand in for the specific thing you meant. (Pinker 2014)

## Put statements in positive form

**"Use the word _not_ as a means of denial or in antithesis, never as a means
of evasion."** (Strunk 1918, rule 11)

"He was not very often on time" evades; "he usually came late" commits. A
reader told only what is not still has to work out what is.

A contrast also needs a live foil. "The config key, not its current value"
earns one, because naming the value is what the reader would otherwise have
done. Where nobody would hold the opposite, the antithesis is padding and the
positive stands alone: "restating a point is a tool", not "a tool rather than
a defect".

## Use the verb

**"A process called nominalization takes a perfectly spry verb and embalms it
into a lifeless noun by adding a suffix like -ance, -ment, or -ation."**
(Pinker 2014; Helen Sword calls the results zombie nouns. Orwell 1946 calls
the padding around them operators, or verbal false limbs, and gives "render
inoperative" for "break".)

The suffix is the tell. "Validates the payload", not "performs a validation of
the payload": performs a rejection → rejects, makes a determination → decides,
carries out an enforcement → enforces, results in a failure → fails.

## Give every clause a real subject

**Open each clause on what it is about.** "`maximumPoolSize` caps concurrent
connections", not "It is `maximumPoolSize` that caps concurrent connections".
An expletive construction ("there is", "there are", "it is X that") fills the
subject slot with a placeholder and pushes the real subject late.

These hide in trailing clauses as readily as in openings, and a clause after a
conjunction is where one usually survives an edit.

## Use the active voice

**"Never use the passive where you can use the active."** (Orwell 1946, rule 4;
Strunk 1918, rule 10)

"The pool closes the connection" says who did it; "the connection is closed"
leaves the reader to work out whether the pool, the database or the driver was
responsible. Strunk allows the passive where it is "frequently convenient and
sometimes necessary", which in practice means where the actor is genuinely
unknown or beside the point.

## Place the emphatic words at the end

**"Place the emphatic words of a sentence at the end."** (Strunk 1918, rule 18;
Gopen & Swan 1990 call this the stress position)

"The pool retires a connection after `idleTimeout`" lands the setting where
attention is highest; "After `idleTimeout` the pool retires a connection"
spends that position on the part the reader could have guessed. What the reader
already knows opens the sentence and ties it to the one before.

## Start on the point

**Open with the claim.** Each of these delays the sentence without changing it:
"It's worth noting that", "In order to", "This function is responsible for",
"Simply put". Delete the opener and the sentence still stands.

## Reach for the plainest punctuation

**An em dash should mark a break no other punctuation can carry.** A comma, a
colon, parentheses or a second sentence will nearly always serve, and the
sentence reads plainer for it. Prose in which every sentence carries a dashed
aside has no emphasis left to spend, and a sentence holding two of them
suspends the reader mid-clause.

The dash is also what makes an aside frictionless to attach, so it is where a
restatement or a dead contrast usually arrives.

## Bullet only a list

**Prose chopped into bullets is still prose, and the bullets disguise that it
has no structure.** The form earns its place when the items are peers the
reader will scan or compare. A pair of them is usually a sentence.

Steps someone follows are the other case that earns it. A procedure stays an
ordered list however short, because the reader is executing it rather than
reading it, and a numbered step is what they return to after doing one.

## Claim only what you checked

**State a claim at the strength the evidence carries.** "The suite passes" is a
different claim from "the change is correct", and "no regression appeared
across eleven fixtures" is different again from "the skill works". Where you
did not check, say what you did instead. One overstated claim costs the reader
their grounds for trusting the careful ones beside it.

Understating has its own tell. Pinker: writers "mindlessly cushion their prose
with wads of fluff that imply they are not willing to stand behind what they
say", naming almost, apparently, comparatively, fairly, in part, nearly,
partially, predominantly, presumably, rather, relatively, seemingly, so to
speak, somewhat, sort of, to a certain degree, to some extent, and "the
ubiquitous I would argue". A hedge you can replace with the checked claim is
one of these. (Pinker 2014)

## Cut verbiage about verbiage

**"Metadiscourse: verbiage about verbiage."** (Pinker 2014)

"This section describes the retry policy" and "as noted above" are prose about
the prose. A heading already says what the section covers, and a reader who
wants the earlier point can scroll to it. Pinker's diagnosis: "Thoughtless
writers think they're doing the reader a favor by guiding her through the text
with previews, summaries, and signposts."

## When revising, leave good prose alone

This section governs edits to prose that already exists. It says nothing about
how long new prose should be.

**Prose already at its density needs no edit.** Asked to improve clean writing,
the reflex is to change something, and what goes is a clause that read as
decoration and was load-bearing: the "fails open" on a limiter, the "not
retried" on a status code. Neither is available anywhere else, so neither is
yours to cut.
