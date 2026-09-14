# codecov.yml keys that move the number

Read this when a reported percentage, a status verdict or a component's scope
needs to be traced back to configuration. Being the copy is this file's job, so
it carries defaults rather than pointing at them; `https://codecov.io/validate`
returns the repository's own file parsed, which is what settles what is actually
in effect.

## codecov

| Key                          | Default | Effect                                                                                                                                                                     |
| ---------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_ci_to_pass`         | `true`  | Hold the status until every other status passes.                                                                                                                           |
| `notify.after_n_builds`      | `1`     | Wait for this many uploads before notifying. A repository uploading one report per package notifies on the first and reports totals nobody recognises until the rest land. |
| `notify.wait_for_ci`         | `true`  | Wait for CI to finish. Codecov counts every non-Codecov status as CI.                                                                                                      |
| `notify.manual_trigger`      | `false` | Send nothing until the CLI's `send-notifications` runs. Requires Codecov's CLI.                                                                                            |
| `notify.notify_error`        | `false` | Replace the comment with a failure count when uploads fail to process.                                                                                                     |
| `max_report_age`             | `12h`   | Refuse reports older than this. A replayed or long-queued pipeline loses its upload here.                                                                                  |
| `disable_default_path_fixes` | `false` | Turn off the path rewrites Codecov applies before `fixes`.                                                                                                                 |
| `strict_yaml_branch`         | none    | Read the YAML only from this branch, so a pull request cannot change its own gate.                                                                                         |
| `allow_pseudo_compare`       | `true`  | Substitute an earlier report when the base has none and adjust it forward. Off, a base without a report renders an error instead.                                          |
| `archive.uploads`            | `true`  | Keep the raw uploaded reports.                                                                                                                                             |

## coverage

| Key         | Default    | Effect                                                                          |
| ----------- | ---------- | ------------------------------------------------------------------------------- |
| `precision` | `2`        | Decimal places, 0 to 5.                                                         |
| `round`     | `down`     | `down`, `up` or `nearest`. Truncating is why a value ending 69… reports as .69. |
| `range`     | `70...100` | The band rendered green. Display only.                                          |

## coverage.status.project and coverage.status.patch

Each takes named status blocks; `default` is a name, not a settings scope.

| Key                     | Default       | Effect                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`                | `auto`        | `auto` compares against the base commit's coverage; a number is an absolute floor.                                                                                                                                                                                           |
| `threshold`             | none          | Permit a drop of this many points and still pass. Codecov's own examples show both `0%` and `5%`, so read the repository's file rather than assuming.                                                                                                                        |
| `flags`                 | none          | Score the combined coverage of these flags alone.                                                                                                                                                                                                                            |
| `paths`                 | none          | Score these paths alone. Accepts globs and regexes.                                                                                                                                                                                                                          |
| `branches`              | none          | Post only on these branches.                                                                                                                                                                                                                                                 |
| `if_ci_failed`          | `error`       | `success`, `failure`, `error` or `ignore`.                                                                                                                                                                                                                                   |
| `only_pulls`            | `false`       | Post on pull requests alone.                                                                                                                                                                                                                                                 |
| `informational`         | `false`       | Always pass, whatever the number. The way to report without gating.                                                                                                                                                                                                          |
| `removed_code_behavior` | `adjust_base` | Project only, and only under `target: auto`. `off` fails on any drop; `removals_only` passes when the change removes code and adds none; `adjust_base` recomputes the base without the removed lines; `fully_covered_patch` passes on a 100% patch with no indirect changes. |

`base` is deprecated and has had no effect since July 2020.

## flags

```yaml
flags:
  backend:
    paths:
      - src/backend
    carryforward: true # default false
```

`carryforward: true` reuses the flag's coverage from the most recent commit that
uploaded it. Off, a flag that uploads nothing contributes zeroes — which reads
as a coverage collapse rather than as a missing upload.

Carried-forward flags stay out of the pull request comment, so a flag's absence
from that table means it did not upload on this commit rather than that it holds
no coverage. Carryforward needs one commit where every flag uploaded, or it has
no baseline to carry.

## component_management

```yaml
component_management:
  default_rules: # inherited by components that define no rule of their own
    paths:
      - '!**/*.test.ts'
    statuses:
      - type: project
        target: auto
  individual_components:
    - component_id: backend # required, and immutable
      name: Backend # optional, and free to change
      paths:
        - src/backend/**
      flag_regexes:
        - 'backend.*'
```

Components filter one upload by path after the fact, where a flag needs an
upload of its own. Given both `paths` and `flag_regexes`, a file must match both.
`component_id` is what statuses and the API key on, so renaming `name` is safe
and changing `component_id` starts a new component.

## ignore and fixes

```yaml
ignore:
  - 'path/to/folder' # the folder and everything under it
  - '**/*.gen.ts' # globs accepted

fixes:
  - 'before/::after/' # before/path  => after/path
  - '::after/' # path/        => after/path/
  - 'before/::' # before/path/ => path/
```

`ignore` removes paths from the totals. `fixes` rewrites report paths onto repo
paths; a path that still fails to match the tree becomes an untracked file and
leaves the denominator entirely.

## parsers

`partials_as_hits: true` (default `false`) scores a partially-covered line as a
hit, which is what reconciles Codecov with a local line-coverage figure. It is
available under `lcov`, `cobertura`, `jacoco` and `go`.

| Key                                   | Default | Effect                                         |
| ------------------------------------- | ------- | ---------------------------------------------- |
| `javascript.enable_partials`          | `yes`   | Derive partials from branch data.              |
| `cobertura.handle_missing_conditions` | `false` | Treat a condition the report omits as present. |
| `v1.include_full_missed_files`        | `false` | Include files with no coverage at all.         |
| `gcov.branch_detection.conditional`   | `yes`   | Count conditional branches.                    |
| `gcov.branch_detection.loop`          | `yes`   | Count loop branches.                           |
| `gcov.branch_detection.method`        | `no`    | Count method branches.                         |
| `gcov.branch_detection.macro`         | `no`    | Count macro branches.                          |

Every parser key reads what the uploaded report already holds. A format carrying
no branch data yields no partials whatever these say.

## comment and github_checks

| Key                         | Default              | Effect                                                                                           |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `comment.layout`            | `diff, flags, files` | Which sections appear, in order.                                                                 |
| `comment.behavior`          | `default`            | `default` updates in place, `once` posts and stops, `new` deletes and reposts, `spammy` appends. |
| `comment.require_changes`   | `false`              | Post only when coverage moves.                                                                   |
| `github_checks.annotations` | `true`               | Annotate uncovered lines in the GitHub diff. `false` falls back to plain statuses.               |
