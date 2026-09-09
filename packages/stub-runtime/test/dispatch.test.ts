/*
 * Tests for the dispatch a double answers through.
 *
 * The rule this enforces is the one CONTRIBUTING calls the cardinal sin: a
 * double's fall-through is an answer. Empty output with exit 0 does not read as
 * "I don't know", it reads as "there is nothing here", and an agent acts on it
 * — so the suite passes for a run that deserved to fail. Every case below is
 * about that: what happens to a call nobody modelled, and to a handler that
 * discovers mid-answer it cannot answer.
 *
 * The dispatch returns an outcome rather than writing and exiting, which is
 * what lets these run in-process. It also has to: a library module gets no
 * entry-point exemption from `unicorn/no-process-exit`.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { dispatch, unmodelled } from '@gtbuchanan/stub-runtime/dispatch';

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

/**
 * A handler that answers anything whose argv contains `token`.
 */
const answering = (token: string, stdout: string) => ({
  matches: ({ argv }: { argv: readonly string[] }) => argv.includes(token),
  name: token,
  respond: () => ({ stdout }),
});

test('an unmodelled call is refused rather than answered', ({ expect }) => {
  const outcome = dispatch(call('pr', 'diff'), []);

  expect(outcome.code).not.toBe(0);
  expect(outcome.stdout).toBe('');
});

test('the refusal names the call so the author can model it', ({ expect }) => {
  const outcome = dispatch(call('pr', 'diff', '--name-only'), []);

  expect(outcome.stderr).toContain('pr diff --name-only');
});

test('the refusal names the CLI the double stands in for', ({ expect }) => {
  /* An author reading a refusal is looking at a PATH with several doubles on
     it, so the message has to say which one declined — and quote the command
     back the way they would retype it. */
  const outcome = dispatch(
    { argv: ['devops', 'invoke'], cmd: 'az', stdin: '' },
    [],
  );

  expect(outcome.stderr).toContain('az-stub');
  expect(outcome.stderr).toContain('"az devops invoke"');
});

test('a matching handler answers and succeeds', ({ expect }) => {
  const outcome = dispatch(call('pr', 'view'), [answering('view', 'ok')]);

  expect(outcome).toMatchObject({ code: 0, stdout: 'ok' });
});

test('the first matching handler wins, not the last', ({ expect }) => {
  const outcome = dispatch(call('pr', 'view'), [
    answering('view', 'first'),
    answering('view', 'second'),
  ]);

  expect(outcome.stdout).toBe('first');
});

test('a handler that cannot answer refuses instead of throwing out', ({ expect }) => {
  const outcome = dispatch(call('pr', 'view'), [
    {
      matches: () => true,
      name: 'view',
      respond: () => {
        throw unmodelled('field reviewDecision');
      },
    },
  ]);

  expect(outcome.code).not.toBe(0);
  expect(outcome.stderr).toContain('reviewDecision');
});

test('a handler may fail the call deliberately', ({ expect }) => {
  const outcome = dispatch(call('pr', 'checks'), [
    {
      matches: () => true,
      name: 'checks',
      respond: () => ({ code: 8, stderr: 'still running' }),
    },
  ]);

  expect(outcome).toMatchObject({ code: 8, stderr: 'still running' });
});
