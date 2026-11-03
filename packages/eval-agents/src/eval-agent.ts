/**
 * What the eval runners need to know about one agent to drive it.
 */
export interface EvalAgent {
  /**
   * The agent's name to the `skills` CLI (its `-a`), which picks where in a
   * workspace the skills install.
   */
  readonly name: string;
  /**
   * The name a developer knows the agent by, for messages.
   */
  readonly displayName: string;
  /**
   * The promptfoo provider that runs this agent.
   */
  readonly providerId: string;
  /**
   * Whether a promptfoo provider id runs this agent.
   */
  readonly runsProvider: (providerId: string) => boolean;
  /**
   * `config` for {@link providerId}, changed so that `env` reaches the
   * commands the agent runs, on top of whatever `config` already passes.
   */
  readonly withEnv: (
    config: Readonly<Record<string, unknown>>,
    env: Readonly<Record<string, string>>,
  ) => Record<string, unknown>;
  /**
   * Whether a call to `cmd` with `argv` is one the agent's runtime makes for
   * itself, such as probing git at startup, rather than one the agent chose to
   * make. A double answers such a call and leaves it out of the run's log.
   */
  readonly isOwnCall: (cmd: string, argv: readonly string[]) => boolean;
  readonly auth: {
    /**
     * The stored login, relative to HOME. The runners hand a run this file
     * and nothing else from the developer's home.
     */
    readonly credentialsFile: string;
    /**
     * The variable that authenticates the agent without a stored login.
     */
    readonly apiKeyVar: string;
    /**
     * Every variable that can carry the agent's auth into a run.
     */
    readonly envVars: readonly string[];
  };
  readonly executable: {
    /**
     * The command a developer would run.
     */
    readonly command: string;
    /**
     * The variable the suites read the executable from, and through which a
     * developer overrides it.
     */
    readonly envVar: string;
    /**
     * The package that ships the agent's own native binary, as a platform
     * package per host.
     */
    readonly sdkPackage: string;
  };
  /**
   * The variable that tells the agent where Git Bash is on Windows.
   */
  readonly gitBashVar: string;
  /**
   * Files a fresh workspace needs before the agent runs in it, keyed by path
   * relative to the workspace.
   */
  readonly workspaceFiles: (workspace: string) => Readonly<Record<string, string>>;
}
