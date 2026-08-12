/*
 * Shared plumbing for the fake CLIs the runner installs onto the eval
 * PATH. Every stub does the same three things: read its argv, record the call
 * so the checker can assert on it, and write a canned response.
 *
 * Logging is best-effort by design — a stub must never fail the call it is
 * standing in for just because it could not write its own log.
 *
 * These run under plain `node`, whose type stripping only erases annotations,
 * so everything here (and in the stubs) stays erasable syntax — no enums, no
 * namespaces, no parameter properties.
 *
 * Not used by bin/script-stub.cjs: that one is overlaid onto a .ps1 and run
 * through Node's CommonJS path, so it cannot import an ES module.
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
 * Silently does nothing when the suite set no log.
 */
export const logCall = (cmd: string): void => {
  const stubLog = process.env['STUB_LOG'];
  if (stubLog) appendJsonl(stubLog, { argv, cmd });
};

/**
 * Records this invocation into $STUB_LOG_DIR under `fileName`, for suites that
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
