# Taylor Buchanan's Agent Skills

A collection of [Agent Skills](https://docs.claude.com/en/docs/claude-code/skills)
— self-contained capabilities (a `SKILL.md` plus any supporting scripts and
assets) that Claude loads on demand when a task matches the skill's
description.

## Skills

| Skill                                                                                    | Purpose                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [gtb-git-commit-conventions](skills/gtb-git-commit-conventions/SKILL.md)                 | Git commit conventions — when to commit, how to scope a commit, and how to write the message, including trailers and reverts.                                                                                              |
| [gtb-pr-review-followup](skills/gtb-pr-review-followup/SKILL.md)                         | Follow up on your GitHub PR review after the author pushes changes — re-review only what changed since your last pass, then resolve the threads that were fixed and reply to the ones that weren't (propose-then-confirm). |
| [gtb-resolve-azp-deployment-backlog](skills/gtb-resolve-azp-deployment-backlog/SKILL.md) | Clear a backlog of pending Azure Pipelines manual-approval deployments — reject every superseded approval and optionally approve only the newest.                                                                          |

`gtb-pr-review-followup` composes three internal building-block skills —
[gtb-pr-review-diff](skills/gtb-pr-review-diff/SKILL.md),
[gtb-pr-review-verdict](skills/gtb-pr-review-verdict/SKILL.md), and
[gtb-pr-review-apply](skills/gtb-pr-review-apply/SKILL.md) — which are marked
`user-invocable: false` (Claude composes them; they aren't direct `/` commands).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, authoring skills, and running
the containerized eval suite.
