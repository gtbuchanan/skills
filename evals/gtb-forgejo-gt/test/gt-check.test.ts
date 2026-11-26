/*
 * Tests for the checks this suite adds to the shared call-expectation engine.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import { checkHosts, checkReply, checkReport, postedLogFor } from '#src/gt-check.ts';

const gt = (...argv: string[]) => ({ argv, cmd: 'gt' });

test('flags each gt call that names no host, in either spelling', ({ expect }) => {
  expect(
    checkHosts([
      gt('api', '--host', 'https://forgejo.example.com', 'repos/acme/widgets/pulls/7'),
      gt('pr', 'checks', '7', '--host=https://forgejo.example.com', '-R', 'acme/widgets'),
      gt('pr', 'view', '7', '-R', 'acme/widgets'),
    ]),
  ).toStrictEqual(['gt pr view 7 -R acme/widgets names no --host']);
});

test('exempts the commands that act on every instance', ({ expect }) => {
  expect(
    checkHosts([
      gt('auth', 'status'),
      gt('version'),
      gt('--version'),
      gt('help', 'api'),
      gt('schema', 'pr', 'view'),
    ]),
  ).toStrictEqual([]);
});

test('holds auth login to naming its host too', ({ expect }) => {
  expect(checkHosts([gt('auth', 'login', '--ssh-agent-key', 'SHA256:x')])).toHaveLength(1);
});

test('ignores calls to other commands', ({ expect }) => {
  expect(checkHosts([{ argv: ['status'], cmd: 'git' }])).toStrictEqual([]);
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
  expect(checkReply([])).toStrictEqual(['posted no reply through gt api']);
});

test('names each string the report leaves out', ({ expect }) => {
  expect(checkReport('the integration job failed', ['integration', 'TestRetry'])).toStrictEqual(
    ['report never mentions TestRetry'],
  );
});

test('keeps the posted replies beside the run log they belong to', ({ expect }) => {
  expect(postedLogFor('/runs/gtb-forgejo-gt/abc123.jsonl')).toBe(
    '/runs/gtb-forgejo-gt/abc123.posted.jsonl',
  );
});
