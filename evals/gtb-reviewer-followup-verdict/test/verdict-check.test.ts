/*
 * Tests for how this suite's checker finds the skill's array in the agent's
 * reply.
 *
 * The skill is told to emit the array bare, and usually does — but "usually" is
 * the whole problem. A real run sometimes leads with a sentence or wraps the
 * array in a fence, so the checker has to locate the array inside prose rather
 * than assume it is the entire output. Scanning from the first `[` to the last
 * `]` does that only while the surrounding prose is bracket-free: one `[1]` in a
 * preamble and the match starts there instead, dragging non-JSON into the parse
 * and failing a run whose array was perfectly good. A false failure here is
 * expensive precisely because it looks like a skill regression.
 *
 * The opposite error matters just as much. When the agent truly emits a broken
 * array, that is a real contract violation and the assertion must still fail —
 * a lenient parser here would hide the defect the suite exists to catch. Both
 * directions are pinned below.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { test } from 'vitest';
import assertVerdicts from '#src/verdict-check.ts';

/**
 * A single-thread verdict array, the shape the fixtures assert against.
 */
const array =
  '[{"threadId":"T-form","path":"ui/form.tsx","line":15,' +
  '"verdict":"unaddressed","evidence":"no hunk touches the file",' +
  '"reply":"still fires per keystroke"}]';

const vars = { expectedVerdict: 'unaddressed' };

const check = (output: string) => assertVerdicts(output, { vars });

test('reads an array emitted on its own', ({ expect }) => {
  expect(check(array).pass).toBe(true);
});

test('reads an array after a plain-prose preamble', ({ expect }) => {
  expect(check(`Verdicts below.\n\n${array}`).pass).toBe(true);
});

test('reads an array after a preamble containing brackets', ({ expect }) => {
  // The bracketed citation is the trap: it holds the first `[` in the output.
  expect(check(`Read threads [1] and [2].\n\n${array}`).pass).toBe(true);
});

test('reads an array followed by prose containing brackets', ({ expect }) => {
  // Symmetric trap — the trailing `]` sits after the array's own.
  expect(check(`${array}\n\nThread [3] was out of scope.`).pass).toBe(true);
});

test('reads an array wrapped in a markdown fence', ({ expect }) => {
  expect(check(`\`\`\`json\n${array}\n\`\`\``).pass).toBe(true);
});

test('reads an array whose reply text contains a bracket', ({ expect }) => {
  const withBracket = array.replace(
    'still fires per keystroke',
    'the handler at users[0] still fires per keystroke',
  );

  expect(check(withBracket).pass).toBe(true);
});

test('rejects a truncated array rather than salvaging it', ({ expect }) => {
  // The observed slip: the final object never closes before the `]`.
  const truncated = array.replace('"}]', '"');

  const result = check(`${truncated}]`);

  expect(result.pass).toBe(false);
  expect(result.score).toBe(0);
});

test('rejects output with no array at all', ({ expect }) => {
  const result = check('I could not reach a verdict on this thread.');

  expect(result.pass).toBe(false);
  expect(result.score).toBe(0);
});

test('scores every thread when the output holds several', ({ expect }) => {
  const many =
    '[{"threadId":"T-a","verdict":"exact-fix","reply":""},' +
    '{"threadId":"T-b","verdict":"partial","reply":"batch path still derefs"}]';

  const result = assertVerdicts(`Here they are:\n\n${many}`, {
    vars: { expectedVerdicts: { 'T-a': 'exact-fix', 'T-b': 'partial' } },
  });

  expect(result.pass).toBe(true);
  expect(result.score).toBe(1);
});
