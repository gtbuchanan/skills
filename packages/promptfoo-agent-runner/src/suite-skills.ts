/*
 * What a suite's config asks of the runner: the skills it declares, grouped by
 * the agent each provider runs so the runner installs every one where its
 * agent looks, and the agents it needs signed in, graders included.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EvalAgent } from '@gtbuchanan/eval-agents/eval-agent';
import { evalAgentNamed, evalAgents } from '@gtbuchanan/eval-agents/registry';
import * as v from 'valibot';
import { parse as parseYaml } from 'yaml';

/* Just the slice of a promptfoo config the runner needs, split into named
 * sub-schemas so the nesting stays readable. Parsed through valibot so a
 * malformed config fails readably rather than deref'ing undefined; unrelated
 * keys are ignored.
 *
 * A provider declares skills one of two ways. The agent's own provider takes
 * them in its config and is known by its id; the run provider names its agent
 * and nests the agent's config under `agentConfig`. An agent's own provider is
 * checked first, since the Claude provider takes an `agent` key too, naming a
 * subagent; the run provider is whatever names an agent and no agent runs. */
const skillsSchema = v.optional(v.array(v.string()));
const agentConfigSchema = v.optional(v.object({ skills: skillsSchema }));
const agentSchema = v.optional(v.string());
const providerConfigSchema = v.optional(v.object({
  agent: agentSchema,
  agentConfig: agentConfigSchema,
  skills: skillsSchema,
}));
const providerObjectSchema = v.object({
  config: providerConfigSchema,
  id: v.optional(v.string()),
});
const providerSchema = v.union([v.string(), providerObjectSchema]);
const suiteConfigSchema = v.object({
  providers: v.optional(v.array(providerSchema)),
});

type ProviderObject = v.InferOutput<typeof providerObjectSchema>;

/**
 * The agent a provider runs and the skills it declares for it.
 */
const declaredBy = ({ config, id }: ProviderObject): { agent: string; skills: string[] } => {
  const own = evalAgents.find(agent => id !== undefined && agent.runsProvider(id));
  if (own !== undefined) return { agent: own.name, skills: config?.skills ?? [] };
  if (config?.agent === undefined) throw new Error(`no agent runs provider '${String(id)}'`);
  return {
    agent: evalAgentNamed(evalAgents, config.agent).name,
    skills: config.agentConfig?.skills ?? [],
  };
};

/**
 * Suite `name`'s promptfoo config under the repository at `root`, parsed.
 */
export const readSuiteConfig = (root: string, name: string): unknown =>
  parseYaml(readFileSync(path.join(root, 'evals', name, 'promptfooconfig.yaml'), 'utf8'));

/**
 * The parsed configs of the suites `names` under `root`, passing over any that
 * does not parse.
 */
export const readSuiteConfigs = (root: string, names: readonly string[]): unknown[] =>
  names.flatMap((name) => {
    try {
      return [readSuiteConfig(root, name)];
    } catch {
      // That suite fails on its own when it runs; the others still can.
      return [];
    }
  });

/* Every place a config names a provider an agent may run: the suite's own
 * providers, its default grader, and each test's grader. Read loosely, because
 * this only decides which agents need signing in. A provider it cannot resolve
 * adds no agent, and a suite whose config is malformed fails on its own when
 * it runs rather than stopping every other suite here. */
const anyValue = v.unknown();
const anyList = v.array(anyValue);
const graderSchema = v.object({ provider: v.optional(anyValue) });
const graderOptionsSchema = v.optional(graderSchema);
const testSchema = v.object({ options: graderOptionsSchema });
const signInSchema = v.object({
  defaultTest: v.optional(testSchema),
  providers: v.optional(anyList),
  tests: v.optional(anyList),
});

/**
 * The providers a parsed config runs anything on, graders included.
 */
const providersIn = (config: unknown): unknown[] => {
  const parsed = v.safeParse(signInSchema, config);
  if (!parsed.success) return [];
  const { defaultTest, providers = [], tests = [] } = parsed.output;
  const testGraders = tests
    .map(test => v.safeParse(testSchema, test))
    .flatMap(result => (result.success ? [result.output.options?.provider] : []));
  return [...providers, defaultTest?.options?.provider, ...testGraders];
};

/**
 * The agent `provider` runs, or `undefined` when it is none this runner drives.
 */
const agentOf = (provider: unknown): string | undefined => {
  const parsed = v.safeParse(providerSchema, provider);
  if (!parsed.success) return undefined;
  const { output } = parsed;
  const id = typeof output === 'string' ? output : output.id;
  const own = evalAgents.find(agent => id !== undefined && agent.runsProvider(id));
  if (own !== undefined) return own.name;
  const named = typeof output === 'string' ? undefined : output.config?.agent;
  return evalAgents.find(agent => agent.name === named)?.name;
};

/**
 * The registered agents the parsed promptfoo `configs` drive, each once.
 */
export const agentsUsedBy = (configs: readonly unknown[]): EvalAgent[] => {
  const names = new Set(configs.flatMap(providersIn).flatMap((provider) => {
    const agent = agentOf(provider);
    return agent ?? [];
  }));
  return evalAgents.filter(agent => names.has(agent.name));
};

/**
 * A parsed promptfoo config's declared skills, keyed by agent name.
 */
export const skillsByAgent = (config: unknown): Map<string, Set<string>> => {
  const byAgent = new Map<string, Set<string>>();
  const { providers = [] } = v.parse(suiteConfigSchema, config);
  for (const provider of providers) {
    if (typeof provider === 'string') continue;
    const { agent, skills } = declaredBy(provider);
    const names = byAgent.get(agent) ?? new Set<string>();
    for (const name of skills) names.add(name);
    byAgent.set(agent, names);
  }
  return byAgent;
};
