# Database Connection Pool Settings

There is a single shared pool per service instance, and it is HikariCP that backs it. What happens is that the pool is constructed at startup from the block under `datasource.pool` in `config/application.yaml`.

There are three settings that matter most here. It is `maximumPoolSize` (currently `20`) that puts a ceiling on concurrent connections, and there are 8 instances in production, so what that works out to is 160 connections against a Postgres `max_connections` of 200. There is not much headroom left, so it is worth checking the arithmetic before anyone raises the size.

It is `connectionTimeout` (`30000` ms) that governs how long a caller waits for a free connection. What happens when the wait is exceeded is that Hikari throws `SQLTransientConnectionException` with the message `Connection is not available, request timed out`, and there is an alert wired to that in `alerts/db.yaml`.

There is also `idleTimeout` (`600000` ms), and what that governs is how long a connection sits unused before the pool retires it, which is what keeps a quiet service from holding its whole allocation overnight. There is `maxLifetime` (`1800000` ms) too. It is important that `maxLifetime` stay several seconds under the database's own `idle_in_transaction_session_timeout`, because what happens otherwise is that the server closes a connection the pool still believes is good, and the next borrower gets a broken pipe.

There is leak detection enabled at `leakDetectionThreshold: 60000`. It is a stack trace in the log, not a closed connection, that this produces.
