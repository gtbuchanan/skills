---
name: gtb-codecov-coverage
description: >-
  How Codecov arrives at the coverage number it reports, and how to interrogate
  one report through its API. The hits/misses/partials ratio that makes Codecov
  disagree with a local line-coverage summary, what the project and patch status
  checks each measure, how the base commit gets chosen, carryforward flags,
  components, and the codecov.yml keys that move the number. Use whenever a
  Codecov check fails or reports a percentage the test run did not print,
  whenever a pull request comment shows `?` or a delta nobody expected, and
  whenever coverage detail is needed for a commit, pull request, flag, component
  or file.
---

# Codecov coverage

## The Codecov coverage ratio

```text
coverage = hits / (hits + misses + partials)
```

A **partial** is a line whose branches did not all run. Codecov scores it as a
miss. Most local reporters score it as a covered line and put the branch
shortfall in a separate column, which is most of the usual disagreement:

```text
hits 563, misses 386, partials 44
Codecov:       563 / 993 = 56.69%
line coverage: 607 / 993 = 61.13%
```

`coverage.round` (default `down`) then truncates to `coverage.precision` places,
so 56.6969… reports as 56.69 rather than 56.70.

**`parsers.<format>.partials_as_hits: true` makes Codecov agree with the local
number.** It exists for `lcov`, `cobertura`, `jacoco` and `go`, and it discards
the branch signal to buy that agreement — reach for it when the local figure is
the one the team reasons about, and leave it off when partial branches are worth
seeing.

## Why Codecov scores a different report from the local run

Each of these changes the report before the ratio is applied:

- **`ignore` and `fixes`.** `ignore` drops paths from the totals. `fixes`
  rewrites report paths onto repo paths, and a path that still fails to match
  the tree lands as an untracked file — the whole file leaves the denominator
  with nothing announcing it.
- **Merged uploads.** Codecov unions every upload for the commit: a line any
  session hit is a hit. One local suite sees one session, so its misses include
  lines another suite covers.
- **Carryforward.** A flag with `carryforward: true` that uploaded nothing on
  this commit contributes its numbers from the last commit that did, so the
  totals describe code as it was tested earlier. Codecov cannot tell coverage
  it carried forward from coverage that never arrived, so an upload that
  quietly stops keeps reporting its last value indefinitely.
- **Flag and component filters.** A component percentage covers that component's
  paths alone, so it moves for reasons the project percentage never shows.
- **`max_report_age`** (default 12h). An expired report is not processed, and a
  commit built from a replayed or long-queued pipeline silently loses it.
- **Parser flags.** `parsers.javascript.enable_partials`,
  `parsers.v1.include_full_missed_files` and the `branch_detection` map under
  `parsers.gcov` each change what the same file yields.

**Carryforward fills in a flag missing from a report that exists; it does not
create the report.** A commit whose upload never ran has no report at all, and
Codecov posts no status and no comment for it. That is what a build cache buys
when it treats the upload step as already satisfied and skips it, so keep that
step uncached.

`references/codecov-yml.md` carries these keys with their defaults.

## Where Codecov reads its config from

`codecov.yml` or `.codecov.yml`, in the repository root, in `.github/`, or in
`dev/` — six locations, and a repository can carry more than one. Reading the
root alone and concluding there is no config is the common way to answer the
wrong question.

**Codecov reads the YAML from the branch under test**, so a change takes effect
on the pull request that makes it rather than once merged — which is also how a
pull request weakens its own gate. `codecov.strict_yaml_branch` pins the read to
one branch.

**An unrecognised key is ignored rather than rejected**, so a misspelling
disables a section silently and nothing says so. The validator is what catches
it, and it checks the schema rather than the meaning:

```sh
curl -sS --fail-with-body --data-binary @.github/codecov.yml \
  https://codecov.io/validate
```

On success it echoes the whole parsed config, each `paths` glob expanded to the
regex Codecov matches with — which is where a component matching nothing shows
itself. It uploads the file, so treat the call as publishing it.

## Codecov project and patch statuses measure different lines

`codecov/patch` scores the lines the diff added or changed, and nothing else.
`codecov/project` scores the whole report against a base. So a pull request
passes patch at 100% while project falls: coverage moved on lines outside the
diff, which Codecov calls **indirect changes** — a deleted test, a flag that
uploaded on the base and not the head, a test whose path through the code
depends on time or environment.

