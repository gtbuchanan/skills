# Ingest settings

Settings to document, all under the `ingest.` prefix in `config/ingest.yaml`:

| Key                 | Default       | Notes                                                                |
| ------------------- | ------------- | -------------------------------------------------------------------- |
| `batch_size`        | `500`         | Rows per flush. Above `2000` the writer exceeds the 4 MB gRPC frame. |
| `flush_interval_ms` | `5000`        | Upper bound on staleness; a partial batch flushes anyway.            |
| `max_retries`       | `3`           | Per batch. Exhausted retries send the batch to the DLQ.              |
| `dlq_topic`         | `ingest.dead` | Kafka topic. Must exist before boot; the writer does not create it.  |
| `parallelism`       | `4`           | Writer goroutines. Each holds one connection.                        |
| `schema_check`      | `true`        | Rejects rows whose columns drifted from the registry.                |

Additional facts:

- All keys are read at boot only; changes require a restart.
- `parallelism` multiplied by `batch_size` bounds in-flight memory.
