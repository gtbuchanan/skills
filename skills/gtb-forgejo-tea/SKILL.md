---
name: gtb-forgejo-tea
description: >-
  Where Forgejo and its `tea` CLI part from GitHub and `gh`: the tea commands
  Forgejo refuses and the `tea api` call replacing each, missing output flags
  and check watching, flags required outside a checkout, credential leaks, and
  Forgejo's own review, merge and token rules. Use whenever working against a
  Forgejo or Codeberg instance, or running `tea`.
---

# Working with Forgejo through tea

Only where Forgejo and `tea` differ from `gh`; `tea <command> --help` covers
the rest. Verified against tea 0.16.0 and Forgejo 16.0.6.

## tea commands Forgejo refuses

These call Gitea-only routes and answer `405`, so running one only reproduces
the error. Use the replacement, or where there is none, hand the step to the
user.

| Command                         | Replacement                                                                                                   | Verified                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `tea pulls reply`               | Post into the comment's review, on its path and line (below)                                                  | tea 0.16.0, Forgejo 16.0.6 |
| `tea pulls resolve`/`unresolve` | None: the user resolves it in the web UI. Re-check once [forgejo#14873] ships, since it matches Gitea's route | tea 0.16.0, Forgejo 16.0.6 |

[forgejo#14873]: https://codeberg.org/forgejo/forgejo/pulls/14873

To reply, find the comment through its review, then post beside it:

```sh
tea api 'repos/<owner>/<repo>/pulls/<pr>/reviews'                 # review ids
tea api 'repos/<owner>/<repo>/pulls/<pr>/reviews/<review>/comments' # path, position
tea api -X POST 'repos/<owner>/<repo>/pulls/<pr>/reviews/<review>/comments' \
  -f body='<reply>' -f path='<path>' -F new_position=<position>
```

## tea output and flags

- **No `--json` or `--jq`.** Use `-o json --fields <list>`, or `tea api`.
- **`tea pulls <index>` ignores `--fields` and carries no CI status.** The
  list's `ci` field gives only the combined state. To see which check failed,
  or to poll since there is no check watch, read the head commit's status:
  `tea api 'repos/<owner>/<repo>/commits/<sha>/status'`.
- **Outside a checkout, pass `--repo <owner>/<repo>` and `--login <name>` on
  every call**, or tea guesses a login. Write owner and repo literally into
  `tea api` endpoints. Some commands lack `--login`: `tea whoami` rejects it.

## tea credentials

- **Have the user run `tea login add --name <name> --url <host> --oauth`.**
  They finish it in the browser, so no token passes through the conversation,
  and the call blocks until they do. It requests every scope, admin included,
  and tea cannot narrow it.
- **A rejected token comes back in the error.** Forgejo's
  `access token does not exist [sha: …]` carries it, so report a failed call by
  status alone.

## Forgejo server rules

- Only approve and request-changes reviews can be dismissed; a comment review
  answers 403. The author of a pull request cannot request changes on it (422).
- An inline comment on a line outside the diff is accepted silently with an
  empty `diff_hunk`. Confirm the line is in the diff before posting.
- Merge commits are unsigned unless the instance has a signing key.
- Token scopes cover URL trees, not actions: creating or deleting a personal
  repository needs `write:user`, and no `delete_repo` scope exists.
