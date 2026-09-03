/*
 * What the double remembers between calls.
 *
 * Each invocation is its own process, so anything a call changes — a pull
 * request opened, promoted, retargeted or merged — has to outlive it, or the
 * next `pr view` contradicts the one before. Without this the double answers
 * impossibly: a pull request it just reported creating cannot be viewed, one it
 * marked ready is still a draft, one it merged is still open. An agent acts on
 * the contradiction, and the suite then measures the double rather than the
 * skill.
 *
 * Where the file lives is the caller's business. This only says what is in it,
 * and refuses to guess when the answer would be a lie.
 *
 * Loaded by stubs running under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as v from 'valibot';

/**
 * A pull request this run opened, as `pr create` recorded it.
 */
export interface OpenedPr {
  readonly baseRefName: string;
  readonly body: string;
  readonly headRefName: string;
  readonly title: string;
}

/**
 * Everything earlier calls did that a later one has to agree with.
 */
export interface State {
  readonly merged: number[];
  readonly opened: Record<string, OpenedPr>;
  readonly ready: number[];
  /**
   * Bases changed by `pr edit --base`, so a retarget the double reported
   * making is still there when the next `pr view` asks.
   */
  readonly retargeted: Record<string, string>;
}

export const emptyState: State = {
  merged: [],
  opened: {},
  ready: [],
  retargeted: {},
};

const OpenedPrSchema = v.object({
  baseRefName: v.string(),
  body: v.string(),
  headRefName: v.string(),
  title: v.string(),
});

const NumberListSchema = v.array(v.number());
const OpenedMapSchema = v.record(v.string(), OpenedPrSchema);
const BaseMapSchema = v.record(v.string(), v.string());

const StateSchema = v.object({
  merged: v.optional(NumberListSchema, []),
  opened: v.optional(OpenedMapSchema, {}),
  ready: v.optional(NumberListSchema, []),
  retargeted: v.optional(BaseMapSchema, {}),
});

/**
 * JSON, or nothing. A file half-written by a killed process is not worth
 * failing a call over.
 */
const parsed = (contents: string): unknown => {
  try {
    return JSON.parse(contents);
  } catch {
    return undefined;
  }
};

/**
 * The world as earlier calls left it.
 *
 * Anything unreadable or the wrong shape reads as an empty world rather than
 * an error: a suite failing for a corrupt scratch file tells nobody anything
 * about the skill. Wrong-shaped is refused rather than trusted, though —
 * carrying a string where a number belongs would put it straight into an
 * answer.
 */
export const readState = (statePath: string): State => {
  if (!existsSync(statePath)) return emptyState;

  const result = v.safeParse(StateSchema, parsed(readFileSync(statePath, 'utf8')));
  return result.success ? result.output : emptyState;
};

export const writeState = (statePath: string, next: State): void => {
  writeFileSync(statePath, `${JSON.stringify(next)}\n`);
};
