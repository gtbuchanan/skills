/*
 * gh's stdin-body convention.
 *
 * Prose reaches gh on standard input (`--body-file -`, `-F body=@-`), which
 * keeps it off the command line entirely — so a double that logs argv alone
 * cannot tell a filled-in template from an empty one, nor a squash message
 * carrying the branch's trailers from one that dropped them.
 *
 * Whether a call names stdin has to be decided before reading it. Reading
 * unconditionally blocks on every call that does not, which is a hang rather
 * than a wrong answer, and hangs are what a suite times out on rather than
 * reports.
 */

/**
 * Flags whose following argument may be `-`, meaning standard input.
 */
const stdinFlags = new Set(['--body-file', '--field', '--input', '-F', '-f']);

/**
 * Whether this call says its body arrives on standard input.
 *
 * Two spellings, because gh has two: a flag whose value is exactly `-`, and
 * the `name=@-` form its API subcommand takes, where `@` is gh's own
 * read-from-file sigil and `-` the file that means stdin.
 */
export const hasStdinBody = (argv: readonly string[]): boolean =>
  argv.some(argument => argument.endsWith('=@-')) ||
  argv.some(
    (argument, index) => stdinFlags.has(argument) && argv[index + 1] === '-',
  );
