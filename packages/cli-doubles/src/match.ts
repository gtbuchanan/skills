/*
 * How a handler claims a call.
 *
 * A handler table answers one question — which command is this? — and the
 * cheapest way to ask it, searching the joined argv for the command's name,
 * asks a different one: do those words appear anywhere on the line, an
 * argument's value included. `gh pr create --title 'fix pr merge bug'` is a
 * create, and a merge handler that searched the line claims it, records a
 * merge, and exits 0. That failure is the quiet kind these doubles exist to
 * avoid: the call succeeded, the world changed, and every assertion about what
 * the run *called* still passes.
 *
 * So `subcommand` matches a command where a command lives — the leading
 * arguments, by position. What is left over is the calls whose subject really
 * is an argument: `gh api` names an endpoint rather than a command, and a
 * GraphQL mutation names itself inside a `-f query=`. Those get `argument`,
 * which tests each argument on its own so a pattern cannot straddle two of
 * them, and `allOf` to scope that search to the subcommand which takes it.
 *
 * Matching by position also takes the ordering out of the table. Under a
 * substring test a handler's pattern could turn up in some other command's
 * line, so which handler answered depended on which was listed first — a
 * dependency nothing stated and nothing enforced, and one that reordering the
 * list to read better would quietly change. Two command handlers can no longer
 * both claim the same call. Handlers matched on an argument still can, and the
 * table says where that is so.
 *
 * These live beside `dispatch` rather than in any one suite because `dispatch`
 * takes `matches` from its caller: a helper here is the only place that fixes
 * every double at once and keeps them saying the same thing.
 *
 * Loaded by stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import type { StubMatcher } from './dispatch.ts';

/**
 * Matches the call whose command is `tokens` — `subcommand('pr', 'merge')` for
 * `gh pr merge`, and for no other command however a flag's value is worded.
 *
 * Read by position from the front of argv, which is where these CLIs put the
 * command and where they accept no flags. Arguments past the command are not
 * looked at, so `gh pr view 42 --json title` is still a `pr view`.
 */
export const subcommand = (...tokens: readonly string[]): StubMatcher =>
  call => tokens.every((token, index) => call.argv[index] === token);

/**
 * Matches a call carrying an argument that `pattern` matches.
 *
 * Per argument rather than over the joined argv: a pattern that matched across
 * the space between two of them would be matching a string nobody passed.
 *
 * A matcher has to be a question and not a move, so what it tests is a copy of
 * the pattern with `g` and `y` taken off. Those two make `test` carry
 * `lastIndex` from one call into the next, which costs twice over: the same
 * call stops being claimed the same way, and the pattern comes back to its
 * owner mid-string — and a double holds one `RegExp` for both halves of a
 * handler, claiming the call with it and then reading an id back out of it.
 *
 * Taken off rather than worked around, because neither flag means anything to
 * the question being asked. "Does some argument match" has no position to
 * resume from, and the copy is cut once here rather than per argument tested.
 */
export const argument = (pattern: RegExp): StubMatcher => {
  const stateless = new RegExp(pattern.source, pattern.flags.replaceAll(/[gy]/gv, ''));
  return call => call.argv.some(arg => stateless.test(arg));
};

/**
 * Matches a call every one of `matchers` claims — an endpoint under the
 * subcommand that takes endpoints, rather than either one loose.
 */
export const allOf = (...matchers: readonly StubMatcher[]): StubMatcher =>
  call => matchers.every(matcher => matcher(call));
