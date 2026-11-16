/*
 * Tests for the repeated-passage finder the skill ships.
 *
 * The prototype this replaces reported one hit per sliding window, so a single
 * restated sentence read as ten findings and the count could not be acted on.
 * Merging overlapping windows back into the passage they describe is the whole
 * job, so that is what is pinned hardest here.
 *
 * The script is driven as a subprocess rather than imported: it lives under
 * skills/ because consumers install it with the skill, and a file there is an
 * executable rather than a module. Running it is also what consumers do, so
 * this exercises the interface they actually have.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

const script = fileURLToPath(
  new URL(
    '../../../skills/gtb-technical-writing/scripts/find-repeated-passages.ts',
    import.meta.url,
  ),
);

/**
 * Ten words, so a repeat of it spans more than one eight-word window.
 */
const sentence = 'a unit whose checks pass is finished as code and';

/**
 * A throwaway directory of markdown files, removed when the test leaves scope.
 */
const corpus = (files: Record<string, string>) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'repeated-passages-'));
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), text);
  }
  return {
    dir,
    [Symbol.dispose]() {
      rmSync(dir, { force: true, recursive: true });
    },
  };
};

const run = (dir: string) =>
  execFileSync('node', [script, dir], { encoding: 'utf8' });

test('reports one passage for a repeat, not one per window', ({ expect }) => {
  using fixture = corpus({
    'left.md': `the pool retires a connection ${sentence} after a timeout`,
    'right.md': `nothing matches until ${sentence} and then stops again`,
  });

  const output = run(fixture.dir);

  expect(output).toContain(`10 words: "${sentence}"`);
});

test('names both documents a passage appears in', ({ expect }) => {
  using fixture = corpus({
    'left.md': sentence,
    'right.md': sentence,
  });

  const output = run(fixture.dir);

  expect(output).toMatch(/left\.md[\s\S]*right\.md/v);
});

test('reports the whole shared run rather than a sample of it', ({
  expect,
}) => {
  const longer = `${sentence} not yet finished as a unit`;
  using fixture = corpus({ 'left.md': longer, 'right.md': longer });

  const output = run(fixture.dir);

  expect(output).toContain(`16 words: "${longer}"`);
});

test('separates two repeats that do not adjoin', ({ expect }) => {
  const other = 'the branch has to go and nothing may still be';
  using fixture = corpus({
    'left.md': `${sentence} filler words unique to this side ${other}`,
    'right.md': `${sentence} entirely different wording here ${other}`,
  });

  const output = run(fixture.dir);

  expect(output).toContain(`10 words: "${sentence}"`);
  expect(output).toContain(`10 words: "${other}"`);
});

test('ignores a repeat shorter than the window', ({ expect }) => {
  using fixture = corpus({
    'left.md': 'open every pull request as a draft',
    'right.md': 'open every pull request as a draft',
  });

  expect(run(fixture.dir)).toBe('');
});

test('ignores wording repeated only inside fenced blocks', ({ expect }) => {
  const fenced = ['```sh', sentence, '```'].join('\n');
  using fixture = corpus({ 'left.md': fenced, 'right.md': fenced });

  expect(run(fixture.dir)).toBe('');
});

test('finds a passage repeated inside one document', ({ expect }) => {
  using fixture = corpus({
    'solo.md': `${sentence}\n\nunrelated filler between the copies\n\n${sentence}`,
  });

  expect(run(fixture.dir)).toContain(`10 words: "${sentence}"`);
});

test('reports a repeat inside one document once, not from both ends', ({
  expect,
}) => {
  using fixture = corpus({
    'solo.md': `${sentence}\n\nunrelated filler between the copies\n\n${sentence}`,
  });

  const hits = run(fixture.dir).split(`10 words: "${sentence}"`).length - 1;

  expect(hits).toBe(1);
});

test('does not report a document as repeating itself wholesale', ({
  expect,
}) => {
  using fixture = corpus({
    'solo.md': 'commit as soon as a logical change is complete and builds',
  });

  expect(run(fixture.dir)).toBe('');
});

test('reports nothing for documents that share no passage', ({ expect }) => {
  using fixture = corpus({
    'left.md': 'commit as soon as a logical change is complete and builds',
    'right.md': 'never rebase merge because the signature does not survive it',
  });

  expect(run(fixture.dir)).toBe('');
});
