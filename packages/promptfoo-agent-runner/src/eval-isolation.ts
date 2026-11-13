/*
 * The runner's isolation policy, and the primitives bound to it.
 *
 * scrubbed-path.ts is deliberately policy-free — it knows how to narrow a PATH,
 * not which tools matter — so the lists live here, beside the runner that
 * needs them.
 *
 * The policy is repo-wide rather than per-suite because the two lists fail in
 * opposite directions. `dangerTools` is the set that must never be reachable,
 * so under-declaring costs protection: the fixture-only suites stub nothing and
 * would run with the real CLIs live if they declared only what they mock.
 * `neededTools` is what the runner itself needs, which does not vary by suite.
 *
 * A suite that needs more should extend the policy rather than replace it;
 * {@link createIsolation} binds per call, so a runner can mint one isolation
 * per suite from `evalPolicy` plus that suite's additions.
 */
import { type IsolationPolicy, createIsolation } from './scrubbed-path.ts';

export const evalPolicy: IsolationPolicy = {
  /*
   * The skills reach for GitHub and Azure DevOps, and the azp skill's action is
   * a bundled PowerShell script. Those are exactly what a suite must never
   * touch for real, so they are the ones to shadow.
   */
  dangerTools: ['az', 'gh', 'powershell', 'pwsh'],
  /*
   * The runner spawns node, pnpm and git itself, and runs bash for the
   * fail-safe probe and as every agent's shell; on Windows that is Git Bash,
   * which needs the coreutils beside it. `git` is here *and* stubbed by suites
   * that record it, since a suite's double sits ahead of it on PATH rather
   * than replacing it.
   */
  neededTools: ['bash', 'cat', 'env', 'git', 'ls', 'node', 'pnpm', 'sh'],
};

/**
 * The primitives bound to {@link evalPolicy}, for consumers needing no additions.
 */
export const evalIsolation = createIsolation(evalPolicy);
