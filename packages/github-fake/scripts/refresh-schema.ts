/*
 * Replaces the vendored schema with the one GitHub publishes today.
 *
 * Run with every gh bump: gh queries fields as soon as GitHub ships them, and
 * a field missing from the vendored schema fails validation before the fake
 * can say whether a world models it. The diff it leaves is the review: what
 * GitHub added, changed or removed since the last refresh.
 *
 * The published schema is unversioned, which is why it is vendored rather
 * than fetched at install: two installs a day apart would validate against
 * different schemas.
 *
 * Usage: pnpm -C packages/github-fake run schema:refresh
 */

/* v8 ignore file -- One fetch and one write, run by hand. A test would only
   check that a stubbed fetch returns what it was told to. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = 'https://docs.github.com/public/fpt/schema.docs.graphql';
const target = new URL('../schema/github.graphql', import.meta.url);

const response = await fetch(source);
if (!response.ok)
  throw new Error(`${source} answered ${String(response.status)} ${response.statusText}`);

// LF only, whatever the server sends, so a refresh diffs by content alone.
const schema = await response.text();
writeFileSync(target, schema.replaceAll('\r\n', '\n'));
console.log(`Wrote ${fileURLToPath(target)}`);
