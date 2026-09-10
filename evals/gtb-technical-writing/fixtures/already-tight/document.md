# Token Bucket Rate Limiter

Each API key gets one bucket, keyed `ratelimit:{key_id}` in Redis. Capacity is 100 tokens; refill is 10 tokens per second. A request costs 1 token, except `POST /v1/batch`, which costs 1 token per item in the payload.

Refill is lazy. The bucket stores `tokens` and `updated_at` (epoch milliseconds); on each request the limiter computes `min(capacity, tokens + elapsed_ms * 0.01)` before deducting. Nothing runs on a timer, so idle keys cost no work.

Read, compute and write happen in one Lua script, `scripts/take.lua`, loaded via `EVALSHA`. This makes the check-and-deduct atomic across the API pods, which would otherwise race.

Rejected requests return `429` with `RATE_LIMIT_EXCEEDED` and a `Retry-After` header holding the seconds until the bucket holds enough tokens for the request. `X-RateLimit-Remaining` carries the post-deduction count on every response, success or not.

Keys expire after 3600 seconds of inactivity, since a bucket idle that long has refilled to capacity and is indistinguishable from a fresh one.

Overrides live in `config/ratelimit.yaml` under `keys:`, mapping a key ID to a capacity and refill rate. They are read at boot only; changing one requires a restart.

If Redis is unreachable the limiter fails open and logs `ratelimit.redis_unavailable`. This is deliberate: an outage should not take the API down with it.
