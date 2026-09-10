# `await sleep(0)`

Line to explain:

```ts
await sleep(0);
```

The single fact to convey: it yields to the event loop so the pending
microtask queue drains before the assertion on the next line runs.
