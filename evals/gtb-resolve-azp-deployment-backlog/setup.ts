/*
 * promptfoo extension for the gtb-resolve-azp-deployment-backlog suite.
 *
 * The skill's action is a bundled PowerShell script that mints an Azure DevOps
 * token and PATCHes approval records — both impossible (the harness admits no
 * PowerShell) and unsafe (real ADO mutation) under eval. So this OVERLAYS a Node
 * stand-in (bin/script-stub.cjs) onto the synced skill copy's
 * scripts/resolve-azp-deployment-backlog.ps1 with an executable node shebang, so
 * the agent's natural `./scripts/…ps1` invocation runs the double instead. The
 * runner also installs a fake `az` (bin/az-stub.ts) on PATH for name→id
 * resolution.
 *
 * The doubles log to $STUB_LOG_DIR, one file per pipeline id
 * (script-<PipelineId>.jsonl). Every test uses a distinct id, so the files never
 * collide — there is no shared log to truncate and no per-test env, which is why
 * the suite runs in parallel. This hook only has to set up once (beforeAll).
 *
 * Like the gtb-gh-reviewer-followup overlay, this mutates .claude/skills, so it is
 * guarded to the harness's ephemeral per-suite context — STUB_BINDIR, set by
 * whichever runner is driving — and never touches a hand-run tree.
 */
import fs from 'node:fs';
import path from 'node:path';
import { skillsRoot, suiteDir, suiteName, suiteRunDir } from '#lib/paths.ts';
import { requireHarness, resetRunDir } from '#lib/setup.ts';

/**
 * rwxr-xr-x — the agent invokes the overlaid script directly.
 */
const overlayMode = 0o755;

const skillName = suiteName(import.meta.url);
const stubSrc = path.join(suiteDir(import.meta.url), 'bin', 'script-stub.cjs');

/*
 * The skill copies in the runner's workspace; overlay whichever exist. The real
 * script under skills/ (the cross-agent source of truth) is left untouched.
 *
 * Resolved inside the hook rather than at import: skillsRoot() refuses to guess
 * a workspace, and a refusal at import time would fail before the hook that
 * needs it even runs.
 */
const overlayTargets = (): string[] =>
  ['.claude', '.agents'].map(agentDir =>
    path.join(
      skillsRoot(),
      agentDir,
      'skills',
      skillName,
      'scripts',
      `${skillName}.ps1`,
    ),
  );

export const extensionHook = (hookName: string): void => {
  if (hookName !== 'beforeAll') return;

  requireHarness('a script stub');
  // Fresh per-pipeline call logs each run; the stubs point here via STUB_LOG_DIR.
  resetRunDir(suiteRunDir(import.meta.url));

  const shebang = '#!/usr/bin/env node\n';
  const body = fs.readFileSync(stubSrc, 'utf8').replace(/^#![^\n]*\n/v, '');
  let overlaid = 0;
  for (const target of overlayTargets()) {
    if (!fs.existsSync(path.dirname(target))) continue;
    fs.writeFileSync(target, shebang + body);
    fs.chmodSync(target, overlayMode);
    overlaid += 1;
  }
  if (overlaid === 0) {
    throw new Error(
      'no synced skill copy found to overlay; did `skills:sync` run?',
    );
  }
};
