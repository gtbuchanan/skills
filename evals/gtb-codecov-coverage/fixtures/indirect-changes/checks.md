# Checks on PR #518

```text
codecov/patch     success   100.00% of diff hit (target 80.00%)
codecov/project   failure   79.10% (-1.24%) compared to 4f0a9b2
```

The pull request adds one module, `src/billing/proration.ts`, with a test file
beside it, and deletes `src/billing/legacy-proration.ts` along with the suite
that exercised it. Nothing else under `src/` changed.

`codecov.yml` in full:

```yaml
coverage:
  status:
    patch:
      default:
        target: 80%
    project:
      default:
        removed_code_behavior: off
        target: auto
```
