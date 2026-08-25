/*
 * The repositories the gtb-git-commit-conventions suite runs against.
 *
 * This skill's output is not a log of intercepted calls — it is the commits the
 * agent writes. So every scenario is a real repository: the baseline history is
 * committed for real and the pending work is left in the working tree, and the
 * checker reads the resulting commit objects back with git. `status`, `diff` and
 * `log` are true by construction, and there is nothing to stub.
 *
 * Each scenario isolates one thing the skill has to get right, and each is its
 * own directory, so a test can only see the repository it was given.
 *
 * `conventional-repo` is the load-bearing one: the skill says Conventional
 * Commits are off BY DEFAULT and to check the project first. A skill that
 * simply banned the prefix would pass every other scenario here and fail that
 * one, which is what stops this suite from rewarding the wrong lesson.
 */
import type { SeedCommit } from '#lib/seed-repo.ts';

/**
 * A repository to seed, plus the work left uncommitted in it.
 */
export interface Scenario {
  /**
   * The history to commit, oldest first.
   */
  readonly baseline: readonly SeedCommit[];
  readonly key: string;
  /**
   * Files written into the working tree and deliberately NOT committed — the
   * pending work the agent is asked to deal with. Empty when the scenario is
   * about existing history instead.
   */
  readonly pending: Readonly<Record<string, string>>;
}

/**
 * A cache whose staleness check is inverted: fresh entries are dropped and
 * stale ones served. `ttl` flips the comparison, which is the whole fix.
 */
const cacheTs = (guard: string): string =>
  `const entries = new Map<string, { at: number; value: string }>();

export function get(key: string, ttlMs: number): string | undefined {
  const entry = entries.get(key);
  if (entry === undefined) return undefined;
${guard}
  return entry.value;
}

export function set(key: string, value: string): void {
  entries.set(key, { at: Date.now(), value });
}
`;

/**
 * A pool that leaks a connection when the caller throws. The fix is a
 * `finally`, and *why* it matters (exhaustion under load, not tidiness) is the
 * kind of thing only the message can carry.
 */
const poolTs = (body: string): string =>
  `import { Pool } from 'pg';

const pool = new Pool({ max: 10 });

export async function withConnection<T>(run: (c: unknown) => Promise<T>) {
  const client = await pool.connect();
${body}
}
`;

/**
 * A retry helper with no jitter, so every caller wakes together and stampedes.
 */
const retryTs = (delay: string): string =>
  `export const backoffMs = (attempt: number): number => {
${delay}
};

export async function retry<T>(run: () => Promise<T>, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await run();
    } catch {
      await new Promise(resolve => setTimeout(resolve, backoffMs(i)));
    }
  }
  throw new Error('retries exhausted');
}
`;

/**
 * A limiter, first as a correct sliding window and then regressed to a fixed
 * one that lets a burst through at the boundary. The regression is the commit
 * the revert scenario has to undo.
 */
const rateTs = (body: string): string =>
  `const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number): boolean {
${body}
}
`;

