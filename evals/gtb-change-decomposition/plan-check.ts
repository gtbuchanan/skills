/*
 * promptfoo javascript assertion for gtb-change-decomposition.
 *
 * The skill's output is an ordered JSON array of units, each `{ title, kind,
 * touches, why }`. What is worth asserting is not the prose but the SHAPE of
 * the decomposition: how many units, whether any of them cuts through layers
 * rather than along them, whether structural work was separated from
 * behavioural work and put first, and whether an unrelated fix was kept out of
 * a mechanical sweep.
 *
 * Every check is driven by per-scenario vars, so a scenario asserts only the
 * one thing it isolates. The exception is grounding, which applies everywhere:
 * a plan whose paths match nothing in the tree was written without reading it,
 * and would score well on every structural check while being about a codebase
 * that does not exist.
 */
import * as v from 'valibot';
import { scenarios } from './trees.ts';
import { type AssertionResult, fromProblems } from '#lib/assert.ts';
import { findJsonArray } from '#lib/json-scan.ts';

const StringArraySchema = v.array(v.string());

const UnitSchema = v.looseObject({
  kind: v.optional(v.string(), ''),
  title: v.optional(v.string(), ''),
  touches: v.optional(StringArraySchema, []),
  why: v.optional(v.string(), ''),
});
const UnitArraySchema = v.array(UnitSchema);
/* `v.minLength(1)` must be inlined: hoisting it to a const widens its input to
   valibot's generic LengthInput, which no longer matches the array pipe. */
const PlanSchema = v.pipe(UnitArraySchema, v.minLength(1));

type Unit = v.InferOutput<typeof UnitSchema>;

/**
 * A unit whose `touches` must not drag in paths belonging to other work —
 * how `churn-separated` states that the bug fix is not riding along inside the
 * repo-wide reformat.
 */
const IsolatedSchema = v.object({
  kind: v.string(),
  path: v.string(),
  without: StringArraySchema,
});

/**
 * Layer name → path prefixes. A plan cut along the layers puts every unit in
 * exactly one of these; a plan cut through them has at least one unit spanning
 * two.
 */
const LayerMapSchema = v.record(v.string(), StringArraySchema);

const VarsSchema = v.object({
  /**
   * The kind the plan has to OPEN with — how `fog` states that the
   * investigation leads rather than merely appearing somewhere.
   */
  firstKind: v.optional(v.string()),
  isolated: v.optional(IsolatedSchema),
  layers: v.optional(LayerMapSchema),
  maxUnits: v.optional(v.number()),
  minUnits: v.optional(v.number()),
  requireKind: v.optional(v.string()),
  scenario: v.string(),
  structuralFirst: v.optional(v.boolean()),
  verticalSlice: v.optional(v.boolean()),
});

const kinds = new Set(['behavioral', 'spike', 'structural']);

/**
 * Normalizes a path for comparison: forward slashes, no leading `./`, and no
 * scenario-root prefix, so `scenarios/fog/src/search/rank.ts`,
 * `./src/search/rank.ts` and `src/search/rank.ts` are one path.
 */
