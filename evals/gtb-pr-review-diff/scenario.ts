/*
 * The GitHub side of the world the gtb-pr-review-diff suite runs against, and the
 * identities both sides share.
 *
 * The git side is a real repository (seed.ts), so the only facts that still
 * have to be stated are the ones GitHub owns: who the viewer is, what the
 * repository is called, and which commit each review was submitted against.
 * That last one cannot be written down — seeding decides it — so the reviews
 * fixture names commits by plan key and {@link resolveShas} fills in the
 * object names the seed produced.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';

/**
 * The branch the PR is checked out on — what `gh pr checkout 42` would leave.
 */
export const branch = 'pr-42';

/**
 * The repository `gh repo view` reports, and the origin git pushes to.
 */
export const repo = 'acme/widgets';

/**
 * The authenticated user: the reviewer following up on their own review.
 */
export const viewer = 'reviewer';

/**
 * The same reviewer, as the identity `git config` reports — a client probes
 * for it before any work starts.
 */
export const user = { email: `${viewer}@example.com`, name: viewer };

/**
 * The PR's author, who wrote every commit in the seeded history.
 */
export const author = 'author';

export const authorEmail = `${author}@example.com`;

const UserSchema = v.looseObject({ login: v.optional(v.string()) });

/**
 * The subset of a GitHub review this suite reasons about.
 */
export const ReviewSchema = v.looseObject({
  commit_id: v.optional(v.string()),
  state: v.optional(v.string()),
  submitted_at: v.optional(v.string()),
  user: v.optional(UserSchema),
});

const ReviewListSchema = v.array(ReviewSchema);

/**
 * The viewer's latest SUBMITTED review — the baseline the follow-up is scoped
 * to. This is what the skill's `--jq` selects, and jq does not run in the stub.
 */
export const selectLastOwnReview = (
  reviews: readonly v.InferOutput<typeof ReviewSchema>[],
  login: string,
): v.InferOutput<typeof ReviewSchema> | undefined =>
  reviews
    .filter(review => review.user?.login === login && review.submitted_at)
    .toSorted((left, right) =>
      (left.submitted_at ?? '').localeCompare(right.submitted_at ?? ''),
    )
    .at(-1);

const shaPlaceholder = /\{\{\s*sha:(?<key>[\w\-]+)\s*\}\}/gv;

/**
 * Replaces every `{{ sha:<key> }}` with the object name seeding gave that
 * commit. An unknown key throws rather than resolving to nothing: a baseline
 * that silently became empty would surface much later, as a skill that failed
 * to scope its diff.
 */
export const resolveShas = (
  template: string,
  shas: Readonly<Record<string, string>>,
): string =>
  template.replaceAll(shaPlaceholder, (_match: string, key: string) => {
    const sha = shas[key];
    if (sha === undefined)
      throw new Error(
        `fixture names commit '${key}', which the seed plan does not build`,
      );

    return sha;
  });

/**
 * Reads an unresolved fixture template from the suite's fixtures.
 */
export const readTemplate = (dir: string, name: string): string =>
  readFileSync(path.join(dir, name), 'utf8');

/**
 * Reads the resolved reviews from a scenario directory.
 */
export const readReviews = (
  dir: string,
): v.InferOutput<typeof ReviewSchema>[] => {
  const raw = readFileSync(path.join(dir, 'reviews.json'), 'utf8');

  return v.parse(ReviewListSchema, JSON.parse(raw));
};

/**
 * The scenario directory the suite resolved its fixtures into. Set by setup.ts
 * once the seed has decided what the object names are.
 */
export const scenarioDir = (): string => process.env['SCENARIO_DIR'] ?? '.';
