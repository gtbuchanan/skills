/*
 * The scenarios, by key. Each names a workspace; what the instance holds is
 * `world.ts`, shared by all of them. They differ only in whether gt already
 * has a login for it: the login scenario starts without one, since setting one
 * up is what it asks for.
 */
import type { Keyed } from '@gtbuchanan/cli-doubles/scenario';

export interface Scenario extends Keyed {
  readonly hasLogin: boolean;
}

export const scenarios: readonly Scenario[] = [
  { hasLogin: false, key: 'login-agent' },
  { hasLogin: true, key: 'reply-thread' },
  { hasLogin: true, key: 'run-logs' },
];
