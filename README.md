# Taylor Buchanan's Agent Skills

A collection of [Agent Skills](https://docs.claude.com/en/docs/claude-code/skills)
— self-contained capabilities (a `SKILL.md` plus any supporting scripts and
assets) that Claude loads on demand when a task matches the skill's
description.

## Skills

| Skill                                                                                    | Purpose                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [gtb-change-decomposition](skills/gtb-change-decomposition/SKILL.md)                     | Plan a change into small, independently shippable units before writing code — where to cut, how to order the pieces so each stands alone, and when a change is better left whole.                                                                      |
| [gtb-gh-pr-authoring](skills/gtb-gh-pr-authoring/SKILL.md)                               | Author-side GitHub pull request conventions — opening one as a draft, what belongs in the title and description, watching checks after every push, acting on review feedback once it is brought to you, and squash-merging with atomic branch cleanup. |
| [gtb-gh-reviewer-followup](skills/gtb-gh-reviewer-followup/SKILL.md)                     | Follow up on your GitHub PR review after the author pushes changes — re-review only what changed since your last pass, then resolve the threads that were fixed and reply to the ones that weren't (propose-then-confirm).                             |
| [gtb-git-commit-conventions](skills/gtb-git-commit-conventions/SKILL.md)                 | Git commit conventions — when to commit and how to write the message, including trailers, reverts, and untangling work already piled up in the working tree.                                                                                           |
| [gtb-resolve-azp-deployment-backlog](skills/gtb-resolve-azp-deployment-backlog/SKILL.md) | Clear a backlog of pending Azure Pipelines manual-approval deployments — reject every superseded approval and optionally approve only the newest.                                                                                                      |

`gtb-gh-reviewer-followup` composes three internal building-block skills —
[gtb-gh-reviewer-followup-plan](skills/gtb-gh-reviewer-followup-plan/SKILL.md),
[gtb-reviewer-followup-verdict](skills/gtb-reviewer-followup-verdict/SKILL.md), and
[gtb-gh-reviewer-followup-apply](skills/gtb-gh-reviewer-followup-apply/SKILL.md) — which are marked
`user-invocable: false` (Claude composes them; they aren't direct `/` commands).

The verdict skill is the only one without a `gh` segment, and that is the point:
it performs no I/O, so its judgment carries to any review tool that can hand it
a diff and a list of threads. Everything GitHub-specific lives in its siblings.

## gtb-change-decomposition needs an accompanying instruction

Install this one with a line in your always-loaded agent instructions
(`AGENTS.md`, `CLAUDE.md`, or your agent's equivalent) telling the agent to load
it. Something like:

> When asked to plan or make changes in a repo, load the
> `gtb-change-decomposition` skill before your first edit. It governs how the
> work gets split into units, and that is decided while you work — consulting it
> once the change is written is too late.

The description alone will not carry it. Selection matches a request against the
description, but the requests this skill most needs to reach — "fix the retry
logic", "implement the caching layer" — contain no cue that looks like
decomposition, and an agent that can already perform the task has little reason
to consult a planning skill before doing so. Wording the description harder does
not fix that: what an implementation request lacks is any cue to match, not a
sufficiently emphatic one. The instruction is what loads it on that work.

That constraint is specific to this skill. The others describe a task the agent
is being asked to perform, so their descriptions have something concrete to
match against — including the commit and pull request skills, which are reached
by "commit this" and "open a PR" at the moment they are needed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, authoring skills, and running
the containerized eval suite.
