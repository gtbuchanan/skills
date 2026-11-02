/*
 * The skills a suite declares, grouped by the agent each provider runs, so the
 * runner installs every one where its agent looks.
 */
import { evalAgentNamed, evalAgents } from '@gtbuchanan/eval-agents/registry';
import * as v from 'valibot';

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
  return { agent: evalAgentNamed(config.agent).name, skills: config.agentConfig?.skills ?? [] };
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
