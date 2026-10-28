/*
 * The scenarios, by key. Each names a workspace and a call log; what the
 * instance holds is `world.ts`, shared by all of them. They differ only in
 * whether tea already has a login for it: the login scenario starts without
 * one, since setting one up is what it asks for.
 */
import type { Keyed } from '@gtbuchanan/stub-runtime/scenario';

export interface Scenario extends Keyed {
  readonly hasLogin: boolean;
}

export const scenarios: readonly Scenario[] = [
  { hasLogin: true, key: 'check-status' },
  { hasLogin: false, key: 'login-oauth' },
  { hasLogin: true, key: 'reply-thread' },
];
