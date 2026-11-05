/*
 * promptfoo beforeAll/beforeEach extension for this suite.
 *
 * This suite tests the orchestrator in isolation: its dependent skills
 * (gtb-gh-reviewer-followup-plan, gtb-gh-reviewer-followup-apply) are mocked so
 * the run exercises followup's own control flow and merge gate, not the real
 * pipeline. The mock deps live as agent-neutral sources under mock-skills/ —
 * they are NOT pinned to any one agent's on-disk layout.
 *
 * The harness has already installed the real skills into the tree this suite
 * runs against. Each suite gets its own, so this hook simply OVERLAYS the mock
 * deps on top with the same installer — the doubles overwrite the real
 * plan/apply for this suite only, while the genuine followup (the skill under
 * test) is untouched. No drifting copy of followup, no separate install tree;
 * working_dir is the same as every other suite's. The installer's -a flag keeps
 * the layout agent-neutral (it must match the provider); swapping providers is
 * that one flag.
 *
 * It also sets STUB_LOG_DIR (fresh each eval) so the fake gh/git record each
 * run's calls where followup-check.ts reads them. The fakes sit at the front
 * of PATH, put there by the runner, so this suite runs only under the harness.
 */
import path from 'node:path';
import { skillsRoot, suiteDir, suiteRunDir } from '@gtbuchanan/promptfoo-agent/paths';
import { requireHarness, resetRunDir } from '@gtbuchanan/promptfoo-agent/setup';
import { resolveSkillsCli } from '@gtbuchanan/promptfoo-agent/skills-cli';
import spawn from 'cross-spawn';

/**
 * Agent-neutral mock deps (diff + apply).
 */
const mockDepsSrc = path.join(suiteDir(import.meta.url), 'mock-skills');

// The agent target for the installer must match the provider in
// promptfooconfig.yaml. This is the single knob to change when testing a
// different agent.
const agent = 'claude-code';

export const extensionHook = (hookName: string): void => {
  if (hookName !== 'beforeAll') return;

  requireHarness('mock skills');
  resetRunDir(suiteRunDir(import.meta.url));

  // Overlay the mock deps onto the real skills already installed in the
  // runner's workspace, so gtb-gh-reviewer-followup-plan and
  // gtb-gh-reviewer-followup-apply become the doubles. skillsRoot() is that
  // workspace, so the overlay lands where the runner put the skills and never
  // on a real install.
  const res = spawn.sync(
    'node',
    [resolveSkillsCli(), 'add', mockDepsSrc, '-a', agent, '-s', '*', '--copy', '-y'],
    { cwd: skillsRoot(), stdio: 'inherit' },
  );
  if (res.status !== 0) {
    throw new Error(
      `failed to overlay mock skills (exit ${String(res.status ?? 'null')})`,
    );
  }
};
