---
name: gtb-forgejo-gt
description: >-
  Where Forgejo and Gitea's `gt` CLI part from GitHub and `gh`: the gt commands
  Forgejo refuses and the `gt api` calls replacing each, run numbers versus run
  ids, JSON field names, flags required outside a checkout, logging in with an
  agent-held SSH key, and Forgejo's own review, merge and token rules. Use
  whenever working against a Forgejo or Codeberg instance, or running `gt`.
---

# Working with Forgejo through gt

Only where Forgejo and `gt` differ from `gh`; `gt <command> --help` covers the
rest. Verified against gt 2.0.0 and Forgejo 17.0.1.

gt targets Gitea, and its maintainers declined Forgejo fixes in
[gitea/cli#91], so expect these gaps to stay.

[gitea/cli#91]: https://gitea.com/gitea/cli/issues/91

## gt commands Forgejo refuses

These reach Gitea-only routes or misread Forgejo's answers, so running one only
reproduces the error. Use the replacement, or where there is none, hand the
step to the user.

| Command                               | Forgejo's answer                          | Replacement                                                                                                   |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `gt pr review reply`                  | HTTP 405                                  | Post into the comment's review, on its path and line (below)                                                  |
| `gt pr review resolve`/`unresolve`    | HTTP 405                                  | None: the user resolves it in the web UI. Re-check once [forgejo#14873] ships, since it matches Gitea's route |
| `gt run view`, `run jobs`, `run logs` | `Gitea returned an invalid JSON response` | Read the run's jobs and their logs through `gt api` (below)                                                   |

[forgejo#14873]: https://codeberg.org/forgejo/forgejo/pulls/14873

To reply, find the comment through its review, then post beside it:

```sh
gt pr review list <pr> --host <url> -R <owner>/<repo>      # review ids
gt pr review comments <pr> --host <url> -R <owner>/<repo>  # comment ids, path:line
gt api --host <url> -X POST 'repos/<owner>/<repo>/pulls/<pr>/reviews/<review>/comments' \
  -f body='<reply>' -f path='<path>' -F new_position=<line>
```

To read a job's log, go from the run to its jobs:

```sh
gt api --host <url> 'repos/<owner>/<repo>/actions/runs' \
  --jq '.workflow_runs[] | "\(.id) \(.index_in_repo)"'                 # id per run number
gt api --host <url> 'repos/<owner>/<repo>/actions/runs/<run-id>/jobs'  # job ids
gt api --host <url> 'repos/<owner>/<repo>/actions/jobs/<job-id>/logs'
```

**A run's number is not its id.** Check links and the web UI name
`/actions/runs/<number>`; the API takes the id, and answers a number with 404.
`gt run list` shows ids, but leaves its workflow, branch and time columns blank.

## gt output and flags

- **`--json` names fields in snake_case** (`head_sha`, `review_decision`), not
  gh's camelCase. An unknown name fails with the list of valid ones, and
  `gt schema <command>` prints them.
- **`gt pr checks` reports each check**, and `--watch` waits on them, with
  `--required`, `--interval` and `--timeout`.
- **Outside a checkout, pass `--host <url>` and `-R <owner>/<repo>` on every
  call.** With `-R` alone gt picks one of its logins, and the wrong instance
  answers that the repository was not found.
- **Inside a checkout, `{owner}` and `{repo}` fill in from the remote**, unless
  its SSH host differs from the web host. Then gt matches no instance until
  `gt config set ssh_host <host:port> --host <url>`.

## Forgejo Actions

- **Forgejo reads one workflow directory**: the first of `.forgejo/workflows`,
  `.gitea/workflows` and `.github/workflows` that exists, even if empty. Adding
  `.forgejo/workflows` to a repository mirrored from GitHub silently retires
  its `.github/workflows`.
- **A run's `status` is its result.** There is no `conclusion`: a finished run
  reads `success`, `failure`, `cancelled` or `skipped`, so polling through
  `gt api` waits for `status` to leave `waiting` and `running`, never for
  `completed`.
- **`actions/runs/<id>/jobs` returns a bare array**, so its jq is `.[]`, not
  `.jobs[]`.
- **A bare `uses: <owner>/<action>@<ref>` resolves against the instance's
  `DEFAULT_ACTIONS_URL`**, which defaults to data.forgejo.org and mirrors few
  actions. Spell an action as a full `https://github.com/<owner>/<action>@<ref>`
  URL unless the instance is known to point at GitHub.

## gt credentials

- **Log in with the agent-held key:
  `gt auth login --host <url> --ssh-agent-key <fingerprint>`.** gt signs every
  request with it, so no token is stored or passes through the conversation.
  `ssh-add -l` lists the fingerprints, and gt finds the agent only through
  `SSH_AUTH_SOCK`.
- **Log in as an account that is not a site admin.** An agent-key login takes
  no scopes: a signed request can do whatever its account can, from creating
  and deleting repositories to filing issues. Forgejo skips repository
  permission checks for site admins, so an admin login reaches every
  repository on the instance and the `/admin` API.
  `gt api user --jq .is_admin` shows which kind of account gt is using.
- **Git over HTTPS needs a token login.** `gt auth setup-git` makes gt git's
  credential helper, but refuses an agent-key login, which has no token to
  hand git; with one, clone over SSH
  (`gt config set git_protocol ssh --host <url>`). With a token login,
  `gt auth token` prints the token itself, so leave the token to the helper.

## Forgejo server rules

- Only approve and request-changes reviews can be dismissed (403 otherwise).
  The author of a pull request cannot request changes on it (422). gt refuses
  both before sending; `gt api` reaches Forgejo's answer.
- An inline comment on a line outside the diff is refused by gt, but a `gt api`
  review carrying one is accepted silently with an empty `diff_hunk`. Confirm
  the line is in the diff before posting.
- Whether a merge is signed is the instance's choice, through
  `[repository.signing] MERGES`, so look at a merged commit before assuming
  either way. Forgejo's default signs only when the merger has a GPG or SSH key
  on their account and TOTP or WebAuthn enrolled in Forgejo itself (an OIDC
  sign-in does not count), the base branch's tip is signed, and every commit on
  the head branch is signed by a key registered to an account whose email
  matches the committer. `MERGES = always` signs every merge, unsigned commits
  included.
- Token scopes cover URL trees, not actions: creating or deleting a personal
  repository needs `write:user`, and no `delete_repo` scope exists.