const normalize = (raw: string, scenario: string): string => {
  const forward = raw.replaceAll('\\', '/').replace(/^\.\//v, '');
  const root = `scenarios/${scenario}/`;
  return forward.startsWith(root) ? forward.slice(root.length) : forward;
};

const touchedPaths = (unit: Unit, scenario: string): string[] =>
  unit.touches.map(entry => normalize(entry, scenario));

/**
 * The directories a seeded tree occupies, so a unit naming a file it intends to
 * CREATE (`src/payments/provider.ts`) still counts as grounded while one naming
 * an invented tree (`src/export/csv.ts`) does not.
 */
const treeAnchors = (scenario: string): { dirs: Set<string>; files: Set<string> } => {
  const found = scenarios.find(entry => entry.key === scenario);
  if (!found) throw new Error(`no seeded tree for scenario ${scenario}`);

  const files = new Set(Object.keys(found.tree));
  const dirs = new Set<string>();

  for (const file of files) {
    const segments = file.split('/');
    for (let index = 1; index < segments.length; index += 1)
      dirs.add(segments.slice(0, index).join('/'));
  }

  return { dirs, files };
};

const isGrounded = (
  paths: string[],
  anchors: { dirs: Set<string>; files: Set<string> },
): boolean =>
  paths.some((entry) => {
    if (anchors.files.has(entry) || anchors.dirs.has(entry)) return true;
    const parent = entry.slice(0, entry.lastIndexOf('/'));
    return parent !== '' && anchors.dirs.has(parent);
  });

/**
 * Which declared layers a unit reaches into.
 */
const layersOf = (
  paths: string[],
  layers: Record<string, string[]>,
): Set<string> => {
  const hit = new Set<string>();

  for (const [name, prefixes] of Object.entries(layers))
    if (paths.some(entry => prefixes.some(prefix => entry.startsWith(prefix))))
      hit.add(name);

  return hit;
};

const checkShape = (plan: Unit[], scenario: string): string[] => {
  const problems: string[] = [];
  const anchors = treeAnchors(scenario);

  for (const [index, unit] of plan.entries()) {
    const label = `unit ${String(index + 1)}`;
    if (unit.title.trim() === '') problems.push(`${label}: no title`);
    if (!kinds.has(unit.kind))
      problems.push(`${label}: kind=${unit.kind || '(none)'} is not structural or behavioral`);
    if (unit.touches.length === 0) problems.push(`${label}: touches nothing`);
    else if (!isGrounded(touchedPaths(unit, scenario), anchors))
      problems.push(
        `${label}: touches ${unit.touches.join(', ')} — no path under the seeded tree`,
      );
  }

  return problems;
};

const checkCounts = (
  plan: Unit[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] => {
  const problems: string[] = [];

  const count = String(plan.length);

  if (vars.minUnits !== undefined && plan.length < vars.minUnits)
    problems.push(`${count} unit(s), expected at least ${String(vars.minUnits)}`);
  if (vars.maxUnits !== undefined && plan.length > vars.maxUnits)
    problems.push(`${count} unit(s), expected at most ${String(vars.maxUnits)}`);

  return problems;
};

/**
 * Which kinds the plan has to contain, and which it has to open with.
 */
const checkKinds = (
  plan: Unit[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] => {
  const problems: string[] = [];

  if (vars.requireKind !== undefined && plan.every(unit => unit.kind !== vars.requireKind))
    problems.push(`no ${vars.requireKind} unit in the plan`);

  if (vars.firstKind !== undefined && plan[0]?.kind !== vars.firstKind)
    problems.push(
      `plan opens with ${plan[0]?.kind || '(nothing)'}, expected ${vars.firstKind}`,
    );

  return problems;
};

/**
 * That the reshaping lands before the behavior change that needed it.
 */
const checkStructuralFirst = (
  plan: Unit[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] => {
  if (vars.structuralFirst !== true) return [];

  const structural = plan.findIndex(unit => unit.kind === 'structural');
  if (structural === -1) return ['no structural unit separated from the behavior change'];

  const behavioral = plan.findIndex(unit => unit.kind === 'behavioral');
  if (behavioral === -1) return ['no behavioral unit — the change itself is missing'];
  if (structural < behavioral) return [];

  return [
    `structural unit ${String(structural + 1)} lands after ` +
    `behavioral unit ${String(behavioral + 1)}`,
  ];
};

/**
 * Where the plan cut: through the declared layers, and clear of work it was
 * supposed to leave alone.
 */
const checkCuts = (
  plan: Unit[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] => {
  const problems: string[] = [];
  const { isolated, layers } = vars;

  if (layers !== undefined && vars.verticalSlice === true) {
    const isSpanning = plan.some(
      unit => layersOf(touchedPaths(unit, vars.scenario), layers).size > 1,
    );
    if (!isSpanning)
      problems.push(
        'every unit sits in a single layer — the plan was cut along the layers, not through them',
      );
  }

  if (isolated === undefined) return problems;

  const { kind, path: wanted, without } = isolated;
  const matches = plan.filter((unit) => {
    const paths = touchedPaths(unit, vars.scenario);
    return unit.kind === kind && paths.includes(wanted);
  });
  const isIsolated = matches.some((unit) => {
    const paths = touchedPaths(unit, vars.scenario);
    return without.every(other => !paths.includes(other));
  });

  if (matches.length === 0) problems.push(`no ${kind} unit touching ${wanted}`);
  else if (!isIsolated)
    problems.push(
      `every ${kind} unit touching ${wanted} also carries ${without.join(' / ')}`,
    );

  return problems;
};

/**
 * Scores the plan's shape against what its scenario isolates.
 */
export default function assertPlan(
  output: unknown,
  context: { vars?: unknown },
): AssertionResult {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  const found = findJsonArray(text, PlanSchema);
  if ('reason' in found) return { pass: false, reason: found.reason, score: 0 };

  const vars = v.parse(VarsSchema, context.vars ?? {});
  const plan = found.output;

  return fromProblems([
    ...checkShape(plan, vars.scenario),
    ...checkCounts(plan, vars),
    ...checkKinds(plan, vars),
    ...checkStructuralFirst(plan, vars),
    ...checkCuts(plan, vars),
  ]);
}
