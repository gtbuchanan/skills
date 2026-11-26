/*
 * Tests for how the gt double reads a command line.
 *
 * The reply scenario is judged on the body a `gt api` POST carried, so the
 * double has to read that body the way gt does whichever form the run chose:
 * string fields, typed fields, or an --input file. A field it misread would
 * fail a correct reply, or pass a wrong one. The expected values follow gt
 * 2.0.0's own `api --help` and `--dry-run` output.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import {
  apiValueFlags,
  endpointPath,
  loginMethod,
  parseArgs,
  requestBody,
  requestMethod,
} from '#src/gt-args.ts';

const noSource = (source: string): string => {
  throw new Error(`unexpected read of ${source}`);
};

const flagsOf = (argv: readonly string[]) => parseArgs(argv, apiValueFlags).flags;

const bodyOf = (argv: readonly string[], read = noSource): unknown =>
  requestBody(flagsOf(argv), read);

const methodOf = (argv: readonly string[]): string => {
  const flags = flagsOf(argv);
  return requestMethod(flags, requestBody(flags, noSource));
};

test('collects repeated flags, both spellings, and positionals', ({ expect }) => {
  const parsed = parseArgs(
    ['api', '-f', 'a=1', '--raw-field=b=2', '--include', 'repos/x/y'],
    apiValueFlags,
  );

  expect(parsed.flags['raw-field']).toStrictEqual(['a=1', 'b=2']);
  expect(parsed.flags['include']).toStrictEqual(['']);
  expect(parsed.positionals).toStrictEqual(['api', 'repos/x/y']);
});

test('keeps -f values as strings, digits included', ({ expect }) => {
  expect(bodyOf(['api', '-f', 'new_position=18', '-f', 'body=a=b'])).toStrictEqual({
    body: 'a=b',
    new_position: '18',
  });
});

test('types -F values as JSON, the way gt documents', ({ expect }) => {
  expect(
    bodyOf([
      'api',
      '-F', 'count=18',
      '-F', 'yes=true',
      '-F', 'none=null',
      '-F', 'list=[1,2]',
      '-F', 'word=hello',
    ]),
  ).toStrictEqual({
    count: 18,
    list: [1, 2],
    /* eslint-disable-next-line unicorn/no-null --
       gt sends JSON null here, so the expectation has to name it. */
    none: null,
    word: 'hello',
    yes: true,
  });
});

const read = (source: string): string =>
  source === '-' ? '{"path":"a.go","new_position":3}' : 'from file';

test('reads -F @file through the source reader', ({ expect }) => {
  expect(bodyOf(['api', '-F', 'body=@notes.txt'], read)).toStrictEqual({
    body: 'from file',
  });
});

test('reads an --input body from stdin', ({ expect }) => {
  expect(bodyOf(['api', '--input', '-'], read)).toStrictEqual({
    new_position: 3,
    path: 'a.go',
  });
});

test('has no body when no body flag was given', ({ expect }) => {
  expect(bodyOf(['api', 'repos/x/y'])).toBeUndefined();
});

test('refuses --input beside fields, in gt\'s words', ({ expect }) => {
  expect(() => bodyOf(['api', '--input', '-', '-f', 'a=b'], read)).toThrow(
    '--input cannot be combined with API fields',
  );
});

test('sends GET without a body and POST with one', ({ expect }) => {
  expect(methodOf(['api', 'repos/x/y'])).toBe('GET');
  expect(methodOf(['api', 'repos/x/y', '-f', 'a=b'])).toBe('POST');
});

test('lets -X choose the method, in either spelling and case', ({ expect }) => {
  expect(methodOf(['api', '-X', 'patch', 'repos/x/y', '-f', 'a=b'])).toBe('PATCH');
  expect(methodOf(['api', '--method=DELETE', 'repos/x/y'])).toBe('DELETE');
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
    'repository required: use --repo owner/name',
  );
});

test('names the method an auth login authenticates with', ({ expect }) => {
  expect(loginMethod(['auth', 'login', '--host', 'h', '--ssh-agent-key', 'SHA256:x']))
    .toBe('ssh-agent-key');
  expect(loginMethod(['auth', 'login', '--host=h', '--with-token'])).toBe('token');
  expect(loginMethod(['auth', 'login', '--oauth'])).toBe('oauth');
  expect(loginMethod(['auth', 'login', '--ssh-key', '~/.ssh/id'])).toBe('ssh-key');
});

test('names none for other commands and a value that only looks like a flag', ({ expect }) => {
  expect(loginMethod(['auth', 'status', '--with-token'])).toBe('none');
  expect(loginMethod(['auth', 'login', '--host', '--oauth'])).toBe('none');
  expect(loginMethod(['auth', 'login'])).toBe('none');
});
