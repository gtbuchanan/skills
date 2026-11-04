/*
 * Spike driver: runs the merging suite's hooks as promptfoo would, then the
 * commands the merging skill reaches for, through the suite's gh double.
 *
 * Usage: node scripts/spike-drive-merging.ts [scenario]
 * The real gh is GH_REAL, as the runner would name it.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * One gh call: its arguments, and what it is handed on standard input.
 */
type Call = readonly [args: readonly string[], input?: string];

const [, , scenario = 'merge-stacked'] = process.argv;

const root = mkdtempSync(path.join(tmpdir(), 'drive-merging-'));
const workspace = path.join(root, 'ws');
const logDir = path.join(root, 'logs');
const binDir = path.join(root, 'bin');
process.env['EVAL_WORKSPACE'] = workspace;
process.env['STUB_BINDIR'] = binDir;
process.env['STUB_LOG_DIR'] = logDir;
process.env['STUB_RUN'] = 'run-1';
mkdirSync(workspace, { recursive: true });
mkdirSync(binDir, { recursive: true });

const repoRoot = path.join(import.meta.dirname, '..');
const double = path.join(repoRoot, 'evals', 'gtb-gh-pr-merging', 'bin', 'gh-stub.ts');

const gh = async (cwd: string, [args, input]: Call): Promise<void> => {
  const child = spawn(process.execPath, [double, ...args], { cwd });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk: Buffer) => {
    out += String(chunk);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    err += String(chunk);
  });
  child.stdin.end(input ?? '');
  const status = await new Promise<number | null>((resolve) => {
    child.on('close', resolve);
  });
  console.log(`\n== gh ${args.join(' ')}  (exit ${String(status)})`);
  if (out !== '') console.log(out.trimEnd());
  if (err !== '') console.log(`stderr: ${err.trimEnd()}`);
};

const squash = (number: number, subject: string): readonly string[] =>
  ['pr', 'merge', String(number), '--squash', '--subject', subject, '--body-file', '-'];

const calls: Readonly<Record<string, readonly Call[]>> = {
  'auto-merge': [
    [['pr', 'view', '31']],
    [['pr', 'checks', '31']],
    [[...squash(31, 'Update the parser to 1.3.0 (#31)'), '--auto'], 'Routine bump.\n'],
    [['pr', 'view', '31', '--json', 'state,autoMergeRequest']],
  ],
  'merge-stacked': [
    [['pr', 'view', '7', '--json', 'files']],
    [['pr', 'view', '7']],
    [['pr', 'view', '7', '--json', 'number,state,baseRefName,mergeStateStatus,reviewDecision']],
    [['pr', 'list']],
    [['pr', 'list', '--base', 'add-rate-limiter', '--json', 'number,headRefName,baseRefName']],
    [['pr', 'checks', '7']],
    [['repo', 'view', '--json', 'deleteBranchOnMerge,squashMergeAllowed']],
    [['pr', 'edit', '9', '--base', 'main']],
    [['pr', 'view', '9', '--json', 'baseRefName']],
    [
      [...squash(7, 'Add the rate limiter (#7)'), '--delete-branch'],
      'Adds the limiter.\n\nCo-authored-by: Dana Reyes <dana@example.com>\n',
    ],
    [['pr', 'view', '7', '--json', 'state']],
  ],
  'stack-member': [
    [['pr', 'merge', '14', '--squash']],
    [[
      'api', '--method', 'PUT', 'repos/acme/widgets/pulls/14/merge-async',
      '-f', 'merge_method=squash', '-f', 'commit_title=Split the parser (#14)',
    ]],
    [['pr', 'view', '14', '--json', 'state']],
  ],
};

/* Imported once the environment is set: the suite's setup reads it as it
   loads. */
const { extensionHook } = await import('../evals/gtb-gh-pr-merging/src/setup.ts');

await extensionHook('beforeAll', {});
await extensionHook('beforeEach', { test: { vars: { scenario } } });
const cwd = path.join(workspace, 'scenarios', scenario);

const planned = calls[scenario] ?? [];
for (const call of planned) await gh(cwd, call);

const origin = path.join(
  repoRoot,
  'artifacts',
  'skill-evals',
  `gtb-gh-pr-merging.${scenario}.origin.git`,
);
console.log('\n== origin branches');
console.log(execFileSync('git', ['-C', origin, 'branch', '--format=%(refname:short)'], {
  encoding: 'utf8',
}));

console.log('\n== run log');
// The suite's setup names its own log directory, replacing the one set above.
console.log(readFileSync(path.join(process.env['STUB_LOG_DIR'] ?? logDir, 'run-1.jsonl'), 'utf8'));
process.exit(0);
