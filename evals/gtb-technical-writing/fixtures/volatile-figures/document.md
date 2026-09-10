# Migration Notes: `orders.customer_id` Rename

## What Shipped

The column `orders.user_id` is now `orders.customer_id`. The rename went out in two migrations under `db/migrate/`: `20260714_add_customer_id.rb` backfilled and dual-wrote, and `20260821_drop_user_id.rb` removed the old column once the read path was clean.

We touched 47 call sites across the app, mostly in `app/models/order.rb` and the reporting queries in `app/services/reports/`. Line coverage on the order model sits at 91.4% after the change, and the full suite now takes about 9 minutes 40 seconds on CI, up from roughly 8 minutes — the extra time is the 312 tests in `spec/models/order_spec.rb`, which we expanded during the dual-write window.

## Pinned Dependency

`pg` is pinned to `1.5.4` in `Gemfile.lock`. Do not bump it. `1.5.5` changed how `ActiveRecord` surfaces the `PG::UndefinedColumn` error class, which broke the guard clause in `app/models/concerns/legacy_column.rb` that we rely on during future renames.

## Log

- 2026-08-21: Ran `20260821_drop_user_id.rb` against production at 02:15 UTC. Took 11 seconds, `ACCESS EXCLUSIVE` lock held for under a second. No errors.
- 2026-08-22: Removed the dual-write branch and the `orders.user_id` alias from the GraphQL schema.
