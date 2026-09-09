/*
 * The file bodies this suite's scenarios seed.
 *
 * Kept beside the scenarios rather than inside them so the world reads as a
 * list of situations rather than a wall of source text. Nothing here carries a
 * defect: a merge scenario is about what happens to a branch that is already
 * approved, so what the code says never comes into it.
 */
export const limiterBefore = [
  'export const allow = (count: number, cap: number): boolean => {',
  '  return count < cap;',
  '};',
  '',
].join('\n');

export const limiterAfter = [
  'export const allow = (count: number, cap: number): boolean => {',
  '  return count < cap;',
  '};',
  '',
  'export const rejected = (window: number): number => window;',
  '',
].join('\n');

export const tokenizerBefore = [
  'export const tokenize = (source: string): string[] =>',
  String.raw`  source.split(/\s+/v).filter(Boolean);`,
  '',
].join('\n');

export const parserBefore = [
  '{ "name": "widgets", "dependencies": { "parser": "1.2.0" } }',
  '',
].join('\n');

export const parserAfter = [
  '{ "name": "widgets", "dependencies": { "parser": "1.3.0" } }',
  '',
].join('\n');
