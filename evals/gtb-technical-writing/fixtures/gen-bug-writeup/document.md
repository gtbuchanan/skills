# Double billing on annual plans

Facts for the report:

- Symptom: users on annual plans were billed twice in the same cycle.
- Scope: 38 accounts, all on the `annual_2025` price, between 2026-03-02 and
  2026-03-04.
- Cause: `chargeCycle` in `billing/cycle.ts` compares `lastChargedAt` to the
  cycle start with `>` rather than `>=`, so a charge landing exactly on the
  boundary is not counted as having happened.
- Trigger: the boundary is only hit when the previous charge ran at exactly
  00:00:00 UTC, which the retry worker does after a failed first attempt.
- Fix: change the comparison to `>=` and add a unique index on
  `(account_id, cycle_start)`.
- Refunds already issued manually; no customer action needed.
