#!/usr/bin/env node
/*
 * In-container per-suite runner (invoked by docker-entrypoint.sh; canonical
 * entry is `pnpm eval`). Runs each skill's suite as an isolated promptfoo eval —
 * a separate cwd per suite so their distinct prompts/paths don't cross-
 * contaminate — swapping that suite's stubs into STUB_BINDIR first. Leading bare
 * args are skill-name filters; flags are forwarded to promptfoo.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';

/**
 * `process.argv` leads with the node binary and this script.
 */
const cliArgsIndex = 2;
/**
 * rwxr-xr-x — the stub wrappers are execed by name off PATH.
 */
const stubMode = 0o755;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const suitesDir = path.join(root, 'evals');
const outDir = path.join(root, 'artifacts', 'skill-evals');

/*
 * Install the suite's test-double CLIs into STUB_BINDIR (set by the container
 * entrypoint to /usr/local/bin, or by run-evals-process.ts to a temp dir).
 * Convention: `<cmd>-stub.ts` → command <cmd>, wrapped to exec by absolute path.
 * Node strips the types natively, so the wrapper stays a plain `node <file>`.
 *
 * The POSIX wrapper is an extensionless shebang script exec'd off PATH. On
 * Windows we ALSO write a `<cmd>.cmd`: Git Bash resolves the extensionless
 * script (honouring the shebang), but any Windows executor resolves a bare
 * `az`/`gh` through PATHEXT — which finds the `.cmd` before it can reach the
 * associationless extensionless file and pop the OS "open with…" dialog. Both
 * forms exec the same stub, so whichever resolver runs, interception holds.
 *
 * `.cjs` is deliberately excluded: script-stub.cjs is overlaid onto the skill's
 * own script by setup.ts, not installed as a command.
 */
const stubBinDir = process.env['STUB_BINDIR'];
const isWindows = process.platform === 'win32';

const installStubs = (suiteDir: string): void => {
  if (!stubBinDir) return;
  const binDir = path.join(suiteDir, 'bin');
  if (!existsSync(binDir)) return;
  for (const file of readdirSync(binDir)) {
    const command = /^(?<command>.+)-stub\.m?ts$/v.exec(file)?.groups?.['command'];
    if (!command) continue;
    const dest = path.join(stubBinDir, command);
    const target = path.join(binDir, file);
    writeFileSync(dest, `#!/bin/sh\nexec node "${target}" "$@"\n`);
    chmodSync(dest, stubMode);
    if (isWindows)
      writeFileSync(
        path.join(stubBinDir, `${command}.cmd`),
        `@echo off\r\nnode "${target}" %*\r\n`,
      );
  }
};

/*
 * The suites interpolate `{{ env.CLAUDE_CODE_EXECUTABLE }}`, and promptfoo only
 * substitutes a variable that is *set* — unset would reach the SDK as a literal
 * path. run-evals-process.ts resolves a real value; the container path has the
 * SDK's own native binary and wants the empty (falsy) default.
 */
process.env['CLAUDE_CODE_EXECUTABLE'] ??= '';

const args = process.argv.slice(cliArgsIndex);
const firstFlag = args.findIndex(arg => arg.startsWith('-'));
const nameFilters = firstFlag === -1 ? args : args.slice(0, firstFlag);
const passthrough = firstFlag === -1 ? [] : args.slice(firstFlag);
const isUserSetsOutput = passthrough.some(
  arg => arg === '-o' || arg === '--output' || arg.startsWith('--output='),
);

const suites = existsSync(suitesDir)
  ? readdirSync(suitesDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .filter(
        entry => nameFilters.length === 0 || nameFilters.includes(entry.name),
      )
      .map(entry => ({
        name: entry.name,
        config: path.join(suitesDir, entry.name, 'promptfooconfig.yaml'),
      }))
      .filter(suite => existsSync(suite.config))
  : [];

if (suites.length === 0) {
  console.error(
    nameFilters.length > 0
      ? `No eval suites found for: ${nameFilters.join(', ')}`
      : 'No skill eval suites found under evals/*/',
  );
  process.exit(1);
}

if (!isUserSetsOutput) mkdirSync(outDir, { recursive: true });

let failed = 0;
for (const { name, config } of suites) {
  console.log(`\n=== eval: ${name} ===`);
  installStubs(path.dirname(config));
  const outArgs = isUserSetsOutput
    ? []
    : ['-o', path.join(outDir, `${name}.json`)];
  const res = spawn.sync(
    'pnpm',
    ['exec', 'promptfoo', 'eval', '--no-cache', ...outArgs, ...passthrough],
    { cwd: path.dirname(config), stdio: 'inherit' },
  );
  if (res.status !== 0) failed += 1;
}

const passed = suites.length - failed;
console.log(
  `\n${String(passed)}/${String(suites.length)} skill eval suite(s) passed`,
);
process.exit(failed ? 1 : 0);
