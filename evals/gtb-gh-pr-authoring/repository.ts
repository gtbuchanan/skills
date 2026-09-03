/*
 * The repository every scenario in this suite runs in, and the account it
 * runs as.
 *
 * The same for all of them, which is why it is here rather than in
 * scenarios.ts: that file is a list of situations, and these are the facts the
 * situations are told against. Both stubs and the seeder read them too, so a
 * scenario cannot describe a PR in one repository while the double answers for
 * another.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import type { SeedIdentity } from '@gtbuchanan/agent-skills-harness/seed-repo';

/**
 * The authenticated account — what `gh api user` reports, and the identity the
 * commits carry. The two are deliberately the same person: the skill's rule
 * against replying to your own review threads only has teeth when the account
 * posting is the account that left them.
 */
export const viewer = 'taylor';

export const author: SeedIdentity = {
  email: 'taylor@example.com',
  name: 'Taylor Buchanan',
};

/**
 * The repository `gh repo view` reports.
 */
export const repoSlug = 'acme/widgets';

/**
 * The default branch every PR here targets.
 */
export const baseBranch = 'main';
