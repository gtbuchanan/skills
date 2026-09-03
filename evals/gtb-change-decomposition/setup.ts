/*
 * promptfoo beforeAll extension for the gtb-change-decomposition suite.
 *
 * Every scenario tree is written once per run, not once per test, and that is
 * what lets the suite run concurrently. The agent is asked to plan rather than
 * to implement, and it is handed no tool that could write — Glob, Grep and a
 * read-only Read over `scenarios/**` — so no test can alter the tree another
 * test is reading, and there is nothing to restore between them.
 *
 * That also makes `--repeat` runs independent for free: the suites that need
 * per-test truncation need it because they assert over an append-only call log,
 * and this one has no log. What it asserts over is the plan the agent returned.
 *
 * Trees are removed and rewritten rather than overwritten in place, so a file
 * left behind by an earlier run — a scenario key that has since been renamed,
 * a tree that used to have a fourth file — cannot masquerade as part of the
 * project a scenario means to present.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scenarioPath, scenarios } from './trees.ts';
import { skillsRoot } from '@gtbuchanan/agent-skills-harness/paths';
import { requireHarness } from '@gtbuchanan/agent-skills-harness/setup';

const seedAll = (): void => {
  const root = skillsRoot();

  for (const scenario of scenarios) {
    const workspace = path.join(root, ...scenarioPath(scenario.key).split('/'));
    rmSync(workspace, { force: true, recursive: true });

    for (const [relative, contents] of Object.entries(scenario.tree)) {
      const file = path.join(workspace, ...relative.split('/'));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, contents);
    }
  }
};

export const extensionHook = (hookName: string): void => {
  if (hookName !== 'beforeAll') return;

  /* Seeding writes trees into the runner's workspace. Outside the harness there
   * is no workspace to write into — skillsRoot() throws rather than guess — and
   * this keeps the failure explicit either way. */
  requireHarness('scenario trees');
  seedAll();
};
