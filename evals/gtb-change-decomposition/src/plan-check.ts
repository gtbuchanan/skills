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
import { type AssertionResult, fromProblems } from '@gtbuchanan/agent-skills-harness/assert';
import { findJsonArray } from '@gtbuchanan/agent-skills-harness/json-scan';
import * as v from 'valibot';
import { scenarios } from './trees.ts';

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
  /**
   * Paths the task cannot be done without touching, checked against the union
   * of every unit's `touches`. Unit COUNT is not coverage: a `leave-whole` plan
   * of one unit naming only the type file satisfies every count and ordering
   * check while leaving out two files the change cannot land without.
   */
  requiresPaths: v.optional(StringArraySchema),
  scenario: v.string(),
  structuralFirst: v.optional(v.boolean()),
  verticalSlice: v.optional(v.boolean()),
});

const kinds = new Set(['behavioral', 'spike', 'structural']);

const ToolCallSchema = v.looseObject({
  input: v.optional(v.unknown()),
  name: v.optional(v.string(), ''),
});
const MetadataSchema = v.looseObject({
  toolCalls: v.optional(v.array(ToolCallSchema)),
});
const ProviderResponseSchema = v.looseObject({
  metadata: v.optional(MetadataSchema),
});
const ContextSchema = v.looseObject({
  providerResponse: v.optional(ProviderResponseSchema),
});

/**
 * Tool calls that reached into a scenario other than the one under test.
 *
 * The provider grants no boundary here — `append_allowed_tools` appends to a
 * permissive default rather than restricting it, and the default includes
 * `Bash`, so an allow rule cannot express this. What can be expressed is the
 * property itself: the run is asked afterwards whether it stayed put. That
 * covers every tool rather than the ones a rule happens to name, and it fails
 * loudly if the recording it depends on is not there, because an isolation
 * check that quietly measures nothing reads exactly like one that passed.
 */
/**
 * A path's segments with `.` and `..` resolved away.
 */
const resolveSegments = (path: string): string[] => {
  const resolved: string[] = [];

  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') resolved.pop();
    else resolved.push(segment);
  }

  return resolved;
};

/**
 * References in a tool call that do not provably stay inside `scenario`.
 *
 * Matching the names of the OTHER scenarios would only catch a call that spells
 * one out. The likelier ways to read a sibling never do: `find ./scenarios
 * -type f` walks all of them, `scenarios/*` expands to all of them, and
 * `scenarios/layer-trap/../leave-whole/…` resolves into one while naming
 * another. So every `scenarios` reference is resolved and required to land
 * inside this scenario, which makes anything unproven a failure rather than
 * anything recognized.
 */
