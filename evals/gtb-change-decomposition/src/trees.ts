/*
 * The scenarios the gtb-change-decomposition suite plans against, and the file
 * bodies each one seeds.
 *
 * The trees are string constants rather than files under `fixtures/`, following
 * gtb-gh-pr-authoring: source text checked in is source the repo's own typecheck
 * and lint would compile, and these files are deliberately unfinished — a JSX
 * page with no tsconfig behind it, a module importing a client that does not
 * exist, three files nobody has ever formatted. As strings they are data; on
 * disk they would be a wall of suppressions.
 *
 * Each tree is small enough to read in full — a plan can only be as grounded as
 * what the agent could see — and carries exactly the structure its scenario is
 * about: the layer split in `layer-trap`, the un-abstracted provider in
 * `structural-first`, the two unrelated problems in `churn-separated`, the
 * single contract in `leave-whole`, and in `fog` no visible cause at all.
 */

/**
 * A directory tree to seed, keyed by path relative to the scenario root.
 */
export interface Scenario {
  readonly key: string;
  readonly tree: Readonly<Record<string, string>>;
}

/**
 * Where a scenario is seeded, relative to the eval workspace. The prompt hands
 * the agent this path, and a plan's `touches` entries are read relative to it.
 */
export const scenarioPath = (key: string): string => `scenarios/${key}`;

const reportsSchema = [
  'CREATE TABLE reports (',
  '  id       TEXT PRIMARY KEY,',
  '  owner_id TEXT NOT NULL',
  ');',
  '',
  'CREATE TABLE report_rows (',
  '  report_id   TEXT NOT NULL REFERENCES reports (id),',
  '  occurred_at TIMESTAMP NOT NULL,',
  '  label       TEXT NOT NULL,',
  '  amount      NUMERIC NOT NULL',
  ');',
  '',
].join('\n');

const reportsApi = [
  "import { query } from '../db/client.ts';",
  '',
  'export interface ReportRow {',
  '  amount: number;',
  '  label: string;',
  '  occurredAt: string;',
  '}',
  '',
  'export const listReports = async (ownerId: string): Promise<ReportRow[]> =>',
  '  query<ReportRow>(',
  "    'SELECT occurred_at, label, amount FROM report_rows JOIN reports ON ' +",
  "    'reports.id = report_rows.report_id WHERE reports.owner_id = $1',",
  '    [ownerId],',
  '  );',
  '',
].join('\n');

const reportsPage = [
  "import { listReports } from '../api/reports.ts';",
  '',
  'export const ReportsPage = async ({ ownerId }: { ownerId: string }) => {',
  '  const rows = await listReports(ownerId);',
  '',
  '  return (',
  '    <table>',
  '      <tbody>',
  '        {rows.map(row => (',
  '          <tr key={`${row.occurredAt}-${row.label}`}>',
  '            <td>{row.occurredAt}</td>',
  '            <td>{row.label}</td>',
  '            <td>{row.amount}</td>',
  '          </tr>',
  '        ))}',
  '      </tbody>',
  '    </table>',
  '  );',
  '};',
  '',
].join('\n');

const stripeProvider = [
  '/*',
  ' * The only payment provider the checkout knows about. Nothing abstracts its',
  ' * shape — checkout.ts calls these two functions directly.',
  ' */',
  'export interface Charge {',
  '  amountCents: number;',
  '  currency: string;',
  '  token: string;',
  '}',
  '',
  'export const chargeStripe = async (charge: Charge): Promise<string> => {',
  "  const response = await fetch('https://api.stripe.com/v1/charges', {",
  '    body: new URLSearchParams({',
  '      amount: String(charge.amountCents),',
  '      currency: charge.currency,',
  '      source: charge.token,',
  '    }),',
  "    method: 'POST',",
  '  });',
  '',
  '  const body = (await response.json()) as { id: string };',
  '  return body.id;',
  '};',
  '',
  'export const refundStripe = async (chargeId: string): Promise<void> => {',
  '  await fetch(`https://api.stripe.com/v1/charges/${chargeId}/refunds`, {',
  "    method: 'POST',",
  '  });',
  '};',
  '',
].join('\n');

const checkout = [
  "import { type Charge, chargeStripe, refundStripe } from './stripe.ts';",
  '',
  'export interface Order {',
  '  charge: Charge;',
  '  id: string;',
  '}',
  '',
  'export const placeOrder = async (order: Order): Promise<string> => {',
  '  const chargeId = await chargeStripe(order.charge);',
  '  return chargeId;',
  '};',
  '',
  'export const cancelOrder = async (chargeId: string): Promise<void> => {',
  '  await refundStripe(chargeId);',
  '};',
  '',
].join('\n');

const checkoutTest = [
  "import { describe, expect, it, vi } from 'vitest';",
  "import { placeOrder } from './checkout.ts';",
  '',
  "vi.mock('./stripe.ts', () => ({",
  "  chargeStripe: vi.fn(async () => 'ch_123'),",
  '  refundStripe: vi.fn(async () => undefined),',
  '}));',
  '',
  "describe('placeOrder', () => {",
  "  it('returns the provider charge id', async () => {",
  '    const chargeId = await placeOrder({',
  "      charge: { amountCents: 500, currency: 'usd', token: 'tok_1' },",
  "      id: 'order_1',",
  '    });',
  '',
  "    expect(chargeId).toBe('ch_123');",
  '  });',
  '});',
  '',
].join('\n');

