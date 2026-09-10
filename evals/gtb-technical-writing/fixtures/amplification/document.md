# HTTP Client Retry Policy

The client only retries idempotent requests. What this means in practice is that `GET`, `HEAD`, `PUT` and `DELETE` are eligible, while `POST` is never retried automatically. The reasoning here is that a `POST` that times out may already have been processed server-side, so a second attempt can duplicate the write. Looking at it from another angle, we cannot distinguish a lost request from a lost response, so we assume the worst. To restate the rule: idempotent methods retry, `POST` does not.

Retries are capped at three attempts total, controlled by `http.retry.max_attempts` (default `3`). That is three attempts, not three retries on top of the first call — the initial request counts toward the budget. In other words, the client will make at most three round trips before giving up.

Backoff is exponential with full jitter, starting at 200ms and doubling, ceilinged by `http.retry.max_backoff_ms` (default `5000`). Retryable statuses are `429`, `502`, `503` and `504`. `500` is deliberately excluded, because a generic `500` usually indicates a deterministic bug that will simply fail again; retrying it just burns the budget. So `500` is not retried.

Connect timeout is 2s (`http.timeout.connect_ms`), read timeout 10s (`http.timeout.read_ms`). `Retry-After` on a `429` is honoured up to 30s; past that the call fails with `RETRY_CEILING_EXCEEDED`. After 20 consecutive failures the breaker in `internal/http/breaker.go` opens for 60s.
