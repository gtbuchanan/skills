/*
 * Reading what a suite asks of the runner from its own eval config.
 *
 * `evals/<suite>/eval.config.ts` is the one module the runner imports on a
 * suite's behalf. Nothing is discovered from what a suite depends on, so
 * whatever runs there runs because the suite named it, in code reviewed like
 * the rest of the suite.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EnvContributor } from '@gtbuchanan/promptfoo-agent/suite-config';
import * as v from 'valibot';

const ContributorSchema = v.object({
  env: v.function(),
  reads: v.array(v.string()),
});

const SuiteConfigSchema = v.object({ env: v.optional(v.array(ContributorSchema), []) });

const ModuleSchema = v.object({ default: SuiteConfigSchema });

const ContributedEnvSchema = v.record(v.string(), v.string());

/**
 * What the runner takes from a suite's eval config.
 */
export interface LoadedSuiteConfig {
  readonly env: readonly EnvContributor[];
}

/**
 * Suite `name`'s eval config under the repository at `root`, or an empty one
 * for a suite that has none. Throws, naming the file, for one whose default
 * export is not a suite config.
 */
export const loadSuiteConfig = async (root: string, name: string): Promise<LoadedSuiteConfig> => {
  const file = path.join(root, 'evals', name, 'eval.config.ts');
  if (!existsSync(file)) return { env: [] };

  const parsed = v.safeParse(ModuleSchema, await import(pathToFileURL(file).href));
  if (!parsed.success)
    throw new Error(`${file} does not export a suite config: ${v.summarize(parsed.issues)}`);

  return {
    env: parsed.output.default.env.map(contributor => ({
      // What a contributor returns is checked, since nothing typed it at runtime.
      env: context => v.parse(ContributedEnvSchema, contributor.env(context)),
      reads: contributor.reads,
    })),
  };
};
