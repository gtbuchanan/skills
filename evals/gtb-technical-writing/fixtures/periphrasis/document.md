# Read-Through Cache Invalidation

The cache operates in read-through mode, which is to say that on the occasion of a miss the loader defined in `cache/loader.py` goes to Postgres in order to fetch the row and subsequently populates the entry prior to returning it to the caller.

Every entry is written with a time-to-live of 300 seconds, which is configured by way of the `cache.default_ttl_seconds` key. At the point in time at which that window has elapsed, the entry is no longer of any use to us and the next reader will take the miss path. Entries for the `user_profile` namespace are given a longer window of 3600 seconds, for the reason that profile records undergo modification on a fairly infrequent basis.

Explicit invalidation is carried out at the moment a write commits. The `after_commit` hook makes a call to `invalidate(namespace, key)`, which performs a deletion of the entry rather than performing an overwrite of it, on account of the fact that the writer does not necessarily possess the fully hydrated object at that moment in time.

In the event that Redis is not reachable, the client will make a return of a miss instead of raising, so as to allow reads to continue in a degraded fashion. This behaviour is under the control of `cache.fail_open` (`true` by default). Stampede protection takes the form of a per-key lock with a duration of 5 seconds; waiters that fail to acquire it receive `CACHE_LOCK_TIMEOUT` at a later point in time.
