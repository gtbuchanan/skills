# API Request Validation Pipeline

Every inbound request undergoes the performance of a validation pass in `src/middleware/validate.ts` before any handler is given invocation. The pipeline makes an execution of four stages in a fixed order, and a failure at any stage results in the termination of processing for that request.

The first stage does a check on `Content-Type`. Anything other than `application/json` gives rise to a `415` response with the error code `UNSUPPORTED_MEDIA_TYPE`. The second stage carries out an enforcement of the body size limit, which has its definition in `validation.max_body_bytes` (currently `1048576`); an excess over that limit is productive of a `413` with `PAYLOAD_TOO_LARGE`.

The third stage performs a parse of the body against the Zod schema registered for the route. Should the parse be unsuccessful, the middleware makes a collection of every issue rather than doing an early return, and gives back a `400` with `VALIDATION_FAILED` plus an `errors` array in which each entry has a `path` and a `message`.

The fourth stage does the removal of unknown keys. We made a determination some time ago in favour of stripping rather than rejection, so that the addition of new client fields does not bring about breakage of older deployments. Note that stripping happens after the size check, so an oversized body full of unknown keys will still result in a failure with `413`.
