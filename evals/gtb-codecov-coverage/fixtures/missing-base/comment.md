# What Codecov posted on PR #412

```text
Codecov Report
✅ All modified and coverable lines are covered by tests.
⚠️ Please upload report for BASE (`main@7c41de9`). Learn more about missing
   BASE report.

@@           Coverage Diff           @@
##             main     #412   +/-   ##
=======================================
  Coverage        ?   78.88%
=======================================
  Files           ?      146
  Lines           ?     1800
  Branches        ?      412
=======================================
  Hits            ?     1420
  Misses          ?      260
  Partials        ?      120
```

| Flag     | Coverage Δ       |
| -------- | ---------------- |
| `api`    | `74.20% <ø> (?)` |
| `domain` | `83.10% <ø> (?)` |

No `codecov/project` or `codecov/patch` status appears on the pull request.

`.github/workflows/ci.yml` begins:

```yaml
name: CI
on:
  pull_request: {}
```

The upload step inside it succeeds on every run.
