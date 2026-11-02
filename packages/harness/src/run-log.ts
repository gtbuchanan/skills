/*
 * The checker's end of a run (see run-provider.ts): the log its test's calls
 * were recorded in.
 */
import { runLogPath } from '@gtbuchanan/stub-runtime/run-log';
import * as v from 'valibot';
import { suiteRunDir } from './paths.ts';

const RunMetadataSchema = v.object({ runId: v.string() });

/**
 * The log of the run whose response carried `metadata`, for the suite of the
 * calling file — pass `import.meta.url` and the assertion's
 * `context.metadata`.
 */
export const runLog = (metaUrl: string, metadata: unknown): string => {
  const parsed = v.safeParse(RunMetadataSchema, metadata);
  if (!parsed.success)
    throw new Error(
      'no run id in the response metadata; name the run provider as this ' +
      'suite\'s provider (see run-provider.ts)',
    );
  return runLogPath(suiteRunDir(metaUrl), parsed.output.runId);
};
