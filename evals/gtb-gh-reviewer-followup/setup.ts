/*
 * promptfoo beforeAll/beforeEach extension for the gtb-gh-reviewer-followup suite.
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
 * diff/apply for this suite only, while the genuine followup (the skill under
 * test) is untouched. No drifting copy of followup, no separate install tree;
 * working_dir is the same as every other suite's. The installer's -a flag keeps
 * the layout agent-neutral (it must match the provider); swapping providers is
 * that one flag.
 *
 * It also sets STUB_LOG (fresh each run) so the fake gh/git record their calls
 * where followup-check.ts reads them. The fakes sit at the front of PATH, put
 * there by the runner, so this suite runs only under the harness.
 */
import path from 'node:path';
import spawn from 'cross-spawn';
import { skillsRoot, suiteCallLog, suiteDir } from '#lib/paths.ts';
import { requireHarness, resetCallLog, truncateCallLog } from '#lib/setup.ts';
import { resolveSkillsCli } from '#lib/skills-cli.ts';

const logPath = suiteCallLog(import.meta.url);
/**
 * Agent-neutral mock deps (diff + apply).
 */
const mockDepsSrc = path.join(suiteDir(import.meta.url), 'mock-skills');

// The agent target for the installer must match the provider in
// promptfooconfig.yaml. This is the single knob to change when testing a
// different agent.
const agent = 'claude-code';

export const extensionHook = (hookName: string): void => {
  // Each test asserts on the ABSENCE of a merge/approve call, so the shared log
  // must be reset between tests — otherwise the happy-path test's merge leaks
  // into the safety test's view. The suite runs serially (maxConcurrency 1), so
  // a per-test truncation is race-free.
  if (hookName === 'beforeEach') {
    truncateCallLog(logPath);
    return;
  }
  if (hookName !== 'beforeAll') return;

  requireHarness('mock skills');
  resetCallLog(logPath);

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
