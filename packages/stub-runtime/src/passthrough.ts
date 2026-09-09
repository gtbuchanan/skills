/*
 * Handing a call to the real tool a double is standing in for.
 *
 * The safest double is the one that answers nothing. Where the real tool is
 * reachable offline and the world it reads was seeded for real, a stub has
 * nothing to invent: every answer is already true, and the only thing missing
 * is a record of what was asked. Such a stub records the call and gets out of
 * the way — which is this module, and which is why a command nobody modelled
 * needs no thought at all. It is answered by the real thing.
 *
 * The child inherits this process's streams, so whoever ran the double sees
 * the tool's own output, unbuffered and unaltered. What comes back here is only
 * the status to leave with.
 *
 * Nothing here is particular to git: it is "run the real binary at this path,
 * under exactly this environment". The binary and the environment are the
 * caller's business — for git they are `@gtbuchanan/git-fixtures/real-git`,
 * which resolves past the double and shuts out ambient config.
 *
 * Loaded by stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import spawn from 'cross-spawn';

/**
 * What to hand over: the tool to run, the arguments the double was called
 * with, and the environment to run it under. An absent `env` leaves the child
 * with this process's own, as a bare spawn would.
 */
export interface PassthroughCall {
  readonly argv: readonly string[];
  readonly binary: string;
  readonly env?: NodeJS.ProcessEnv | undefined;
}

/**
 * The status a stub leaves with when a child never returned one.
 *
 * A child killed by a signal reports no status at all, and a double that read
 * that as success would tell the code under test its call went through.
 */
const noStatus = 1;

/**
 * The exit status to leave with, given what the child reported.
 */
export const exitCodeFrom = (status: number | null): number => status ?? noStatus;

/**
 * Runs the real tool and returns the status to exit with. Callers exit; this
 * does not, so it stays usable from a test.
 */
export const passThrough = (call: PassthroughCall): number =>
  exitCodeFrom(
    spawn.sync(call.binary, [...call.argv], {
      env: call.env,
      stdio: 'inherit',
    }).status,
  );