/*
 * Deliberately unformatted — inconsistent quotes, no semicolons in places,
 * four-space and two-space indentation in the same tree. The reformat is one of
 * the two things the scenario asks for, so it has to be visibly needed.
 */
const staleCache = [
  'const entries = new Map()',
  '',
  'export function get(key,ttlMs) {',
  '    const entry = entries.get(key)',
  '    if (!entry) return undefined',
  '    // Serves the entry only once it has expired, and drops it while fresh.',
  '    if (Date.now() - entry.at < ttlMs) {',
  '      entries.delete(key)',
  '      return undefined',
  '    }',
  '    return entry.value',
  '}',
  '',
  'export function set(key,value){',
  '  entries.set(key,{at:Date.now(),value})',
  '}',
  '',
].join('\n');

const queue = [
  'const pending = []',
  '',
  'export function push(job){',
  '    pending.push(job)',
  '}',
  '',
  'export function drain(handler) {',
  '  while(pending.length>0){',
  '      const job = pending.shift()',
  '      handler(job)',
  '  }',
  '}',
  '',
].join('\n');

const slug = [
  'export function slugify(text){',
  '  return text',
  '      .toLowerCase()',
  "      .replace(/[^a-z0-9]+/g,'-')",
  "      .replace(/^-|-$/g,'')",
  '}',
  '',
].join('\n');

const webhookTypes = [
  'export interface WebhookEvent {',
  '  id: string;',
  '  occurredAt: string;',
  '  payload: Record<string, unknown>;',
  '}',
  '',
].join('\n');

const webhookParse = [
  "import type { WebhookEvent } from './types.ts';",
  '',
  'export const parseEvent = (raw: string): WebhookEvent => {',
  '  const body = JSON.parse(raw) as {',
  '    id: string;',
  '    occurred_at: string;',
  '    payload: Record<string, unknown>;',
  '  };',
  '',
  '  return {',
  '    id: body.id,',
  '    occurredAt: body.occurred_at,',
  '    payload: body.payload,',
  '  };',
  '};',
  '',
].join('\n');

const webhookHandle = [
  "import { parseEvent } from './parse.ts';",
  "import type { WebhookEvent } from './types.ts';",
  '',
  'const handlers: ((event: WebhookEvent) => Promise<void>)[] = [];',
  '',
  'export const onEvent = (handler: (event: WebhookEvent) => Promise<void>): void => {',
  '  handlers.push(handler);',
  '};',
  '',
  'export const handle = async (raw: string): Promise<void> => {',
  '  const event = parseEvent(raw);',
  '  for (const handler of handlers) await handler(event);',
  '};',
  '',
].join('\n');

const searchQuery = [
  "import { rank } from './rank.ts';",
  "import { lookup } from './index.ts';",
  '',
  'export interface Hit {',
  '  docId: string;',
  '  score: number;',
  '}',
  '',
  'export const search = async (terms: string[]): Promise<Hit[]> => {',
  '  const candidates = await lookup(terms);',
  '  return rank(candidates, terms);',
  '};',
  '',
].join('\n');

const searchIndex = [
  "import { query } from '../db/client.ts';",
  '',
  'export const lookup = async (terms: string[]): Promise<string[]> => {',
  '  const rows = await query<{ doc_id: string }>(',
  "    'SELECT doc_id FROM postings WHERE term = ANY($1)',",
  '    [terms],',
  '  );',
  '',
  '  return rows.map(row => row.doc_id);',
  '};',
  '',
].join('\n');

const searchRank = [
  "import { loadDocument } from '../store/documents.ts';",
  '',
  'export const rank = async (docIds: string[], terms: string[]) => {',
  '  const scored = [];',
  '',
  '  for (const docId of docIds) {',
  '    const document = await loadDocument(docId);',
  '    const score = terms.filter(term => document.text.includes(term)).length;',
  '    scored.push({ docId, score });',
  '  }',
  '',
  '  return scored.sort((left, right) => right.score - left.score);',
  '};',
  '',
].join('\n');

export const scenarios: readonly Scenario[] = [
  {
    key: 'layer-trap',
    tree: {
      'src/api/reports.ts': reportsApi,
      'src/db/schema.sql': reportsSchema,
      'src/ui/ReportsPage.tsx': reportsPage,
    },
  },
  {
    key: 'structural-first',
    tree: {
      'src/payments/checkout.test.ts': checkoutTest,
      'src/payments/checkout.ts': checkout,
      'src/payments/stripe.ts': stripeProvider,
    },
  },
  {
    key: 'churn-separated',
    tree: {
      'src/cache.js': staleCache,
      'src/queue.js': queue,
      'src/slug.js': slug,
    },
  },
  {
    key: 'leave-whole',
    tree: {
      'src/webhook/handle.ts': webhookHandle,
      'src/webhook/parse.ts': webhookParse,
      'src/webhook/types.ts': webhookTypes,
    },
  },
  {
    key: 'fog',
    tree: {
      'src/search/index.ts': searchIndex,
      'src/search/query.ts': searchQuery,
      'src/search/rank.ts': searchRank,
    },
  },
];
