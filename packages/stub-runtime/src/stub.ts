/*
 * Shared plumbing for a fake CLI installed at the front of PATH. Every stub
 * does the same three things: read its argv, record the call so a checker can
 * assert on it, and write a canned response.
 *
 * Logging is best-effort by design — a stub must never fail the call it is
 * standing in for just because it could not write its own log.
 *
 * `STUB_LOG` and `STUB_LOG_DIR` name where a call is recorded: a convention
 * between whoever installs the stub and whoever reads the log, not something
 * the code under test knows about. Unset, a stub records nothing and still
 * answers.
 *
 * These run under plain `node`, whose type stripping only erases annotations,
 * so everything here (and in the stubs) stays erasable syntax — no enums, no
 * namespaces, no parameter properties.
 *
 * A stub overlaid onto a `.ps1` and run through Node's CommonJS path cannot
 * import an ES module, so it reimplements this rather than reaching for it.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { StubOutcome } from './dispatch.ts';
import { runLogPath, runVar } from './run-log.ts';

/**
 * `process.argv` leads with the node binary and the stub itself.
 */
const cliArgsIndex = 2;

/**
 * The arguments the stub was invoked with.
 */
export const argv = process.argv.slice(cliArgsIndex);

/**
 * Those arguments as one string, for substring matching.
 */
export const joined = argv.join(' ');

/**
 * Appends one JSON line, creating the parent directory.
 */
export const appendJsonl = (filePath: string, entry: unknown): void => {
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
  } catch {
    // best-effort; never fail the call because logging failed
  }
};

/**
 * Records this invocation to $STUB_LOG, tagged with the command it fakes.
 * Silently does nothing when no log was set.
 *
 * `stdin` is what the call was handed on standard input, for the CLIs that take
 * prose there — it never appears in argv, so a log without it cannot tell a
 * filled-in body from an absent one. It is omitted rather than defaulted so a
 * stub that does not read stdin says nothing about it, instead of recording an
 * empty body it never looked for.
 *
 * Returns the log written to, which is where {@link emit} records how the call
 * was answered, or `undefined` when there was none.
 */
export const logCall = (cmd: string, stdin?: string): string | undefined => {
  const stubLog = process.env['STUB_LOG'];
  if (!stubLog) return undefined;
  appendJsonl(stubLog, stdin === undefined ? { argv, cmd } : { argv, cmd, stdin });
  return stubLog;
};

/**
 * The log of the run this invocation was made in, named by $STUB_RUN under
 * $STUB_LOG_DIR (see run-log.ts), or `undefined` when either is unset.
 */
export const runLogInFlight = (): string | undefined => {
  const logDir = process.env['STUB_LOG_DIR'];
  const runId = process.env[runVar];
  return logDir && runId ? runLogPath(logDir, runId) : undefined;
};

/**
 * Records this invocation into the log of the run it was made in (see
 * {@link runLogInFlight}). Records nothing outside a run. Takes `stdin` and
 * returns the log written to, as {@link logCall} does.
 */
export const logCallToRun = (cmd: string, stdin?: string): string | undefined => {
  const logPath = runLogInFlight();
  if (logPath === undefined) return undefined;
  appendJsonl(logPath, stdin === undefined ? { argv, cmd } : { argv, cmd, stdin });
  return logPath;
};

/**
 * Records a refusal in `log`, the log the refused call's arrival went to.
 *
 * Kept beside the call rather than in a log of its own, so it is attributed to
 * whichever test made the call however a suite partitions its logs. An answer
 * records nothing: the call is already there, and how a double answered what
 * it modelled is no finding.
 */
export const recordOutcome = (outcome: StubOutcome, log: string | undefined): void => {
  if (log !== undefined && outcome.kind === 'refused')
    appendJsonl(log, {
      argv: outcome.call.argv,
      cmd: outcome.call.cmd,
      refusal: outcome.reason,
    });
};

/**
 * Writes a line to stdout, adding the newline real CLIs end their output with.
 */
export const writeLine = (text: string): void => {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
};

/**
 * Writes a JSON response, as the real CLIs do under `--json`/`api`.
 */
export const writeJson = (body: unknown): void => {
  process.stdout.write(JSON.stringify(body));
};

/**
 * Hands back an outcome: both streams, then the status to leave with.
 *
 * The status is assigned rather than forced. Writing to a pipe is asynchronous
 * on some platforms, and `process.exit` ends the process with a queued write
 * still unflushed — taking the answer that was hardest to earn, since a
 * refusal exists to be read by whoever has to model the command and a `--json`
 * body exists to be parsed by the code under test. Losing either turns a
 * double that was answering honestly back into one that answers with nothing.
 *
 * Nothing a stub opens holds the event loop, so the process still ends as soon
 * as the writes land, with the status set here.
 *
 * `log` is where the call was recorded — what the logging helpers return — and
 * where a refusal is recorded beside it. It is required so a stub cannot leave
 * its refusals out by forgetting it; one that keeps no log passes `undefined`.
 */
export const emit = (outcome: StubOutcome, log: string | undefined): void => {
  recordOutcome(outcome, log);
  process.stdout.write(outcome.stdout);
  process.stderr.write(outcome.stderr);
  process.exitCode = outcome.code;
};