export const strayReferences = (
  call: { input?: unknown; name?: string },
  scenario: string,
): string[] => {
  /* Windows paths arrive escaped inside the serialized input, so every run of
   * backslashes collapses to one separator before matching. */
  const text = JSON.stringify(call.input ?? {}).replaceAll(/\\+/gv, '/');
  const references = text.matchAll(/scenarios(?:\/[^\s"',;\)]*)?/gv);

  return [...references]
    .map(match => match[0])
    .filter((reference) => {
      // A bare `scenarios` reaches every one of them; anything else has to name
      // this scenario in the position directly beneath it.
      const [root, key] = resolveSegments(reference);
      return root !== 'scenarios' || key !== scenario;
    })
    .map(reference => `${call.name ?? 'call'} → ${reference}`);
};

const trespasses = (context: unknown, scenario: string): string[] => {
  const parsed = v.parse(ContextSchema, context ?? {});
  const calls = parsed.providerResponse?.metadata?.toolCalls;

  if (calls === undefined)
    return [
      'no toolCalls recorded, so the isolation check could not run — ' +
      `context had ${Object.keys(parsed).join(', ') || '(nothing)'}`,
    ];

  const seen = new Set(calls.flatMap(call => strayReferences(call, scenario)));

  return seen.size > 0 ? [`left its scenario: ${[...seen].join('; ')}`] : [];
};

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
/**
 * Relative import specifiers in a seeded file, resolved against its directory.
 *
 * A module the tree imports but does not contain is still something the project
 * named — `fog` seeds a search that loads documents from `../store/documents.ts`
 * precisely so the cause of its slowness may lie somewhere unreadable. A plan
 * naming that file read it off an import statement rather than inventing it,
 * which is the distinction grounding is trying to draw.
 */
const importedPaths = (file: string, contents: string): string[] => {
  const dir = file.split('/').slice(0, -1);
  /* Both quote styles: the seeded trees are single-quoted throughout, so a
   * double-quoted one would lose its anchor silently and surface later as a
   * grounding failure about a path the project plainly names. */
  const specifiers = contents.matchAll(
    /from\s+(?<quote>['"])(?<spec>\.{1,2}\/[^'"]+)\k<quote>/gv,
  );

  return [...specifiers].flatMap((match) => {
    const spec = match.groups?.['spec'];
    if (spec === undefined) return [];

    const resolved = [...dir];
    for (const segment of spec.split('/')) {
      if (segment === '.') continue;
      if (segment === '..') resolved.pop();
      else resolved.push(segment);
    }

    return [resolved.join('/')];
  });
};

const treeAnchors = (scenario: string): { dirs: Set<string>; files: Set<string> } => {
  const found = scenarios.find(entry => entry.key === scenario);
  if (!found) throw new Error(`no seeded tree for scenario ${scenario}`);

  const seeded = Object.keys(found.tree);

  /* Directories come from the seeded files ALONE. An imported module the tree
   * does not contain anchors itself, but its directory is not a place the
   * project was shown to have — deriving `src/store` from an import of
   * `src/store/documents.ts` would ground `src/store/unmentioned.ts`, a file
   * nothing in the project names. */
  const dirs = new Set<string>();
  for (const file of seeded) {
    const segments = file.split('/');
    for (let index = 1; index < segments.length; index += 1)
      dirs.add(segments.slice(0, index).join('/'));
  }

  const files = new Set(seeded);
  for (const [file, contents] of Object.entries(found.tree))
    for (const imported of importedPaths(file, contents)) files.add(imported);

  return { dirs, files };
};

/**
 * Paths that name nothing in the seeded tree, and no directory of it.
 *
 * Every entry has to land, not merely one: a unit pairing a real file with an
 * invented one is describing a codebase that does not exist just as much as a
 * unit that invents both, and scoring it on its best path would let the
 * invention through.
 */
const ungrounded = (
  paths: string[],
  anchors: { dirs: Set<string>; files: Set<string> },
): string[] =>
  paths.filter((entry) => {
    if (anchors.files.has(entry) || anchors.dirs.has(entry)) return false;
    /* A file the unit intends to CREATE is grounded by the directory it would
     * live in, so `src/payments/provider.ts` counts and `src/export/csv.ts`
     * does not. */
    const slash = entry.lastIndexOf('/');
    /* The project root is a directory too, and it is where the config a unit
     * adds belongs — a reformat unit writing `.prettierrc` is naming a real
     * place, not inventing a tree. */
    if (slash === -1) return false;
    return !anchors.dirs.has(entry.slice(0, slash));
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
    if (unit.touches.length === 0) {
      problems.push(`${label}: touches nothing`);
      continue;
    }

    const invented = ungrounded(touchedPaths(unit, scenario), anchors);
    if (invented.length > 0)
      problems.push(`${label}: ${invented.join(', ')} not under the seeded tree`);
  }

  return problems;
};

/**
 * Paths the task requires that no unit in the plan claims.
 */
const checkCoverage = (
  plan: Unit[],
  vars: v.InferOutput<typeof VarsSchema>,
): string[] => {
  const required = vars.requiresPaths;
  if (required === undefined) return [];

  const covered = new Set(
    plan.flatMap(unit => touchedPaths(unit, vars.scenario)),
  );
  /* A unit may claim a directory rather than enumerate it — a repo-wide
   * reformat naming `src` covers every file beneath it — so an ancestor counts.
   * What this still catches is the case worth catching: a plan naming one file
   * of a set the change cannot land without. */
  const isCovered = (entry: string): boolean => {
    const segments = entry.split('/');
    for (let depth = 1; depth <= segments.length; depth += 1)
      if (covered.has(segments.slice(0, depth).join('/'))) return true;
    return false;
  };
  const missing = required.filter(entry => !isCovered(entry));

  return missing.length > 0 ? [`no unit touches ${missing.join(', ')}`] : [];
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
    ...trespasses(context, vars.scenario),
    ...checkShape(plan, vars.scenario),
    ...checkCounts(plan, vars),
    ...checkCoverage(plan, vars),
    ...checkKinds(plan, vars),
    ...checkStructuralFirst(plan, vars),
    ...checkCuts(plan, vars),
  ]);
}
