/*
 * Tests for how the tea double reads a command line.
 *
 * The reply scenario is judged on the body a `tea api` POST carried, so the
 * double has to read that body the way tea does whichever form the run chose:
 * string fields, typed fields, or raw JSON. A field it misread would fail a
 * correct reply, or pass a wrong one.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import {
  apiValueFlags,
  endpointPath,
  isOAuthLogin,
  parseArgs,
  requestBody,
} from '#src/tea-args.ts';

const noSource = (source: string): string => {
  throw new Error(`unexpected read of ${source}`);
};

const bodyOf = (argv: readonly string[], read = noSource): unknown =>
  requestBody(parseArgs(argv, apiValueFlags).flags, read);

test('collects repeated flags, both spellings, and positionals', ({ expect }) => {
  const parsed = parseArgs(
    ['api', '-f', 'a=1', '--field=b=2', '--include', 'repos/x/y'],
    apiValueFlags,
  );

  expect(parsed.flags['field']).toStrictEqual(['a=1', 'b=2']);
  expect(parsed.flags['include']).toStrictEqual(['']);
  expect(parsed.positionals).toStrictEqual(['api', 'repos/x/y']);
});

test('keeps string fields as strings, digits included', ({ expect }) => {
  expect(bodyOf(['api', '-f', 'new_position=18', '-f', 'body=a=b'])).toStrictEqual({
    body: 'a=b',
    new_position: '18',
  });
});

test('types -F values the way tea documents', ({ expect }) => {
  expect(
    bodyOf([
      'api',
      '-F', 'count=18',
      '-F', 'yes=true',
      '-F', 'none=null',
      '-F', 'list=[1,2]',
      '-F', 'quoted="null"',
      '-F', 'word=hello',
    ]),
  ).toStrictEqual({
    count: 18,
    list: [1, 2],
    /* eslint-disable-next-line unicorn/no-null --
       tea sends JSON null here, so the expectation has to name it. */
    none: null,
    quoted: 'null',
    word: 'hello',
    yes: true,
  });
});

const read = (source: string): string =>
  source === '-' ? '{"path":"a.go","new_position":3}' : 'from file';

test('reads -F @file and -d @- through the source reader', ({ expect }) => {
  expect(bodyOf(['api', '-F', 'body=@notes.txt'], read)).toStrictEqual({
    body: 'from file',
  });
  expect(bodyOf(['api', '-d', '@-'], read)).toStrictEqual({
    new_position: 3,
    path: 'a.go',
  });
});

test('parses an inline -d body', ({ expect }) => {
  expect(bodyOf(['api', '--data', '{"body":"ok"}'])).toStrictEqual({ body: 'ok' });
});

test('has no body when no body flag was given', ({ expect }) => {
  expect(bodyOf(['api', 'repos/x/y'])).toBeUndefined();
});

test('refuses -d beside -f, as tea does', ({ expect }) => {
  expect(() => bodyOf(['api', '-d', '{}', '-f', 'a=b'])).toThrow(/cannot be combined/v);
});

test('reduces every endpoint spelling to one path', ({ expect }) => {
  expect(endpointPath('repos/acme/widgets/pulls/7', undefined)).toBe(
    'repos/acme/widgets/pulls/7',
  );
  expect(endpointPath('/api/v1/repos/acme/widgets/pulls/7', undefined)).toBe(
    'repos/acme/widgets/pulls/7',
  );
  expect(
    endpointPath('https://forgejo.example.com/api/v1/repos/acme/widgets', undefined),
  ).toBe('repos/acme/widgets');
  expect(endpointPath('/repos/acme/widgets/issues?state=open', undefined)).toBe(
    'repos/acme/widgets/issues',
  );
});

test('fills placeholders from --repo and refuses them without one', ({ expect }) => {
  expect(endpointPath('repos/{owner}/{repo}/pulls', 'acme/widgets')).toBe(
    'repos/acme/widgets/pulls',
  );
  expect(() => endpointPath('repos/{owner}/{repo}/pulls', undefined)).toThrow(
    /repository/v,
  );
});

test('recognises a login added through OAuth, in either spelling', ({ expect }) => {
  expect(
    isOAuthLogin(['login', 'add', '--name', 'work', '--url', 'https://x', '--oauth']),
  ).toBe(true);
  expect(isOAuthLogin(['logins', 'add', '-o', '-n', 'work'])).toBe(true);
});

test('rejects other logins, and a flag value that only looks like OAuth', ({ expect }) => {
  expect(isOAuthLogin(['login', 'add', '--url', 'https://x', '--token', 'abc'])).toBe(false);
  expect(isOAuthLogin(['login', 'add', '--name', '--oauth'])).toBe(false);
  expect(isOAuthLogin(['login', 'list', '--oauth'])).toBe(false);
});
