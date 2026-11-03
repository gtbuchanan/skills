import type { Keyed } from '@gtbuchanan/stub-runtime/scenario';

/**
 * One scenario per action-list fixture, keyed by its directory name.
 *
 * The workspace a call is made from is the only thing that says which test
 * made it: an unmodelled call such as `gh pr view 42` names no fixture's ids.
 */
export const scenarios: readonly Keyed[] = [
  { key: 'ack' },
  { key: 'edited-reply' },
  { key: 'error' },
  { key: 'mixed' },
  { key: 'reopen' },
  { key: 'skip' },
];
