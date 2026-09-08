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
 */
export const logCall = (cmd: string, stdin?: string): void => {
  const stubLog = process.env['STUB_LOG'];
  if (stubLog)
    appendJsonl(stubLog, stdin === undefined ? { argv, cmd } : { argv, cmd, stdin });
};

/**
 * Records this invocation into $STUB_LOG_DIR under `fileName`, for callers that
 * key one log file per test rather than sharing one.
 */
export const logCallToDir = (cmd: string, fileName: string): void => {
  const logDir = process.env['STUB_LOG_DIR'];
  if (logDir) appendJsonl(path.join(logDir, fileName), { argv, cmd });
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
