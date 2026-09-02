/*
 * What the `gh` double remembers between calls.
 *
 * Each invocation is its own process, so anything a call changes — a PR opened,
 * promoted, retargeted or merged — has to outlive it or the next `pr view`
 * contradicts the one before. The scenario's checkout is where they can agree.
 * Without this the double answers impossibly: a PR it just reported creating
 * cannot be viewed, one it marked ready is still a draft, one it merged is
 * still open.
 *
 * Split from bin/gh-stub.ts, which answers questions; this only holds the
 * answers that have to survive the process asking them.
 *
 * Loaded by the stubs under plain `node`, whose type stripping only erases
 * annotations, so everything here stays erasable syntax.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as v from 'valibot';
import { parseJson } from '#lib/calls.ts';

export interface OpenedPr {
  readonly baseRefName: string;
  readonly body: string;
  readonly headRefName: string;
  readonly title: string;
}

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

export const readState = (statePath: string): State => {
  if (!existsSync(statePath)) return emptyState;

  /*
  A half-written or hand-edited file is not worth failing a call over.
  */
  const parsed = v.safeParse(StateSchema, parseJson(readFileSync(statePath, 'utf8')));
  return parsed.success ? parsed.output : emptyState;
};

export const writeState = (statePath: string, next: State): void => {
  writeFileSync(statePath, `${JSON.stringify(next)}\n`);
};
