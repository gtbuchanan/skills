/*
 * The PR the pr-review-diff suite follows up on, as a real repository.
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
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import spawn from 'cross-spawn';
import { author, authorEmail, branch, user } from './scenario.ts';
import { hermeticGitEnv } from '#lib/real-git.ts';

/**
 * One commit: the files it writes, and when the author made it.
 */
export interface SeedCommit {
  readonly date: string;
  readonly key: string;
  readonly subject: string;
  readonly tree: Readonly<Record<string, string>>;
}

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

interface Runner {
  readonly cwd: string;
  readonly git: string;
}

const run = ({ cwd, git }: Runner, args: readonly string[], env?: NodeJS.ProcessEnv): void => {
  const result = spawn.sync(git, args, {
    cwd,
    encoding: 'utf8',
    env: hermeticGitEnv(env),
  });
  if (result.status !== 0)
    throw new Error(
      `git ${args.join(' ')} failed (${String(result.status)}): ` +
      `${result.stdout}${result.stderr}`,
    );
};

const capture = ({ cwd, git }: Runner, args: readonly string[]): string => {
  const result = spawn.sync(git, args, {
    cwd,
    encoding: 'utf8',
    env: hermeticGitEnv(),
  });
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')} failed (${String(result.status)})`);

  return result.stdout.trim();
};

const writeCommit = (runner: Runner, commit: SeedCommit): void => {
  for (const [relative, contents] of Object.entries(commit.tree)) {
    const file = path.join(runner.cwd, ...relative.split('/'));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  run(runner, ['add', '--', ...Object.keys(commit.tree)]);
  /* Authorship and its timestamps come from the environment, so nothing about
   * the commit depends on config the host might hold. */
  run(runner, ['commit', '-q', '-m', commit.subject], {
    GIT_AUTHOR_DATE: commit.date,
    GIT_AUTHOR_EMAIL: authorEmail,
    GIT_AUTHOR_NAME: author,
    GIT_COMMITTER_DATE: commit.date,
    GIT_COMMITTER_EMAIL: authorEmail,
    GIT_COMMITTER_NAME: author,
  });
};

export interface SeedOptions {
  readonly git: string;
  /**
   * Where the bare origin lives, so `git fetch` works without a network.
   */
  readonly origin: string;
  readonly workspace: string;
}

/**
 * The top-level entries the PR owns, derived from the plan.
 */
const prRoots = [
  ...new Set(
    commitPlan.flatMap(commit =>
      Object.keys(commit.tree).map(file => file.split('/', 1)[0] ?? ''),
    ),
  ),
];

/**
 * Ignore everything at the root except what the plan writes.
 *
 * The workspace is never only the PR: the native runner installs the skills
 * and stages fixtures beside it, and the container runner seeds in /work,
 * where the repo itself — node_modules and all — is mounted. Listing what to
 * exclude would encode one runner's shape and quietly leave the other's tree
 * dirty, so this states the inverse, which is the same on any host.
 */
const excludeFile = (): string =>
  ['/*', ...prRoots.map(root => `!/${root}`), ''].join('\n');

/**
 * Seeds the checkout and its origin, and returns each commit's object name by
 * plan key — what the canned GitHub fixtures are resolved against.
 */
export const seedRepository = (options: SeedOptions): Record<string, string> => {
  const { git, origin, workspace } = options;
  rmSync(origin, { force: true, recursive: true });
  mkdirSync(origin, { recursive: true });
  run({ cwd: origin, git }, ['init', '--bare', '-q']);

  const runner = { cwd: workspace, git };
  mkdirSync(workspace, { recursive: true });
  run(runner, ['init', '-q', '-b', branch]);
  writeFileSync(path.join(workspace, '.git', 'info', 'exclude'), excludeFile());
  /* Not for committing — the commits carry their own author in the
   * environment. This is the identity an agent probes for on startup, and with
   * global config disabled a repo-local one is the only place left to read it.
   * Absent, git reports no identity at all, which no real checkout would while
   * `gh api user` names the same person. */
  run(runner, ['config', 'user.name', user.name]);
  run(runner, ['config', 'user.email', user.email]);

  for (const commit of commitPlan) writeCommit(runner, commit);

  run(runner, ['remote', 'add', 'origin', origin]);
  run(runner, ['push', '-q', '--set-upstream', 'origin', branch]);

  const names = capture(runner, ['rev-list', '--reverse', branch]).split('\n');
  if (names.length !== commitPlan.length)
    throw new Error(
      `seeded ${String(names.length)} commit(s) for ` +
      `${String(commitPlan.length)} planned — the repository is not the PR`,
    );

  return Object.fromEntries(
    commitPlan.map((commit, index) => [commit.key, names[index] ?? '']),
  );
};
