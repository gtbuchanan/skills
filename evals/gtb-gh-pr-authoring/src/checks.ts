/*
 * Which checks a scenario has.
 *
 * What a check record looks like is `@gtbuchanan/github-cli-stub/checks`, since
 * that is gh's shape rather than this suite's. What is left here is the one
 * question only a scenario can answer: which checks exist in the world it
 * states.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import type { CheckEntry } from '@gtbuchanan/github-cli-stub/checks';
import type { Scenario } from './shapes.ts';

/**
 * The check list the scenario states, or the single CI check every other
 * scenario has always been served.
 */
export const checksFor = (scenario: Scenario): readonly CheckEntry[] =>
  scenario.checks ?? [
    {
      bucket: scenario.checksPending === true ? 'pending' : 'pass',
      description: '',
      name: 'build',
      workflow: 'CI',
    },
  ];
