# @gtbuchanan/git-fixtures

Helpers for using git in tests: running git without the developer's own git config, and building repositories from a described history.

## Package boundaries

Anything that needs a test repository uses this package, so it only knows about git and can't depend on any other package here. Its `turbo.json` holds the rule that enforces this. Making a repository look like it's hosted on GitHub is `github-fake`'s job.
