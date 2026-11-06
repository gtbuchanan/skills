#!/usr/bin/env node
/*
 * Reports passages that appear in more than one document.
 *
 * Restatement between a frontmatter description and its own body, between a
 * body and its references, and between sibling documents survives a careful
 * reading of any one of them, because nothing prompts the comparison.
 *
 *   node find-repeated-passages.ts <dir>...
 *
 * Exits 0 whatever it finds. Repetition across documents is a question for a
 * reader, not a failure: a rule and its worked example share wording on
 * purpose, and so do two documents that are read independently and each need
 * the same warning.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/*
 * Words per window. Long enough that ordinary phrasing ("read it before you
 * merge") does not collide, short enough to catch a restated clause rather
 * than only a whole sentence.
 */
const windowWords = 8;

/*
A usage error, distinct from the 0 that reporting a finding exits with.
*/
const usageErrorCode = 2;

/*
argv holds the node binary and this script before the directories.
*/
const argvFirstDir = 2;

/**
 * A run of words two documents share.
 */
interface Passage {
  readonly words: number;
  readonly text: string;
}

/**
 * Where a shared window sits in each of the two documents.
 */
interface SharedWindow {
  readonly at: number;
  readonly other: number;
}

interface Run extends SharedWindow {
  length: number;
}

interface Document {
  readonly file: string;
  readonly words: string[];
}

/**
 * Every markdown file under a directory, however deeply nested.
 */
const markdownIn = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const entryPath = path.join(dir, entry);
    if (statSync(entryPath).isDirectory()) return markdownIn(entryPath);
    return entryPath.endsWith('.md') ? [entryPath] : [];
  });

/**
 * The comparable words of a document.
 *
 * Fenced blocks are examples and tables are data. Both repeat across documents
 * for reasons that have nothing to do with prose, so neither is compared.
 */
const wordsOf = (text: string): string[] =>
  text
    .replaceAll(/```[\s\S]*?```/gv, ' ')
    .replaceAll(/^\|.*$/gmv, ' ')
    .replaceAll(/[`*_#>\[\]\(\)]/gv, ' ')
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'\-]*/gv) ?? [];

/**
 * Each distinct window of words, mapped to every place it appears.
 *
 * Every place rather than the first, because a document that repeats itself is
 * found by a window occurring twice within the one list.
 */
const windowsOf = (wordList: string[]): Map<string, number[]> => {
  const found = new Map<string, number[]>();
  for (let start = 0; start + windowWords <= wordList.length; start += 1) {
    const key = wordList.slice(start, start + windowWords).join(' ');
    found.set(key, [...(found.get(key) ?? []), start]);
  }
  return found;
};

/**
 * Merges overlapping windows into the longest runs they describe.
 *
 * A repeated sentence surfaces as one window per starting word, so counting
 * windows reports a single restated passage many times over. Consecutive
 * starts in both documents are one passage and are joined back into one.
 */
const mergeRuns = (shared: SharedWindow[], left: string[]): Passage[] =>
  shared
    .toSorted((first, second) => first.at - second.at)
    .reduce<Run[]>((runs, hit) => {
      const previous = runs.at(-1);
      if (previous !== undefined) {
        const step = previous.length - windowWords + 1;
        if (
          hit.at === previous.at + step &&
          hit.other === previous.other + step
        ) {
          previous.length += 1;
          return runs;
        }
      }
      return [...runs, { at: hit.at, length: windowWords, other: hit.other }];
    }, [])
    .map(run => ({
      words: run.length,
      text: left.slice(run.at, run.at + run.length).join(' '),
    }));

/**
 * Every passage two documents share.
 */
const repeatedBetween = (left: string[], right: string[]): Passage[] => {
  const rightWindows = windowsOf(right);
  const shared = [...windowsOf(left)].flatMap(([key, positions]) => {
    const at = positions[0];
    const other = rightWindows.get(key)?.[0];
    return at === undefined || other === undefined ? [] : [{ at, other }];
  });
  return mergeRuns(shared, left);
};

/**
 * Every passage a document repeats within itself.
 *
 * A window matching itself where it stands says nothing, so a repeat is a
 * window found at a second position as well as its first.
 */
const repeatedWithin = (wordList: string[]): Passage[] => {
  const shared = [...windowsOf(wordList)].flatMap(([, positions]) => {
    const [at, other] = positions;
    return at === undefined || other === undefined ? [] : [{ at, other }];
  });
  return mergeRuns(shared, wordList);
};

/**
 * Prints passages under the documents they were found in.
 */
const printPassages = (heading: string, passages: Passage[]): void => {
  if (passages.length === 0) return;
  console.log(`\n${heading}`);
  for (const passage of passages) {
    console.log(`  ${String(passage.words)} words: "${passage.text}"`);
  }
};

const dirs = process.argv.slice(argvFirstDir);
if (dirs.length === 0) {
  console.error('usage: find-repeated-passages.ts <dir>...');
  process.exit(usageErrorCode);
}

const documents: Document[] = dirs
  .flatMap(dir => markdownIn(dir))
  .map(file => ({ file, words: wordsOf(readFileSync(file, 'utf8')) }));

const pairs = documents.entries();
for (const [index, left] of pairs) {
  printPassages(left.file, repeatedWithin(left.words));
  const later = documents.slice(index + 1);
  for (const right of later) {
    printPassages(
      `${left.file}\n${right.file}`,
      repeatedBetween(left.words, right.words),
    );
  }
}
