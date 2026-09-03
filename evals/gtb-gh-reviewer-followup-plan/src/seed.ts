/*
 * The PR this suite follows up on, as a real repository.
 *
 * The history below IS the PR, so `log`, `diff`, `rev-parse` and `status` are
 * true by construction and the stub only has to record what was asked.
 *
 * The commits are what the review is about. The reviewer left threads at
 * `order` and again at `baseline`; the author then fixed the timing-unsafe
 * compare (`constant-time`) and guarded one of two null dereferences
 * (`null-guard`), and never touched api/order.py at all. That is what makes
 * the judged threads exact-fix, partial and unaddressed.
 *
 * Seeding is reproducible on a given host — same trees, same identities, same
 * timestamps, so the same object names every run, and a SHA in a call log
 * still means something an hour later. That takes running git with no sight of
 * the developer's own config, which is what `hermeticGitEnv` is for.
 *
 * It is deliberately not a cross-platform guarantee — the container runner
 * produces different names than a Windows host — and nothing needs it to be.
 * setup.ts seeds and resolves the canned fixtures against each other in one
 * process, so a run is self-consistent whatever the names come out as.
 */
import type { SeedCommit } from '@gtbuchanan/agent-skills-harness/seed-repo';
import { seedHistory } from '@gtbuchanan/agent-skills-harness/seed-repo';
import { author, authorEmail, branch, user } from './scenario.ts';

/*
 * The fix has to be defensible on a READ of the file, not just as a hunk: the
 * agent judges the working tree now, so an import the change forgot, or a
 * timingSafeEqual that throws on a length mismatch, is a real defect it will
 * (correctly) call partial rather than exact-fix.
 */
const authTs = (verify: { body: string; imports: string }): string =>
  `import { ${verify.imports} } from 'node:crypto';

export interface Session {
  readonly token: string;
  readonly userId: string;
}

const sessions = new Map<string, Session>();

export function issueToken(userId: string): string {
  const token = createHash('sha256')
    .update(\`\${userId}:\${String(Date.now())}\`)
    .digest('hex');
  sessions.set(token, { token, userId });
  return token;
}

export function verifyToken(provided: string, expected: string): boolean {
${verify.body}
}

export function revoke(token: string): void {
  sessions.delete(token);
}
`;

/*
 * The partial verdict has to be legible from the DIFF, not only from the file:
 * the batch path is what the fix missed, so the commit that guards `handle`
 * rewrites `handle_batch` too — and still dereferences an unchecked lookup.
 * Left untouched it falls outside the hunk's context, and whether a run caught
 * it would come down to whether it happened to read the whole file.
 */
const userPy = (bodies: { batch: string; handle: string }): string =>
  `from notifier import notify, notify_batch
from store import lookup


def handle(payload):
${bodies.handle}

def handle_batch(payloads):
${bodies.batch}
`;

/**
 * The history, oldest first. The first commit is the fork point from the base
 * branch; the last is the tip.
 */
export const commitPlan: readonly SeedCommit[] = [
  {
    date: '2026-01-05T08:31:00+00:00',
    key: 'fork',
    subject: 'Extract the widget service client',
    tree: {
      'api/order.py':
        `from payments import charge
from store import lookup


def submit(payload):
    order = lookup(payload["order_id"])
    amount = payload["amount"]
    charge(order.customer_id, amount)
`,
      'db/pool.ts':
        `import { Pool } from 'pg';

const pool = new Pool({ max: 10 });

export async function withConnection<T>(run: (client: unknown) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}
`,
      'src/auth.ts': authTs({
        body: '  return provided === expected;',
        imports: 'createHash',
      }),
      'src/log.ts':
        `export function log(message: string): void {
  console.log('[debug] log()', message);
  process.stdout.write(\`\${message}\\n\`);
}
`,
    },
  },
  {
    date: '2026-01-09T15:20:00+00:00',
    key: 'order',
    subject: 'Add the order charge endpoint',
    tree: {
      'api/routes.ts':
        `export const routes = {
  '/orders': 'api/order.py',
  '/users': 'api/user.py',
};
`,
    },
  },
  {
    date: '2026-02-19T11:48:00+00:00',
    key: 'baseline',
    subject: 'Add batch notification handling',
    tree: {
      'api/user.py': userPy({
        batch:
          `    for p in payloads:
        user = lookup(p["id"])
        notify_batch(user.email)`,
        handle:
          `    user = lookup(payload["id"])
    notify(user.email)
`,
      }),
    },
  },
  {
    date: '2026-03-04T16:02:00+00:00',
    key: 'constant-time',
    subject: 'Compare tokens in constant time',
    tree: {
      'src/auth.ts': authTs({
        body:
          `  const actual = Buffer.from(provided);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);`,
        imports: 'createHash, timingSafeEqual',
      }),
    },
  },
  {
    date: '2026-03-06T09:14:00+00:00',
    key: 'null-guard',
    subject: 'Guard the null user before notifying',
    tree: {
      'api/user.py': userPy({
        // Rewritten, and still dereferencing a lookup that can return None.
        batch:
          `    users = [lookup(p["id"]) for p in payloads]
    notify_batch([u.email for u in users])`,
        handle:
          `    user = lookup(payload["id"])
    if user is not None:
        notify(user.email)
`,
      }),
    },
  },
];

export interface SeedOptions {
  readonly git: string;
  /**
   * Where the bare origin lives, so `git fetch` works without a network.
   */
  readonly origin: string;
  readonly workspace: string;
}

/**
 * Seeds the checkout and its origin, and returns each commit's object name by
 * plan key — what the canned GitHub fixtures are resolved against.
 *
 * `excludeUnplanned` matters here specifically because the workspace is never
 * only the PR: the native runner installs the skills and stages fixtures beside
 * it, and the container runner seeds in /work, where the repo itself —
 * node_modules and all — is mounted.
 */
export const seedRepository = (options: SeedOptions): Record<string, string> =>
  seedHistory({
    author: { email: authorEmail, name: author },
    branch,
    commits: commitPlan,
    excludeUnplanned: true,
    git: options.git,
    /* Not what the commits are attributed to — they carry their own author.
     * This is the identity an agent probes for on startup, and `gh api user`
     * names the same person. */
    localIdentity: user,
    origin: options.origin,
    workspace: options.workspace,
  });
