// @ts-check
/*
 * Node stand-in for scripts/resolve-azp-deployment-backlog.ps1. setup.ts
 * overlays this onto the synced skill copy (with an executable node shebang) so
 * the suite runs Node-only under the harness — no PowerShell is reachable, and
 * no Azure DevOps. It mimics the real script's PowerShell-style parameters
 * and console shape, and records each invocation to a per-pipeline log file so
 * the suite can run its tests in parallel: $STUB_LOG_DIR/script-<PipelineId>.jsonl.
 * Because every test uses a distinct pipeline id, those files never collide, so
 * no shared log to truncate and no per-test env — the tests are independent.
 *
 * The authFailPipelineId sentinel reproduces the first-run AADSTS500011 consent
 * error (in place of a per-test env var) so the auth-guidance behavior can be
 * exercised without serializing the suite. It NEVER touches the network.
 *
 * Written in CommonJS on purpose: overlaid as a .ps1, it is run via
 * `node <file>.ps1`, and Node treats an unknown extension as CommonJS.
 */
const { appendFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');

/**
 * `process.argv` leads with the node binary and this script.
 */
const cliArgsIndex = 2;

/*
 * A dry-run against this fictional pipeline id stands in for the tenant that has
 * not yet consented to the Azure DevOps AAD app — see the auth-fail branch below.
 */
const authFailPipelineId = 900_911;

/*
 * Three superseded runs, newest first. Each carries a run name (build number)
 * alongside its build id, and the two are unrelated — a report quoting the name
 * cannot have been reconstructed from the id, which is what lets the checker's
 * "did it use the visible name?" assertion actually fail.
 */
const olderRunCount = 3;
const olderRunBaseId = 900_100;
const olderRunBaseNumber = 95;
const olderRuns = Array.from({ length: olderRunCount }, (_unused, index) => ({
  buildNumber: `2026.5.${String(olderRunBaseNumber + olderRunCount - index)}`,
  id: olderRunBaseId + olderRunCount - index,
}));

/*
 * Names for the fictional pipelines the eval prompts reference — the real
 * script reads these off each run's definition, so the double must too.
 * Mirrors the catalog in bin/az-stub.ts, which this file cannot import (it is
 * overlaid standalone); keep the two in sync. 900003 is named here but
 * deliberately absent from that catalog: its test supplies the id directly, and
 * leaving it unresolvable by name keeps that case honest.
 */
const pipelines = [
  { id: 900_001, name: 'web-frontend' },
  { id: 900_002, name: 'api-service' },
  { id: 900_003, name: 'payments-api' },
];

const argv = process.argv.slice(cliArgsIndex);

/**
 * Reads one PowerShell-style argument. `consumed` says how many extra argv
 * entries the flag swallowed, so the caller can skip a flag's value.
 * @param {string} flag lower-cased, with any `:value` suffix stripped
 * @param {string} value the next argv entry
 * @returns {{ consumed: number, patch: Record<string, string | number | boolean> }}
 */
const parseFlag = (flag, value) => {
  switch (flag) {
    case '-approvelatest': {
      return { consumed: 0, patch: { approveLatest: true } };
    }
    case '-branch': {
      return { consumed: 1, patch: { branch: value } };
    }
    case '-organization': {
      return { consumed: 1, patch: { organization: value } };
    }
    case '-pipelineid': {
      return { consumed: 1, patch: { pipelineId: Number(value) } };
    }
    case '-project': {
      return { consumed: 1, patch: { project: value } };
    }
    case '-whatif': {
      return { consumed: 0, patch: { whatIf: true } };
    }
    default: {
      return { consumed: 0, patch: {} }; // -confirm and friends are no-ops
    }
  }
};

/*
 * Parse the PowerShell-style args the skill passes: `-PipelineId 900001`,
 * `-Branch main`, switches like `-WhatIf` / `-ApproveLatest`, and the
 * `-Confirm:$false` colon form (the suffix is stripped before matching).
 */
const opts = {
  approveLatest: false,
  branch: 'main',
  // The organization NAME, as the real script now takes it.
  organization: 'example-org',
  pipelineId: NaN,
  project: 'default-project',
  whatIf: false,
};
for (let index = 0; index < argv.length; index += 1) {
  const flag = (argv[index] ?? '').replace(/:.*$/v, '').toLowerCase();
  const { consumed, patch } = parseFlag(flag, argv[index + 1] ?? '');
  Object.assign(opts, patch);
  index += consumed;
}

const logDir = process.env['STUB_LOG_DIR'];
if (logDir) {
  try {
    mkdirSync(logDir, { recursive: true });
    const id = Number.isNaN(opts.pipelineId)
      ? 'unknown'
      : String(opts.pipelineId);
    appendFileSync(
      path.join(logDir, `script-${id}.jsonl`),
      `${JSON.stringify({ cmd: 'script', ...opts })}\n`,
    );
  } catch {
    // logging is best-effort; never fail the call because of it
  }
}

/*
 * First-run consent failure: the real script mints its token via
 * `az account get-access-token`, which fails with AADSTS500011 until the tenant
 * consents to the Azure DevOps AAD app. Reproduce it so the agent must surface
 * the one-time `az login --scope …` fix rather than retrying blindly.
 */
if (opts.pipelineId === authFailPipelineId) {
  process.stderr.write(
    'az account get-access-token failed: AADSTS500011: The resource principal named ' +
    '499b84ac-1321-427f-aa17-267ca6975798 was not found in the tenant.\n',
  );
  process.exit(1);
}

const latestRun = { buildNumber: '2026.5.99', id: 900_999 };

/**
 * Mirrors the real script's Format-Run: run name first, build id second.
 * @param {{ buildNumber: string, id: number }} run
 * @returns {string}
 */
const formatRun = run => `${run.buildNumber} (build ${String(run.id)})`;

const pipelineName =
  pipelines.find(entry => entry.id === opts.pipelineId)?.name ??
  `pipeline-${String(opts.pipelineId)}`;

/*
 * Same console shape as the real script, because the agent's report is written
 * from whatever it reads here: pipeline name, then each run by its name with
 * the id trailing, then the portal link.
 */
process.stdout.write(
  `Pipeline: ${pipelineName} (definition ${String(opts.pipelineId)})\n`,
);
process.stdout.write(`Branch:   ${opts.branch}\n\n`);
process.stdout.write(`Latest in-progress run: ${formatRun(latestRun)}\n`);
process.stdout.write(
  `  https://dev.azure.com/${opts.organization}/${opts.project}` +
  `/_build/results?buildId=${String(latestRun.id)}\n\n`,
);
process.stdout.write(
  `Superseded in-progress runs (${String(olderRuns.length)}):\n`,
);
for (const run of olderRuns) {
  process.stdout.write(`  ${formatRun(run)}\n`);
}

const approvals = opts.approveLatest ? 1 : 0;
const summary =
  `${String(olderRuns.length)} reject, ${String(approvals)} approve ` +
  `(${pipelineName}, ${opts.branch})`;
if (opts.whatIf) {
  process.stdout.write(`\nWhat if: ${summary}\n`);
  process.exit(0);
}

process.stdout.write('\nApproval results:\n');
for (const run of olderRuns) {
  process.stdout.write(`  rejected  ${formatRun(run)}\n`);
}
if (opts.approveLatest) {
  process.stdout.write(`  approved  ${formatRun(latestRun)}\n`);
}
process.exit(0);
