/*
 * Resolves the `skills` CLI's bin entry. The runners install a suite's skills by
 * invoking it directly with node — `pnpm exec` would try to `install` from a
 * manifest-only workspace — and a suite's setup overlays its mock deps the same
 * way, so both share this one resolver.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Absolute path to the skills CLI entry (bin/cli.mjs).
 */
export const resolveSkillsCli = (): string => {
  const require = createRequire(import.meta.url);
  return path.join(
    path.dirname(require.resolve('skills/package.json')),
    'bin',
    'cli.mjs',
  );
};
