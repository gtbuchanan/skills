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

// Three superseded runs, newest first; only their distinctness matters.
const olderRunCount = 3;
const olderRunBaseId = 900_100;
const olderRunIds = Array.from(
  { length: olderRunCount },
  (_unused, index) => olderRunBaseId + olderRunCount - index,
);

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
  organization: 'https://dev.azure.com/example-org',
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

const latestRunId = 900_999;

process.stdout.write(`Latest run: 2026.5.99 (id ${String(latestRunId)})\n`);
process.stdout.write(`Older runs:  ${olderRunIds.join(', ')}\n`);

const approvals = opts.approveLatest ? 1 : 0;
const summary =
  `${String(olderRunIds.length)} reject, ${String(approvals)} approve ` +
  `(pipeline ${String(opts.pipelineId)}, ${opts.branch})`;
if (opts.whatIf) {
  process.stdout.write(`What if: ${summary}\n`);
  process.exit(0);
}

for (const index of olderRunIds.keys()) {
  process.stdout.write(`  stub-approval-${String(index)}  rejected\n`);
}
if (opts.approveLatest) {
  process.stdout.write('  stub-approval-latest  approved\n');
}
process.exit(0);
