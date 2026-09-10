/*
 * Tests for how a handler claims a call.
 *
 * The rule these enforce is that a command is a command and an argument is an
 * argument. A double that searches its whole command line for `pr merge` finds
 * it in `--title 'fix pr merge bug'` too, and the merge handler answers a
 * create — the quiet failure these doubles exist to avoid, since the call
 * succeeds, the world changes, and every assertion about what the run called
 * still passes. Every case below is about keeping those two questions apart.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { allOf, argument, subcommand } from '@gtbuchanan/stub-runtime/match';

/**
 * A call to some double. `gh` stands in for a CLI in the cases where which one
 * it is does not matter.
 */
const call = (
  ...argv: string[]
): { argv: string[]; cmd: string; stdin: string } => ({
  argv,
  cmd: 'gh',
  stdin: '',
});

test('a command claims the call that names it', ({ expect }) => {
  expect(subcommand('pr', 'merge')(call('pr', 'merge'))).toBe(true);
});

test('an argument saying the command does not claim it', ({ expect }) => {
  /* The bug this exists for: a title that mentions a merge is still a create,
     and answering it as a merge records one nobody asked for. */
  const create = call('pr', 'create', '--title', 'fix pr merge bug');

  expect(subcommand('pr', 'merge')(create)).toBe(false);
});

test('what follows the command does not change which one it is', ({ expect }) => {
  const viewed = call('pr', 'view', '42', '--json', 'title,body');

  expect(subcommand('pr', 'view')(viewed)).toBe(true);
});

test('a deeper command is not claimed by a shallower one beside it', ({
  expect,
}) => {
  /* `az pipelines runs update` and `az pipelines list` share a first token, so
     a match on that alone would hand every update to the listing. */
  const update = call('pipelines', 'runs', 'update', '--id', '900999');

  expect(subcommand('pipelines', 'list')(update)).toBe(false);
  expect(subcommand('pipelines', 'runs', 'update')(update)).toBe(true);
});

test('a command found later in the line is not the command', ({ expect }) => {
  /* An endpoint path ending in a word is not that word's subcommand, however
     the line reads once the arguments are joined up. */
  const endpoint = call('api', '--method', 'PUT', 'repos/acme/widgets/pr/merge');

  expect(subcommand('pr', 'merge')(endpoint)).toBe(false);
});

test('an argument claims the call carrying it', ({ expect }) => {
  const reply = call('api', 'repos/acme/widgets/pulls/42/comments/7/replies');

  expect(argument(/\/replies/v)(reply)).toBe(true);
});

test('a pattern may not straddle two arguments', ({ expect }) => {
  /* Each argument is tested on its own, so a pattern spanning the space
     between two of them is matching something nobody passed. */
  const create = call('pr', 'create', '--title', 'ship it');

  expect(argument(/create --title/v)(create)).toBe(false);
});

test('a stateful pattern claims the same call every time', ({ expect }) => {
  /* `g` and `y` make `RegExp.prototype.test` carry `lastIndex` from one call to
     the next, so a matcher built on it answers the second identical call from
     wherever the first one stopped. A handler that quietly stops claiming its
     command is the failure this whole table exists to prevent. */
  const matches = argument(/user/gv);
  const call = { argv: ['user'], cmd: 'gh', stdin: '' };

  expect(matches(call)).toBe(true);
  expect(matches(call)).toBe(true);
});

test('matching leaves the pattern as it was handed over', ({ expect }) => {
  /* A double holds one `RegExp` for both halves of a handler — the apply
     suite's reaction path claims the call and then reads the comment id back
     out of it. A matcher that advanced `lastIndex` would leave that read
     starting past its own match, and the id would arrive as the fallback. */
  const reactionsPath = /comments\/(?<id>\d+)\/reactions/gv;
  const endpoint = 'repos/acme/widgets/pulls/comments/7/reactions';

  argument(reactionsPath)({ argv: ['api', endpoint], cmd: 'gh', stdin: '' });

  expect(reactionsPath.exec(endpoint)?.groups?.['id']).toBe('7');
});

test('all of them have to claim the call', ({ expect }) => {
  const endpoint = allOf(subcommand('api'), argument(/^user$/v));

  expect(endpoint(call('api', 'user', '--jq', '.login'))).toBe(true);
  expect(endpoint(call('pr', 'edit', '--add-assignee', 'user'))).toBe(false);
});
