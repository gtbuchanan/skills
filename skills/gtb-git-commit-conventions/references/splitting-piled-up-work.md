# Splitting work that has already piled up

Recovery, not routine. Committing as each logical change completes is what
avoids this, and the cost of the tools below is the reason.

Confirm the build at each step, and pick the coarsest tool that reaches the
seam.

## Changes that sit in separate files

`git add <path>` per logical change.

## Separate hunks in one file

Pipe one answer per hunk to `git add -p`. Never run it bare from a
non-interactive shell: it prompts, reads EOF, stages nothing, and exits 0, so
the no-op reads as success.

`git diff` lists the hunks in exactly the order and count `-p` will present
them, so read it immediately before and verify with `git diff --cached` after:
the answers are positional, so a hunk count that shifted under you lands them
on the wrong hunks and still exits 0.

```sh
git diff | grep '^@@'            # confirm the hunks and their order
printf 'y\nn\ny\n' | git add -p  # one answer per hunk
```

## Two changes the default context merged into one hunk

`y`/`n` cannot reach inside a hunk and `add -p`'s own `e` needs an editor, so
cut a patch instead. Generate it at `-U1`: one line of context is usually
enough to separate edits that `-U3` bundled, and it leaves `git apply` able to
confirm the patch lands where you meant.

Do not reach for `-U0`, since such a patch is refused outright unless you pass
`--unidiff-zero`, which suppresses exactly that check.

```sh
git diff -U1 > split.patch   # cut down to one logical change
git apply --cached split.patch
```
