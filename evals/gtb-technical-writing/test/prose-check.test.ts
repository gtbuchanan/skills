/*
 * Tests for this suite's checker — the instrument the whole suite rests on.
 *
 * A prose rule can only be falsified by a checker that fails for the right
 * reason, so both directions are pinned here. A revision that keeps its facts
 * and sheds its padding must pass; one that drops a fact, leaves the defect
 * in place, fails to shrink, or shrinks to nothing must fail, and the reason
 * must name which of those happened. The over-cut direction matters most: it
 * is the only thing stopping a skill from scoring well by deleting prose.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import assertProse from '#src/prose-check.ts';

/**
 * The shortest fixture, and the one the suite expects back nearly unchanged,
 * so it stands in for a well-behaved revision here.
 */
const tightFixture = 'already-tight';

const check = (revised: string, constraints: Record<string, unknown>) =>
  assertProse(revised, { vars: { fixture: tightFixture, ...constraints } });

/**
 * The fixture on disk is the only honest source for "unchanged" — a copy
 * inlined here would drift from it the moment the fixture is edited.
 */
const readTightFixture = (): string =>
  readFileSync(
    new URL(`../fixtures/${tightFixture}/document.md`, import.meta.url),
    'utf8',
  );

test('passes when every required phrase survives', ({ expect }) => {
  const result = check('The limiter rejects with a 429 and refills lazily.', {
    mustContain: ['429', 'lazily'],
  });

  expect(result.pass).toBe(true);
  expect(result.score).toBe(1);
});

test('names the phrase that was dropped', ({ expect }) => {
  const result = check('The limiter rejects the request.', {
    mustContain: ['429'],
  });

  expect(result.pass).toBe(false);
  expect(result.reason).toContain('429');
});

test('matches required phrases case-insensitively', ({ expect }) => {
  const result = check('Refill happens LAZILY on read.', {
    mustContain: ['lazily'],
  });

  expect(result.pass).toBe(true);
});

/*
 * A count opening a sentence is spelled out rather than written as a numeral,
 * so a literal assertion on the numeral fails a document that kept the fact.
 */
test('accepts either rendering of a required fact', ({ expect }) => {
  const result = check('Thirty-eight accounts were charged twice.', {
    mustMatch: ['(38|thirty-eight)'],
  });

  expect(result.pass).toBe(true);
});

test('fails when no rendering of a required fact is present', ({ expect }) => {
  const result = check('Some accounts were charged twice.', {
    mustMatch: ['(38|thirty-eight)'],
  });

  expect(result.pass).toBe(false);
  expect(result.reason).toContain('no match for');
});

test('fails when a forbidden pattern survives', ({ expect }) => {
  const result = check('There are three settings that govern the pool.', {
    mustNotContain: ['there (is|are)'],
  });

  expect(result.pass).toBe(false);
  expect(result.reason).toContain('left in place');
});

test('passes when the forbidden pattern is gone', ({ expect }) => {
  const result = check('Three settings govern the pool.', {
    mustNotContain: ['there (is|are)'],
  });

  expect(result.pass).toBe(true);
});

test('fails a revision that did not shrink enough', ({ expect }) => {
  const result = check(readTightFixture(), { maxWordRatio: 0.5 });

  expect(result.pass).toBe(false);
  expect(result.reason).toContain('too long');
});

test('fails a revision that cut too far', ({ expect }) => {
  const result = check('Token bucket.', { minWordRatio: 0.85 });

  expect(result.pass).toBe(false);
  expect(result.reason).toContain('over-cut');
});

test('accepts an unchanged document against a lower bound', ({ expect }) => {
  const result = check(readTightFixture(), { minWordRatio: 0.85 });

  expect(result.pass).toBe(true);
});

test('strips a fence wrapping the whole reply', ({ expect }) => {
  const result = check('```markdown\nRejected with a 429.\n```', {
    mustContain: ['429'],
  });

  expect(result.pass).toBe(true);
});

/*
 * A runbook is mostly shell blocks with prose between them. Hunting for the
 * longest fenced span anywhere returned only that middle prose and reported
 * every fact outside it as dropped — a perfect document graded as a failure.
 */
test('keeps facts either side of an embedded code block', ({ expect }) => {
  const document = [
    'Restart the deployment:',
    '',
    '```sh',
    'kubectl rollout restart deploy/indexer',
    '```',
    '',
    'Escalate to #platform if lag persists.',
  ].join('\n');

  const result = check(document, {
    mustContain: ['Restart the deployment', 'rollout restart', '#platform'],
  });

  expect(result.pass).toBe(true);
});

test('fails a missing revision rather than throwing', ({ expect }) => {
  const result = assertProse(undefined, {
    vars: { fixture: tightFixture, mustContain: ['429'] },
  });

  expect(result.pass).toBe(false);
  expect(result.reason).toContain('empty');
});

test('fails an empty revision outright', ({ expect }) => {
  const result = check(' '.repeat(3), { mustContain: ['429'] });

  expect(result.pass).toBe(false);
  expect(result.score).toBe(0);
  expect(result.reason).toContain('empty');
});

test('scores partial credit when some constraints hold', ({ expect }) => {
  const result = check('Rejected with a 429.', {
    mustContain: ['429', 'lazily'],
  });

  expect(result.pass).toBe(false);
  expect(result.score).toBe(0.5);
});
