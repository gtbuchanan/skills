/*
 * A stand-in suite for testing the parts of the harness that key off one.
 *
 * `suiteName` and `suiteRunDir` walk up for a promptfoo config and take the
 * containing directory's name, so a directory is a suite by having that file.
 * A test file here is not one — nothing above `packages/harness/test` has a
 * config — which is why passing its own `import.meta.url` fails rather than
 * quietly naming the wrong suite.
 *
 * The module the URL points at never has to exist: only its path is read.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * A throwaway suite directory, and a module URL inside it to pass as `metaUrl`.
 */
export const fakeSuite = (): { readonly metaUrl: string } => {
  const root = mkdtempSync(path.join(tmpdir(), 'suite-'));
  writeFileSync(path.join(root, 'promptfooconfig.yaml'), 'tests: []\n');

  return { metaUrl: pathToFileURL(path.join(root, 'src', 'check.ts')).href };
};
