import { configure } from '@gtbuchanan/vitest-config/configure';
import { defineConfig, mergeConfig } from 'vitest/config';

// The root run covers the source the root still carries — `scripts/` and
// `test/`. Workspace packages are excluded because each runs its own suite:
// without this their tests execute twice, and the root task's inputs exclude
// them while it actually runs them — so turbo could report a cache hit for a
// run whose real subject had changed.
//
// Merged rather than spread so the shared config's own excludes are kept and
// this one is appended, instead of guessing at what they are.
//
// Temporary. Once the runners are a package the root carries no tests at all,
// and this file goes with the root's vitest task.
export default mergeConfig(
  defineConfig(configure()),
  defineConfig({ test: { exclude: ['evals/**', 'packages/**'] } }),
);
