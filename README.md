# Taylor Buchanan's Agent Skills

A collection of [Agent Skills](https://docs.claude.com/en/docs/claude-code/skills)
— self-contained capabilities (a `SKILL.md` plus any supporting scripts and
assets) that Claude loads on demand when a task matches the skill's
description.

## Skills

| Skill                                                                                    | Purpose                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [gtb-gh-pr-authoring](skills/gtb-gh-pr-authoring/SKILL.md)                               | Author-side GitHub pull request conventions — opening one as a draft, what belongs in the title and description, watching checks after every push, acting on review feedback once it is brought to you, and squash-merging with atomic branch cleanup. |
| [gtb-git-commit-conventions](skills/gtb-git-commit-conventions/SKILL.md)                 | Git commit conventions — when to commit, how to scope a commit, and how to write the message, including trailers and reverts.                                                                                                                          |
| [gtb-pr-review-followup](skills/gtb-pr-review-followup/SKILL.md)                         | Follow up on your GitHub PR review after the author pushes changes — re-review only what changed since your last pass, then resolve the threads that were fixed and reply to the ones that weren't (propose-then-confirm).                             |
| [gtb-resolve-azp-deployment-backlog](skills/gtb-resolve-azp-deployment-backlog/SKILL.md) | Clear a backlog of pending Azure Pipelines manual-approval deployments — reject every superseded approval and optionally approve only the newest.                                                                                                      |

`gtb-pr-review-followup` composes three internal building-block skills —
[gtb-pr-review-diff](skills/gtb-pr-review-diff/SKILL.md),
[gtb-pr-review-verdict](skills/gtb-pr-review-verdict/SKILL.md), and
[gtb-pr-review-apply](skills/gtb-pr-review-apply/SKILL.md) — which are marked
`user-invocable: false` (Claude composes them; they aren't direct `/` commands).

## gtb-git-commit-conventions needs an accompanying instruction

Install this one with a line in your always-loaded agent instructions
(`AGENTS.md`, `CLAUDE.md`, or your agent's equivalent) telling the agent to load
it. Something like:

> When asked to plan or make changes in a Git repo, load the
> `gtb-git-commit-conventions` skill before your first edit. It governs how the
> work gets split into commits, and that is decided while you work — consulting
> it once the change is written is too late.

The description alone will not carry it. Selection matches a request against the
description, but the requests this skill most needs to reach — "fix the retry
logic", "implement the caching layer" — contain no cue that looks like commit
conventions, and an agent that can already perform the task has little reason to
consult a conventions skill before doing so. Measuring trigger rates across
several descriptions (plain, cue-led, and explicitly imperative) moved the
result very little; adding the instruction is what made it load reliably on
implementation work.

That constraint is specific to this skill. The others describe a task the agent
is being asked to perform, so their descriptions have something concrete to
match against.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, authoring skills, and running
the containerized eval suite.
