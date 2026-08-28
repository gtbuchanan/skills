/*
 * The file bodies the scenarios seed, and the PR template the repository with
 * one serves.
 *
 * Kept beside the scenarios rather than inside them so the world reads as a
 * list of situations rather than a wall of source text. Each `*Before` is the
 * state the agent finds; two of them carry the defect a scenario's review
 * feedback is about.
 */
export const template = [
  '### Description',
  '',
  '<!-- What is the problem, and how does this address it? -->',
  '',
  '### Notes for reviewers',
  '',
  '<!-- Where should review start? -->',
  '',
].join('\n');

export const schedulerBefore = [
  'export const retryDelay = (attempt: number): number => {',
  '  return 250;',
  '};',
  '',
].join('\n');

export const tokenBefore = [
  'let cached: string | undefined;',
  '',
  'export const mintToken = (): string => {',
  '  cached = String(Math.random());',
  '  return cached;',
  '};',
  '',
].join('\n');

export const poolBefore = [
  'export const acquire = (pool: string[]): string | undefined => {',
  '  return pool.pop();',
  '};',
  '',
].join('\n');

export const limiterBefore = [
  'export const allow = (count: number, cap: number): boolean => {',
  '  return count < cap;',
  '};',
  '',
].join('\n');

export const parserBefore = [
  '{ "name": "widgets", "dependencies": { "parser": "1.2.0" } }',
  '',
].join('\n');

export const tokenizerBefore = [
  'export const tokenize = (source: string): string[] =>',
  '  source.split(/\s+/v).filter(Boolean);',
  '',
].join('\n');

export const schedulerAfter = [
  'export const retryDelay = (attempt: number): number => {',
  '  return 250 * 2 ** attempt;',
  '};',
  '',
].join('\n');

export const cacheBefore = 'export const key = (url: string): string => url;\n';

export const cacheAfter = [
  'export const key = (method: string, url: string): string =>',
  '  `${method} ${url}`;',
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
