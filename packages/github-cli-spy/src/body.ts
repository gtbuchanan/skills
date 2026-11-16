/*
 * gh's stdin-body convention.
 *
 * Prose reaches gh on standard input (`--body-file -`, `-F body=@-`), which
 * keeps it off the command line entirely — so a double that logs argv alone
 * cannot tell a filled-in template from an empty one, nor a squash message
 * carrying the branch's trailers from one that dropped them.
 *
 * Deciding whether a call names stdin and reading it are one job rather than
 * two, which is why this module does both. Reading unconditionally blocks on
 * every call that named none, which is a hang rather than a wrong answer, and
 * hangs are what a suite times out on rather than reports — so a double that
 * asks the question and then reads anyway is the bug this exists to rule out.
 */
import { readFileSync } from 'node:fs';

/**
 * Flags whose following argument may be `-`, meaning standard input.
 *
 * `-f`/`--raw-field` is deliberately absent: gh takes its value as a literal
 * string, so a `-` there is the character rather than a request to read stdin.
 * Only `-F`/`--field` carries the `@` read-from-file sigil.
 */
const stdinFlags = new Set(['--body-file', '--field', '--input', '-F']);

/**
 * Whether this call says its body arrives on standard input.
 *
 * Two spellings, because gh has two: a flag whose value is exactly `-`, and
 * the `name=@-` form its API subcommand takes, where `@` is gh's own
 * read-from-file sigil and `-` the file that means stdin.
 */
const hasStdinBody = (argv: readonly string[]): boolean =>
  argv.some(argument => argument.endsWith('=@-')) ||
  argv.some(
    (argument, index) => stdinFlags.has(argument) && argv[index + 1] === '-',
  );

/**
 * Standard input's descriptor, which is what `readFileSync` is handed.
 */
const stdinDescriptor = 0;

/**
 * Standard input in full, or `''` when nothing is attached.
 *
 * A call that named stdin and was handed nothing is evidence a double should
 * see — an empty body — rather than a failure, so the miss is swallowed.
 */
const readStdin = (): string => {
  try {
    return readFileSync(stdinDescriptor, 'utf8');
  } catch {
    return '';
  }
};

/**
 * The body `argv` sends on standard input, or `''` when it names none.
 *
 * The one entry point, so no caller can hold the question without the answer.
 *
 * `read` is a parameter so a test can prove the un-named case never reads at
 * all — the half that would hang rather than answer wrongly, and so the half no
 * assertion about the returned string can reach.
 */
export const stdinBody = (
  argv: readonly string[],
  read: () => string = readStdin,
): string => (hasStdinBody(argv) ? read() : '');