export const scenarios: readonly Scenario[] = [
  /*
   * Unrelated changes in one working tree. Committing the code fix together
   * with the docs is the failure, and the checker asserts that seam by path.
   *
   * Both README edits are deliberately about the *setup instructions* and have
   * nothing to do with the cache. An earlier version documented the caching
   * behaviour here, and an agent reasonably bundled that sentence with the fix
   * that made it true — a defensible reading of "atomic is one idea", which the
   * by-path assertion then failed. The scenario, not the answer, was wrong: a
   * fixture testing "do not bundle unrelated work" must not contain work whose
   * relatedness is arguable.
   */
  {
    baseline: [
      {
        date: '2026-04-02T09:12:00+00:00',
        key: 'add-cache',
        subject: 'Add the response cache',
        tree: {
          'README.md':
            `# widgets

A small widget servcie.

## Setup

Run the server.
`,
          'src/cache.ts': cacheTs(
            `  // Fresh entries are dropped and stale ones served.
  if (Date.now() - entry.at < ttlMs) return undefined;`,
          ),
        },
      },
    ],
    key: 'split-tangled',
    pending: {
      'README.md':
        `# widgets

A small widget service.

## Setup

Run the server. It listens on port 8080 unless PORT is set.
`,
      'src/cache.ts': cacheTs('  if (Date.now() - entry.at >= ttlMs) return undefined;'),
    },
  },
  /*
   * One change, non-obvious enough that the message has to explain why. No
   * conventional history and no commitlint, so the plain subject is correct.
   */
  {
    baseline: [
      {
        date: '2026-04-05T14:40:00+00:00',
        key: 'add-pool',
        subject: 'Add the connection pool',
        tree: {
          'src/pool.ts': poolTs(
            `  const result = await run(client);
  client.release();
  return result;`,
          ),
        },
      },
    ],
    key: 'message-shape',
    pending: {
      'src/pool.ts': poolTs(
        `  try {
    return await run(client);
  } finally {
    client.release();
  }`,
      ),
    },
  },
  /*
   * The project derives releases from its subjects: a conventional history AND
   * a commitlint toolchain. Here the prefix is required, and omitting it is the
   * failure.
   */
  {
    baseline: [
      {
        date: '2026-03-11T10:05:00+00:00',
        key: 'feat-retry',
        subject: 'feat: add the retry policy',
        tree: { 'src/retry.ts': retryTs('  return 2 ** attempt * 100;') },
      },
      {
        date: '2026-03-12T11:30:00+00:00',
        key: 'chore-commitlint',
        subject: 'chore: enforce conventional commits',
        tree: {
          'commitlint.config.js':
            `export default { extends: ['@commitlint/config-conventional'] };
`,
          'package.json':
            `{
  "name": "gateway",
  "private": true,
  "devDependencies": {
    "@commitlint/cli": "^20.0.0",
    "@commitlint/config-conventional": "^20.0.0",
    "semantic-release": "^25.0.0"
  }
}
`,
        },
      },
      {
        date: '2026-03-13T09:20:00+00:00',
        key: 'fix-timeout',
        subject: 'fix: stop retrying on a client timeout',
        tree: { 'src/timeout.ts': 'export const clientTimeoutMs = 5000;\n' },
      },
    ],
    key: 'conventional-repo',
    pending: {
      'src/retry.ts': retryTs(
        `  const base = 2 ** attempt * 100;
  return base + Math.random() * base;`,
      ),
    },
  },
  /*
   * A change that closes one tracker item and merely advances another. The
   * distinction the skill draws — `Resolves:` only for what is actually
   * finished — is exactly what a `Closes:` on both would get wrong.
   */
  {
    baseline: [
      {
        date: '2026-04-09T16:22:00+00:00',
        key: 'add-refresh',
        subject: 'Add the token refresher',
        tree: {
          'src/refresh.ts':
            `let refreshing: Promise<string> | undefined;

export async function refresh(fetchToken: () => Promise<string>) {
  // Every caller starts its own refresh, so N callers mint N tokens.
  return fetchToken();
}

export function pending(): Promise<string> | undefined {
  return refreshing;
}
`,
        },
      },
    ],
    key: 'trailers',
    pending: {
      'src/refresh.ts':
        `let refreshing: Promise<string> | undefined;

export async function refresh(fetchToken: () => Promise<string>) {
  refreshing ??= fetchToken().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}

export function pending(): Promise<string> | undefined {
  return refreshing;
}
`,
    },
  },
  /*
   * The change to undo is already committed and pushed-shaped history. Hand
   * editing the code back would look plausible and lose the link to what was
   * undone, so the checker requires git's own revert — and proves the tree
   * really is the inverse rather than trusting the message.
   */
  {
    baseline: [
      {
        date: '2026-04-14T08:02:00+00:00',
        key: 'add-limiter',
        subject: 'Add the sliding-window rate limiter',
        tree: {
          'src/rate.ts': rateTs(
            `  const now = Date.now();
  const seen = (hits.get(key) ?? []).filter(at => now - at < windowMs);
  if (seen.length >= limit) return false;
  hits.set(key, [...seen, now]);
  return true;`,
          ),
        },
      },
      {
        date: '2026-04-15T13:45:00+00:00',
        key: 'fixed-window',
        subject: 'Switch the limiter to a fixed window',
        tree: {
          'src/rate.ts': rateTs(
            `  const bucket = Math.floor(Date.now() / windowMs);
  const seen = hits.get(key) ?? [];
  if (seen[0] === bucket && (seen[1] ?? 0) >= limit) return false;
  hits.set(key, [bucket, seen[0] === bucket ? (seen[1] ?? 0) + 1 : 1]);
  return true;`,
          ),
        },
      },
    ],
    key: 'revert',
    pending: {},
  },
];

/**
 * The identity the seeded commits are attributed to.
 */
export const author = { email: 'author@example.com', name: 'author' };

/**
 * The repo-local `user.name` / `user.email`. With global config disabled this
 * is the only identity left to read, and the agent needs one to commit at all.
 */
export const committer = { email: 'dev@example.com', name: 'dev' };

/**
 * Every scenario seeds onto this branch — none of them is about branch naming.
 */
export const branch = 'main';

/**
 * Where a scenario's repository lives, relative to the agent's working
 * directory. Both the seeder and the checker derive the path from the key, so
 * they cannot disagree about which repository a test is about.
 */
export const scenarioPath = (key: string): string => `scenarios/${key}`;
