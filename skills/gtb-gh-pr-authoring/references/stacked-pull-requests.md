# Opening stacked GitHub pull requests

Opening the pull requests for branches already cut from one another. Whether to
have that topology is `gtb-gh-pr-boundaries`; landing the result is
`gtb-gh-pr-merging`, and differs from an ordinary merge throughout.

**`gh stack link` is the command worth driving.** It takes branch names, PR
numbers or URLs, bottom to top, and needs no local tracking state, so it works
from a worktree, where `gh stack init` does not. Branches without a PR get one,
opened as a draft.

```sh
gh extension install github/gh-stack   # once, if `gh stack` is not installed
gh stack link auth-layer api-routes ui-components
```

**`gh stack` is an extension rather than part of `gh`.** Absent it, the command
fails as an unknown one, which reads like a typo rather than a missing install,
so name the install instead of retrying the command.

**Some of what it does belongs to the human.** It pushes branch arguments to the
remote before looking them up, and `--open` marks PRs ready for review, new and
existing alike, so it can promote a draft that was deliberately left as one.
