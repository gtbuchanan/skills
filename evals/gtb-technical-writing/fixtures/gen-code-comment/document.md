# `settle()`

Function to document:

```ts
export const settle = (entries: readonly Entry[], asOf: Date): Settlement => {
  /* ... */
};
```

Facts the comment must convey:

- Returns a `Settlement` summing every entry dated on or before `asOf`.
- Entries dated after `asOf` are ignored rather than treated as an error.
- Entries with `status: 'void'` are excluded regardless of their date.
- Throws `RangeError` when `asOf` precedes the earliest entry's date.
- Ordering of `entries` does not matter; the sum is commutative.
