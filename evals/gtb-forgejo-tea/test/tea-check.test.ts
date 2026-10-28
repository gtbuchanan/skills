/*
 * Tests for the checks this suite adds to the shared call-expectation engine.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { checkLogins, checkReply } from '#src/tea-check.ts';

const tea = (...argv: string[]) => ({ argv, cmd: 'tea' });

test('flags each tea call that names no login, in either spelling', ({ expect }) => {
  expect(
    checkLogins([
      tea('api', '--login', 'work', 'repos/acme/widgets/pulls/7'),
      tea('api', '-l', 'work', 'repos/acme/widgets/pulls/7/reviews'),
      tea('pulls', '7', '--login=work', '--repo', 'acme/widgets'),
      tea('api', '--repo', 'acme/widgets', 'repos/acme/widgets/commits/x/status'),
    ]),
  ).toStrictEqual([
    'tea api --repo acme/widgets repos/acme/widgets/commits/x/status names no --login',
  ]);
});

test('exempts the commands that take no --login', ({ expect }) => {
  expect(
    checkLogins([
      tea('login', 'list'),
      tea('logins', 'add'),
      tea('whoami'),
      tea('--version'),
    ]),
  ).toStrictEqual([]);
});

test('passes a reply on the thread path and position, typed either way', ({ expect }) => {
  const reply = { body: 'Fixed.', path: 'internal/poll/retry.go' };

  expect(checkReply([{ ...reply, new_position: 18 }])).toStrictEqual([]);
  expect(checkReply([{ ...reply, new_position: '18' }])).toStrictEqual([]);
});

test('fails a reply off the thread, without a body, or absent', ({ expect }) => {
  const onThread = { body: 'Fixed.', new_position: 18, path: 'internal/poll/retry.go' };

  expect(checkReply([{ ...onThread, path: 'retry.go' }])).toHaveLength(1);
  expect(checkReply([{ ...onThread, new_position: 12 }])).toHaveLength(1);
  expect(checkReply([{ ...onThread, body: '  ' }])).toHaveLength(1);
  expect(checkReply([])).toStrictEqual(['posted no reply through tea api']);
});
