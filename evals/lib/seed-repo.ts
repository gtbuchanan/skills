/*
 * Seeding a genuine git repository for a suite to run against.
 *
 * Some skills are best evaluated against real history rather than a stubbed
 * one: `log`, `diff`, `status` and `rev-parse` are then true by construction,
 * and a suite's double only has to record what was asked. That is worth more
 * than it sounds — a stub's fall-through is an answer, and an empty `log` reads
 * as "there is nothing here" rather than "I did not mock this".
 *
 * Reproducibility is the other reason this is shared. Seeding runs git with no
 * sight of the developer's own config ({@link hermeticGitEnv}) and supplies
 * authorship and both timestamps explicitly, so a plan yields the same object
 * names on every run of a given host — which is what lets a suite's canned
 * fixtures reference a seeded commit at all. It is deliberately not a
 * cross-platform guarantee; nothing needs one, because a suite seeds and
 * resolves its fixtures against each other in the same process.
 *
 * Two environmental concerns are opt-in rather than default, because they are
 * properties of where a suite seeds, not of seeding: `origin` (a bare remote,
 * so `fetch`/`push` work with no network) and `excludeUnplanned` (for seeding
 * into a directory that already holds files the plan does not own).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import spawn from 'cross-spawn';
import { hermeticGitEnv } from '#lib/real-git.ts';

/**
 * Where to run git, and which git to run — the real one, resolved past any
 * stub a suite has installed ({@link resolveRealGit}).
 */
export interface GitRunner {
  readonly cwd: string;
  readonly git: string;
}

/**
 * Extra process wiring for one invocation.
 */
export interface GitOptions {
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly input?: string | undefined;
}

/**
 * A finished invocation, whatever its exit status.
 */
