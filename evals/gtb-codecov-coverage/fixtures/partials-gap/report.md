# Coverage on `feat/invoice-export`

The suite prints this at the end of `pnpm test`:

```text
 % Coverage report from v8
------------|---------|----------|---------|---------|
File        | % Stmts | % Branch | % Funcs | % Lines |
------------|---------|----------|---------|---------|
All files   |   85.55 |    62.50 |   91.20 |   85.55 |
 src/api    |   82.10 |    58.33 |   88.00 |   82.10 |
 src/domain |   89.40 |    67.90 |   94.10 |   89.40 |
------------|---------|----------|---------|---------|
```

`coverage/lcov.info` for the same run totals 1800 lines, of which 1540 are
recorded as hit and 260 as not hit. 120 of the hit lines carry `BRDA` records
where some branch was never taken.

The Codecov check on the pull request reports **78.88%**.

Nothing in `codecov.yml` sets `ignore`, `fixes`, `flags` or `parsers`.
