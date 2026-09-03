/*
 * This repo's isolation policy, and the primitives bound to it.
 *
 * scrubbed-path.ts is deliberately policy-free — it knows how to narrow a PATH,
 * not which tools matter — so the lists live here, where the skills that need
 * them do.
 *
 * The policy is repo-wide rather than per-suite because the two lists fail in
 * opposite directions. `dangerTools` is the set that must never be reachable,
 * so under-declaring costs protection: the fixture-only suites stub nothing and
 * would run with the real CLIs live if they declared only what they mock. Any
 * suite can shell out to anything, so this is a property of the repo's threat
 * model. `neededTools` is what the harness and the agent's shell need to
 * function, which does not vary by suite — `git` is in it *and* stubbed by two
 * suites, since a suite's double sits ahead of it on PATH rather than replacing
 * it.
 *
 * A suite that needs more shadowed than this should extend the policy rather
 * than replace it; {@link createIsolation} binds per call, so a runner can mint
 * one isolation per suite from `evalPolicy` plus that suite's additions.
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
   * The agent's shell is Git Bash, which needs the coreutils alongside it;
   * corepack backs pnpm, and the harness drives pnpm and git directly.
   */
  neededTools: [
    'bash', 'cat', 'corepack', 'env', 'git', 'ls', 'node', 'pnpm', 'sh',
  ],
  shadowHint: 'stub it in evals/<suite>/bin/',
};

/**
 * The primitives bound to {@link evalPolicy}, for consumers needing no additions.
 */
export const evalIsolation = createIsolation(evalPolicy);