export interface GitResult {
  readonly status: number;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * A person git attributes work to.
 */
export interface SeedIdentity {
  readonly email: string;
  readonly name: string;
}

/**
 * One commit in a plan: the files it writes, when it was made, and the key a
 * suite's fixtures refer to it by.
 */
export interface SeedCommit {
  readonly date: string;
  readonly key: string;
  readonly subject: string;
  readonly tree: Readonly<Record<string, string>>;
}

/**
 * Runs git and hands back the outcome without judging it. The primitive the
 * strict wrappers below are built from, and what a caller wants directly for a
 * command whose non-zero exit is an answer rather than a failure —
 * `diff --quiet` reporting a difference, say.
 */
export const probeGit = (
  runner: GitRunner,
  args: readonly string[],
  options?: GitOptions,
): GitResult => {
  const result = spawn.sync(runner.git, [...args], {
    cwd: runner.cwd,
    encoding: 'utf8',
    env: hermeticGitEnv(options?.env),
    ...(options?.input !== undefined && { input: options.input }),
  });

  /* `status` is null when the process could not be spawned at all, which is a
   * failure like any other to every caller here — hence a sentinel rather than
   * a separate case. `resolveRealGit` has already established the binary
   * exists, so this is the unreachable-in-practice branch. */
  return {
    status: result.status ?? -1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

/**
 * The failing command, with everything it said — a seeding failure is
 * otherwise a silent empty repository whose symptoms surface much later.
 */
const failed = (args: readonly string[], result: GitResult): Error =>
  new Error(
    `git ${args.join(' ')} failed (${String(result.status)}): ` +
    `${result.stdout}${result.stderr}`,
  );

/**
 * Runs git for its effect, throwing unless it succeeded.
 */
export const runGit = (
  runner: GitRunner,
  args: readonly string[],
  options?: GitOptions,
): void => {
  const result = probeGit(runner, args, options);
  if (result.status !== 0) throw failed(args, result);
};

/**
 * Runs git for its output, throwing unless it succeeded.
 */
export const captureGit = (
  runner: GitRunner,
  args: readonly string[],
  options?: GitOptions,
): string => {
  const result = probeGit(runner, args, options);
  if (result.status !== 0) throw failed(args, result);

  return result.stdout.trim();
};

/**
 * Resolves a tree key against the repository it belongs to, refusing one that
 * lands outside it.
 *
 * Keys come from a suite's own plan rather than from anything untrusted, so
 * this is not a sandbox — it is a guard against an authoring slip. Git does
 * object to an outside path, but not until `git add`, by which point the file
 * is already written: a run would silently overwrite something beside the tree
 * the runner and the agent both work in. Refusing before the write puts the
 * error where the mistake was made.
 */
const resolveInTree = (cwd: string, relative: string): string => {
  const root = path.resolve(cwd);
  const file = path.resolve(root, ...relative.split('/'));
  if (!file.startsWith(root + path.sep))
    throw new Error(
      `commit tree key "${relative}" resolves outside the workspace ` +
      `(${file}) — a plan may only write inside the repository it seeds.`,
    );

  return file;
};

/**
 * Writes one commit's tree and records it.
 *
 * Authorship and both timestamps come from the environment rather than config,
 * so nothing about the commit depends on what the host happens to hold.
 */
export const writeCommit = (
  runner: GitRunner,
  commit: SeedCommit,
  author: SeedIdentity,
): void => {
  /* Every key is resolved before anything is written, so a plan with one bad
   * key leaves no half-written tree behind. */
  const planned = Object.entries(commit.tree).map(([relative, contents]) => ({
    contents,
    file: resolveInTree(runner.cwd, relative),
  }));
  for (const { contents, file } of planned) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  runGit(runner, ['add', '--', ...Object.keys(commit.tree)]);
  runGit(runner, ['commit', '-q', '-m', commit.subject], {
    env: {
      GIT_AUTHOR_DATE: commit.date,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_AUTHOR_NAME: author.name,
      GIT_COMMITTER_DATE: commit.date,
      GIT_COMMITTER_EMAIL: author.email,
      GIT_COMMITTER_NAME: author.name,
    },
  });
};

/**
 * The top-level entries a plan writes into, in first-appearance order.
 */
const planRoots = (commits: readonly SeedCommit[]): string[] => [
  ...new Set(
    commits.flatMap(commit =>
      Object.keys(commit.tree).map(file => file.split('/', 1)[0] ?? ''),
    ),
  ),
];

/**
 * Ignore everything at the top level except what the plan writes.
 *
 * Stated as an inverse on purpose. A suite seeding into a directory it shares
 * — a runner's workspace holding installed skills and staged fixtures, or a
 * mounted repo with its own node_modules — cannot list what to exclude without
 * encoding one runner's shape and leaving another's tree dirty. What the plan
 * owns is the same on every host.
 */
const excludeFile = (commits: readonly SeedCommit[]): string =>
  ['/*', ...planRoots(commits).map(root => `!/${root}`), ''].join('\n');

/**
 * A history to seed, and the environment to seed it into.
 */
export interface SeedHistoryOptions {
  /**
   * Who authored the commits.
   */
  readonly author: SeedIdentity;
  readonly branch: string;
  /**
   * The history, oldest first.
   */
  readonly commits: readonly SeedCommit[];
  /**
   * Ignore top-level entries the plan does not write. For seeding into a
   * directory that already holds files of its own.
   */
  readonly excludeUnplanned?: boolean | undefined;
  readonly git: string;
  /**
   * The repo-local `user.name` / `user.email`. Not what the commits are
   * attributed to — that is {@link author} — but the identity an agent probes
   * for on startup. With global config disabled a repo-local one is the only
   * place left to read it, and absent one git reports no identity at all,
   * which no real checkout would.
   */
  readonly localIdentity: SeedIdentity;
  /**
   * Where to create a bare remote, so `fetch` and `push` work with no network.
   * Omit for a repository that needs no upstream.
   */
  readonly origin?: string | undefined;
  readonly workspace: string;
}

/**
 * Seeds the checkout (and its origin, when asked) and returns each commit's
 * object name by plan key — what a suite's canned fixtures resolve against.
 */
export const seedHistory = (
  options: SeedHistoryOptions,
): Record<string, string> => {
  const {
    author,
    branch,
    commits,
    excludeUnplanned,
    git,
    localIdentity,
    origin,
    workspace,
  } = options;

  if (origin !== undefined) {
    rmSync(origin, { force: true, recursive: true });
    mkdirSync(origin, { recursive: true });
    runGit({ cwd: origin, git }, ['init', '--bare', '-q']);
  }

  const runner = { cwd: workspace, git };
  mkdirSync(workspace, { recursive: true });
  runGit(runner, ['init', '-q', '-b', branch]);
  if (excludeUnplanned === true) {
    writeFileSync(
      path.join(workspace, '.git', 'info', 'exclude'),
      excludeFile(commits),
    );
  }
  runGit(runner, ['config', 'user.name', localIdentity.name]);
  runGit(runner, ['config', 'user.email', localIdentity.email]);

  for (const commit of commits) writeCommit(runner, commit, author);

  if (origin !== undefined) {
    runGit(runner, ['remote', 'add', 'origin', origin]);
    runGit(runner, ['push', '-q', '--set-upstream', 'origin', branch]);
  }

  const names = captureGit(runner, ['rev-list', '--reverse', branch]).split('\n');
  if (names.length !== commits.length)
    throw new Error(
      `seeded ${String(names.length)} commit(s) for ${String(commits.length)} ` +
      'planned — the seeded history is not the plan',
    );

  return Object.fromEntries(
    commits.map((commit, index) => [commit.key, names[index] ?? '']),
  );
};
