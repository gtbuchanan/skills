# `search-indexer` lag alert

Facts for the procedure, run when the `search-indexer` lag alert fires:

- Confirm the lag is real: `kubectl -n search logs deploy/indexer --tail=50`
  and look for `consumer lag` above 10000.
- A restart is the usual fix: `kubectl -n search rollout restart deploy/indexer`.
- Restart is safe at any time — offsets are committed to Kafka, not held in
  memory, so nothing is reprocessed or lost.
- If lag does not fall within 10 minutes, the upstream Kafka partition is
  likely rebalancing; escalate to #platform rather than restarting again.
- Never scale the deployment above 6 replicas; the index shards are fixed at 6
  and extra replicas idle while holding connections.
