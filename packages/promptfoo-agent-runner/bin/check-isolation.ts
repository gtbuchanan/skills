/*
 * Diagnostic: prints the scrubbed-PATH allowlist and runs the fail-safe
 * self-test, without launching any eval. Run it from whatever shell you use to
 * invoke `pnpm eval` (PowerShell, cmd, bash) to confirm isolation holds
 * there — the ambient PATH differs by shell, so this is worth checking per host.
 */
import spawn from 'cross-spawn';
import { beginEphemeralRun } from '#src/ephemeral-run.ts';
import { evalIsolation } from '#src/eval-isolation.ts';

const { assertFailSafe, buildScrubbedPath, poisonDangerTools } = evalIsolation;

const stubDir = beginEphemeralRun().mintDir('skills-eval-check-');
// Mirror what a real run does, or the check reports a breach the runner doesn't have.
poisonDangerTools(stubDir);
const scrubbed = buildScrubbedPath({ stubDir });

console.log('Allowlisted dirs:');
for (const dir of scrubbed.allow) console.log(`  ${dir}`);
if (scrubbed.missing.length > 0)
  console.log('Missing tools:', scrubbed.missing.join(', '));

const failures = assertFailSafe({
  run: (command, args, options) => spawn.sync(command, args, options),
  scrubbedPath: scrubbed.path,
  stubDir,
});
if (scrubbed.missing.length === 0 && failures.length === 0) {
  console.log('\nPASS — toolchain present; gh/az/pwsh unreachable or shadowed.');
  process.exit(0);
}
console.log('\nFAIL:');
for (const tool of scrubbed.missing)
  console.log(`  - missing required tool: ${tool}`);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(1);
