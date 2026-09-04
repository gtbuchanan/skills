/*
 * The worlds this suite states, and the trees they are seeded from.
 *
 * Both scenarios hand the agent uncommitted work and the same instruction. What
 * differs is how many units the work actually is, which is the whole question
 * the skill answers — so the pair has to be read together. A suite with only
 * the splitting case passes for an agent that splits everything, and one that
 * splits a single idea in half has invented a boundary rather than found one.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */

/**
 * A file the seed writes, or the agent is expected to change.
 */
export type Tree = Readonly<Record<string, string>>;

export interface Scenario {
  readonly branch: string;
  /**
   * What the repository holds once the baseline is committed and pushed.
   */
  readonly committed: Tree;
  readonly key: string;
  /**
   * How many pull requests the work is, stated as a range so a scenario can
   * say "exactly one" or "at least two" without the checker guessing.
   */
  readonly maxPullRequests: number;
  readonly minPullRequests: number;
  /**
   * What the agent finds uncommitted in the working tree.
   */
  readonly uncommitted: Tree;
}

const cacheBefore = `export const cacheKey = (request: Request): string => request.url;
`;

const cacheAfter = `export const cacheKey = (request: Request): string =>
  \`\${request.method} \${request.url}\`;
`;

const retryBefore = `export const backoff = (): number => 1000;
`;

const retryAfter = `export const backoff = (attempt: number): number =>
  Math.min(1000 * 2 ** attempt, 30_000);
`;

const archiveBefore = `export const archive = (id: string): void => {
  store.remove(id);
};
`;

const archiveAfter = `export const archive = (id: string, actor: Actor): void => {
  if (!actor.isAdmin) throw new Error('only an admin may archive');
  store.remove(id);
};
`;

const archiveTestBefore = `it('removes the record', () => {
  expect(archive('r-1')).toBeUndefined();
});
`;

const archiveTestAfter = `it('removes the record for an admin', () => {
  expect(archive('r-1', admin)).toBeUndefined();
});

it('refuses a non-admin', () => {
  expect(() => archive('r-1', member)).toThrow(/only an admin/v);
});
`;

export const scenarios: readonly Scenario[] = [
  /*
   * Two unrelated fixes in one tree. Nothing orders them and neither needs the
   * other, so they are two units from the trunk and two pull requests. An
   * agent that ships them together has bundled two decisions into one
   * approval — and under a squash merge, into one commit.
   */
  {
    branch: 'main',
    committed: { 'src/cache.ts': cacheBefore, 'src/retry.ts': retryBefore },
    key: 'two-units',
    maxPullRequests: 3,
    minPullRequests: 2,
    uncommitted: { 'src/cache.ts': cacheAfter, 'src/retry.ts': retryAfter },
  },
  /*
   * One idea across two files: the permission and the tests that cover it.
   * Splitting them lands a state where archiving is either unguarded or
   * untested, so this is one unit however many files it touches — the case
   * that fails an agent which has learned to split on sight.
   */
  {
    branch: 'main',
    committed: {
      'src/archive.ts': archiveBefore,
      'test/archive.test.ts': archiveTestBefore,
    },
    key: 'one-unit',
    maxPullRequests: 1,
    minPullRequests: 1,
    uncommitted: {
      'src/archive.ts': archiveAfter,
      'test/archive.test.ts': archiveTestAfter,
    },
  },
];

export const scenarioByKey = (key: string): Scenario => {
  const found = scenarios.find(scenario => scenario.key === key);
  if (found === undefined)
    throw new Error(`no scenario named "${key}" in this suite`);

  return found;
};