`removed_code_behavior` (default `adjust_base`) recomputes the base with removed
lines filtered out, so deleting uncovered code stops failing the project status.
It applies to project only, and only where `target` is `auto`.

## How Codecov chooses the base commit

Codecov compares against a commit **it** picks: it walks back from the pull
request base for an ancestor with both a report and a passing CI build. Finding
one with no report, it substitutes an earlier report and adjusts it forward — a
**pseudo-comparison**, on by default under `allow_pseudo_compare`.

**Finding nothing, it reports the head totals and every delta as `?`.** The
comment names it:

```text
⚠️ Please upload report for BASE (`main@9613142`).
```

That is a CI problem rather than a coverage one: no job uploads coverage for
commits on the base branch, so nothing exists to compare against. A pull-request
trigger alone is a common cause, since it never builds the base branch's own
commits.

## Read Codecov figures without credentials

Authenticate through `gh`, which already works against private repositories:

```sh
# The comment: base and head totals, per-flag deltas, the missing-BASE warning
gh pr view <n> --json comments \
  --jq '.comments[] | select(.author.login | startswith("codecov")) | .body'

# The statuses: each description carries the percentage and what it compared to
gh api repos/{owner}/{repo}/commits/{sha}/status --jq '.statuses[]'

# github_checks (on by default) puts the same figures in a check run
gh api repos/{owner}/{repo}/commits/{sha}/check-runs \
  --jq '.check_runs[] | select(.app.slug | startswith("codecov")) | .output'
```

**Then settle it against the report the upload came from.** Counting the CI
artifact locally is what turns a disagreement into an explanation, and it needs
no Codecov at all: in lcov, `LH`/`LF` give the local line figure, and the `BRDA`
records are where Codecov derives partials — a line inside `LH` becomes a
partial once some branch on it was never taken.

## Read a Codecov report through the API

Base `https://api.codecov.io/api/v2/{service}/{owner}/repos/{repo}`, where
service is `github`, `gitlab`, `bitbucket` or an `_enterprise` / `_server`
variant. **A public repository needs no credentials.** A private one needs a
token, so where the `gh` route above already answers the question, take it —
it reaches a private repository on the credential `gh` already holds.

| Path                                             | What it answers                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `totals/?sha=`                                   | the totals object and a per-file breakdown                                                           |
| `report/?sha=`                                   | the same plus `line_coverage`: `0` hit, `1` miss, `2` partial                                        |
| `compare/?pullid=`                               | `totals.base`, `totals.head`, `totals.patch` — what the project and patch statuses are computed from |
| `pulls/`                                         | one row per pull request; `base_totals: null` is the missing BASE report                             |
| `flags/`, `components/`, `branches/`, `commits/` | what Codecov holds records of                                                                        |

`totals/` and `report/` take `path=`, `flag=` and `component_id=`, which
reproduces what a single component's status saw. `report/` is how you name the
partial lines rather than only count them.

## Codecov API tokens for private repositories

Reading a private repository needs a Codecov personal access token (Settings →
Access). **The upload token is a different credential**: `CODECOV_TOKEN` in CI
authorises uploads and will not read.

Keep the value in the environment and let the caller expand it, so it reaches
the request without passing through the transcript:

```powershell
# PowerShell: in-process, so the value reaches no command line at all
Invoke-RestMethod -Uri $uri -Headers @{
  Authorization = "bearer $env:CODECOV_API_TOKEN"
}
```

```sh
# bash: --config keeps it out of argv, where the process list would show it
curl --config <(printf 'header = "Authorization: bearer %s"\n' \
  "$CODECOV_API_TOKEN") "$url"
```

- **Report presence, never value.** `[ -n "$CODECOV_API_TOKEN" ]` answers
  whether it is set; a length answers how long it is.
- **`-v`, `-i` and `--trace` echo the request headers.** Diagnose a failing call
  with the response body and status line instead.
- **An unset variable is an answer.** Say so, and that exporting it in the shell
  is what supplies it. Reading it out of a config file, or asking for it in the
  conversation, puts a live credential where deleting a message will not remove
  it.

## The Codecov documentation index

`https://docs.codecov.com/llms.txt` indexes every documentation and API
reference page. Append `.md` to any `docs.codecov.com` URL for its markdown.
