/*
 * What a suite asks of the runner, declared in its own `eval.config.ts`.
 *
 * The runner imports that one module per suite and nothing else on the
 * suite's behalf, so whatever runs there runs because the suite named it.
 */

/**
 * What a contributor is handed.
 */
export interface EnvContext {
  /**
   * The suite's clean HOME, for anything a tool would otherwise keep in the
   * developer's.
   */
  readonly homeDir: string;
  /**
   * The real binary for a tool on the caller's PATH, past the doubles and any
   * version manager's shims, or `undefined` when there is none.
   */
  readonly realTool: (name: string) => string | undefined;
  /**
   * The caller's variables this contributor declared in `reads`, and no
   * others.
   */
  readonly source: Readonly<Record<string, string | undefined>>;
}

/**
 * Variables a suite adds to the environment its agent runs under.
 *
 * It runs in the runner, before anything is scrubbed, which is why it names
 * the caller's variables it reads rather than receiving them all.
 */
export interface EnvContributor {
  readonly env: (context: EnvContext) => Readonly<Record<string, string>>;
  /**
   * The caller's variables `env` may see.
   */
  readonly reads: readonly string[];
}

export interface SuiteConfig {
  readonly env?: readonly EnvContributor[];
}

/**
 * Types a suite's eval config: `export default defineSuite({ ... })`.
 */
export const defineSuite = (config: SuiteConfig): SuiteConfig => config;
