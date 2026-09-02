/*
 * promptfoo beforeAll extension for the gtb-gh-reviewer-followup-apply suite. Its only job is to
 * set STUB_LOG (and start each run with a fresh log) so the fake gh records its
 * calls where apply-check.ts reads them.
 *
 * The fake gh itself is installed into STUB_BINDIR, at the front of PATH, by the
 * runner — so this suite runs only under the harness, where interception is
 * deterministic and the real gh is unreachable.
 */
import { suiteCallLog } from '#lib/paths.ts';
import { resetCallLog } from '#lib/setup.ts';

export const extensionHook = (hookName: string): void => {
  if (hookName !== 'beforeAll') return;
  resetCallLog(suiteCallLog(import.meta.url));
};
