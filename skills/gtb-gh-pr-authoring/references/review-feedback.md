# Working a GitHub pull request's review feedback

## Reading the review

Read the review yourself, not a summary quoted at you. It lands on separate
surfaces: each submitted review's body, the inline comments anchored to lines,
and the conversation comments, and reviewers routinely split an overview from
its specifics across more than one.

```sh
gh pr view <number> --json reviews,comments
gh api --paginate repos/{owner}/{repo}/pulls/<number>/comments
```

`--json comments` never includes the inline comments, and its ids 404 against
the review-comment endpoint. Ask for every page: without `--paginate` a busy PR
hands back the first and the rest of the findings are not there. `gh` fills in
`{owner}` and `{repo}`, but some shells read braces as their own, PowerShell
among them, which eats them unless the endpoint is quoted.

## Acting on the findings

**Judge the findings; do not apply them reflexively.** Confident false
positives are common, and no reviewer knows the constraint you were working
under. Fix what is real, decline what is not, batch the fixes into one push,
and bring the description back in line with what the code now does.

**One finding, one commit. Still one push.** Review fixes are ordinary work, so
the commit rules apply unchanged. Fixing everything and carving it up
afterwards ends in one "Address review feedback": a subject naming the process
instead of the change, over a diff nobody can revert a piece of.

**Push the fixes, then reply.** A reply written first is a promise; the same
reply after the push is a report pointing at a commit.

## Replying

**Reply only to accounts other than the one you post from**: `gh api user
--jq .login`. Review comments the author leaves are work handed to you, not a
conversation — answering reads as the author agreeing with the author. Do the
work, say what you did in the session, and leave the thread for them to resolve.

**Answer on the surface the point was raised on.** Conversation comments take
`gh pr comment`; an inline reply goes on the thread root, the comment whose
`in_reply_to_id` is null. Its body goes in on standard input, `-F body=@-`
rather than `-f body='…'`: an inline field argument is shell prose again, and
Markdown is what suffers, backticks and fenced blocks eaten on the way through.

```sh
gh api repos/{owner}/{repo}/pulls/<number>/comments \
  --jq '.[] | "\(.id) \(.path) \(.in_reply_to_id)"'
gh api repos/{owner}/{repo}/pulls/<number>/comments/<root-id>/replies \
  -F body=@- <<'BODY'
Applied in 2f8665e.
BODY
```

That `@` belongs to gh, not to the shell, which is what separates it from
`--body`. Written `-F body=@'…'@` a here-string never reaches PowerShell's
parser: gh reads `@` as read-from-file and dies opening a file named after the
message's first line. Only `@-` means standard input, so pipe it in:

```powershell
@'
Applied in 2f8665e.
'@ | gh api 'repos/{owner}/{repo}/pulls/<number>/comments/<root-id>/replies' -F body=@-
```
