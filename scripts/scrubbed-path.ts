/*
 * Builds a fail-safe, container-free PATH for an eval harness.
 *
 * Docker's isolation was never kernel-level: its one load-bearing guarantee was
 * that real provider CLIs are ABSENT, so a command a suite forgot to stub fails
 * with command-not-found (safe) instead of silently hitting production
 * (dangerous). This reconstructs that property as a pure PATH allowlist, so the
 * harness runs natively — including where Docker can't (Termux/Android).
 *
 * It is an allowlist, NOT a denylist: version-manager shim dirs (mise, asdf) and
 * app-store dirs (WindowsApps, WinGet) re-export EVERY tool, danger CLIs
 * included, so subtracting known-bad dirs leaks. Instead we admit only the dirs
 * that supply the tools the skills legitimately need, preferring ones that carry
 * no danger CLI.
 *
 * Where no such dir exists the allowlist alone cannot hold, because the two sets
 * of tools share a directory: Termux puts node, bash, git AND gh in $PREFIX/bin,
 * as do Homebrew and Scoop for their own subsets. Admitting one is safe anyway —
 * the danger CLIs are shadowed from the front of PATH — so we admit it and let
 * the shadow carry the guarantee, rather than refuse to run.
 *
 * Which tools those are is the caller's to declare: nothing here knows what a
 * given repo's skills reach for. See {@link IsolationPolicy}.
 */
import type { SpawnSyncOptions, SpawnSyncReturns } from 'node:child_process';
import { chmodSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/*
 * Aggregator dirs re-export danger CLIs via shims; never admit them wholesale.
 * These name toolchain layouts rather than any one repo's policy, so they are
 * the default rather than a required option. `[\\\/]` is a v-mode class
 * matching either path separator.
 */
export const defaultAggregatorPatterns: readonly RegExp[] = [
  /[\\\/]mise[\\\/]shims$/iv,
  /[\\\/]\.asdf[\\\/]shims$/iv,
  /[\\\/]WindowsApps$/iv,
  /[\\\/]WinGet[\\\/]/iv,
];

/**
 * Layout-neutral guidance, since only the caller knows where its doubles live.
 */
const defaultShadowHint = 'install a stub for it in the suite that needs it';

/**
 * What a consumer must decide: which tools its skills legitimately need, and
 * which must never be reachable. Both are repo-specific — a repo whose skills
 * never touch Azure has no reason to shadow `az`, and one that shells out to
 * `kubectl` has every reason to add it.
 */
export interface IsolationPolicy {
  /**
   * Tools the shell + harness genuinely need; everything else stays unreachable.
   */
  readonly neededTools: readonly string[];
  /**
   * Provider CLIs that must never be reachable — a mock reaching these is the risk.
   */
  readonly dangerTools: readonly string[];
  /**
   * Defaults to {@link defaultAggregatorPatterns}.
   */
  readonly aggregatorPatterns?: readonly RegExp[];
  /**
   * What the shadow tells whoever hits it; defaults to a layout-neutral hint.
   */
  readonly shadowHint?: string;
}

/**
 * A spawnSync-shaped runner (cross-spawn's `sync` satisfies this).
 */
export type SpawnSync = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions,
) => SpawnSyncReturns<string | Buffer>;

/**
 * The isolation primitives, bound to one policy.
 *
 * They are handed out together rather than exported individually because they
 * share an invariant: buildScrubbedPath admits a danger-carrying directory only
 * when poisonDangerTools has already shadowed every danger CLI, and it decides
 * that by looking for those same names. Separate exports taking their own lists
 * would let a caller poison one set and admit against another — the interlock
 * would pass while whatever sat in the gap stayed reachable, silently.
 */
export interface Isolation {
  /**
   * Verifies the fail-safe holds before any eval runs: danger CLIs unreachable,
   * toolchain present. Runs the checks through the same shell the agent uses,
   * so it catches PATH-resolution quirks the JS-level check would miss. Returns
   * human-readable failures; empty means the fail-safe holds.
   *
   * `stubDir` is passed rather than read from the environment: a runner keeps
   * each suite's dir in the env it *builds*, never its own, so reading
   * `process.env` here would compare against nothing and report every poisoned
   * (but safely shadowed) CLI as a breach.
   */
  readonly assertFailSafe: (options: {
    run: SpawnSync;
    scrubbedPath: string;
    stubDir: string;
  }) => string[];
  /**
   * Assembles the scrubbed PATH: the stub dir first (so stubs and the shadows
   * win), then the dirs that supply the needed tools. The interpreter's own dir
   * and Git's tool dirs are seeded explicitly because the ambient PATH is
   * shell-dependent; every other tool takes the first non-aggregator dir on PATH
   * that supplies it, preferring one that carries no danger CLI.
   *
   * Aggregators are refused outright — they re-export every tool, so admitting
   * one defeats the narrowing this exists to do. A danger-carrying dir is
   * accepted as a last resort, because the shadows cover what makes it
   * dangerous; they must be planted in `stubDir` first, and this throws if they
   * are not.
   */
  readonly buildScrubbedPath: (options: {
    stubDir: string;
    sourcePath?: string;
    interpreterDir?: string;
    gitToolDirs?: readonly string[];
  }) => { path: string; allow: string[]; missing: string[] };
  /**
   * Plants a failing stand-in for every danger CLI at the front of PATH.
   *
   * The directory allowlist assumes the tools skills need and the tools they
   * must never reach live in different directories. That holds on a distro; it
   * does not on a single-prefix layout like Termux, where node, bash, git AND
   * gh all sit in $PREFIX/bin — admitting the interpreter's own dir necessarily
   * admits gh, and no subset of directories can separate them. Shadowing each
   * danger CLI restores the property the allowlist was there to provide: the
   * command resolves, then fails loudly, so a suite that forgot a stub still
   * cannot reach production.
   *
   * A suite's real stub is written to the same dir afterwards and overwrites the
   * shadow, so declared doubles keep working.
   */
  readonly poisonDangerTools: (stubDir: string) => void;
}

/*
 * Executable extensions to probe for; POSIX has none, Windows resolves by
 * suffix. Real Windows executables come first because findOnPath returns the
 * first hit: an npm-installed CLI leaves a bare, extensionless POSIX shim beside
 * its .cmd, and Windows cannot spawn that shim.
 */
const execExtensions =
  process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];

const hasTool = (dir: string, tool: string): boolean => {
  try {
    const files = new Set(readdirSync(dir).map(file => file.toLowerCase()));
    return execExtensions.some(ext => files.has((tool + ext).toLowerCase()));
  } catch {
    return false;
  }
};

/**
 * The first `command` on the given PATH, or undefined. Mirrors `which`/`where`,
 * which aren't portable enough to shell out to.
 */
export const findOnPath = (
  command: string,
  sourcePath: string,
): string | undefined =>
  sourcePath
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap(dir => execExtensions.map(ext => path.join(dir, command + ext)))
    .find(candidate => existsSync(candidate));

/**
 * Whether `specifier` resolves from `origin`, without throwing when it can't.
 */
const canResolve = (origin: string, specifier: string): boolean => {
  try {
    createRequire(origin).resolve(specifier);
    return true;
  } catch {
    return false;
  }
};

/**
 * Whether the agent SDK has a native `claude` for this host.
 *
 * The SDK ships one per platform as an optional dependency
 * (`@anthropic-ai/claude-agent-sdk-<platform>-<arch>`, `-musl` besides on linux)
 * and spawns it itself. Probing what the installer actually resolved beats
 * hardcoding a platform check, because it asks the same question the SDK does.
 * Resolution runs from the SDK's own entry: the platform packages are its
 * dependencies, not ours, so pnpm's layout hides them from here.
 */
export const hasSdkNativeClaude = (
  resolvedFrom: string = import.meta.url,
): boolean => {
  const sdk = '@anthropic-ai/claude-agent-sdk';
  if (!canResolve(resolvedFrom, sdk)) return false;
  const entry = createRequire(resolvedFrom).resolve(sdk);
  const base = `${sdk}-${process.platform}-${process.arch}`;
  return [base, `${base}-musl`].some(name =>
    canResolve(entry, `${name}/package.json`),
  );
};

/**
 * Resolves the `claude` the agent SDK should spawn.
 *
 * The SDK publishes no native binary for android, so on Termux every test errors
 * before reaching the model and one has to be supplied. Everywhere else the
 * SDK's own binary is the right one: substituting whatever `claude` happens to
 * sit on the developer's PATH would quietly change the version under test from
 * host to host. The suites read this through `path_to_claude_code_executable`.
 *
 * The result is always defined, because promptfoo only substitutes `{{ env.X }}`
 * when X is *set* — unset would reach the SDK as a literal `{{ … }}` path. Empty
 * is falsy, so the provider falls back to its own binary. An explicit
 * CLAUDE_CODE_EXECUTABLE outranks both, as the escape hatch for a host this probe
 * reads wrong. Resolution reads the caller's real PATH, not the scrubbed one —
 * `claude` is not a tool the allowlist admits, and the absolute path it yields
 * does not need to be on PATH to be spawned.
 */
export const claudeExecutable = (
  sourceEnv: NodeJS.ProcessEnv,
  hasNative: () => boolean = hasSdkNativeClaude,
): string =>
  sourceEnv['CLAUDE_CODE_EXECUTABLE'] ??
  (hasNative() ? '' : findOnPath('claude', sourceEnv['PATH'] ?? '') ?? '');

/**
 * Locates Git-for-Windows' tool dirs (`usr\bin` for the shell + coreutils,
 * `mingw64\bin` for git). Those hold `sh`, `env`, `ls`, `cat`, … which the
 * agent's Git Bash needs, yet they are only on PATH inside a Git Bash session —
 * under PowerShell or cmd (where a harness is usually launched) they are absent,
 * so scanning the ambient PATH alone misses them. We instead find any `bash` we
 * can and walk up to the install root, which is shell-independent.
 */
const windowsGitDirs = (entries: string[]): string[] => {
  if (process.platform !== 'win32') return [];
  const programFiles = process.env['ProgramFiles'] ?? String.raw`C:\Program Files`;
  const localAppData = process.env['LOCALAPPDATA'] ?? '';
  const bashPath = process.env['CLAUDE_CODE_GIT_BASH_PATH'];
  const seeds = [
    ...(bashPath === undefined ? [] : [path.dirname(bashPath)]),
    ...entries.filter(entry => hasTool(entry, 'bash')),
    path.join(programFiles, 'Git', 'bin'),
    path.join(localAppData, 'Programs', 'Git', 'bin'),
  ];
  const rootDepth = 3;
  for (const seed of seeds) {
    let dir = seed;
    for (let depth = 0; depth < rootDepth; depth += 1) {
      const usrBin = path.join(dir, 'usr', 'bin');
      if (existsSync(usrBin)) {
        const mingwBin = path.join(dir, 'mingw64', 'bin');
        return existsSync(mingwBin) ? [usrBin, mingwBin] : [usrBin];
      }
      dir = path.dirname(dir);
    }
  }
  return [];
};

/**
 * The dirs admitted without consulting the source PATH, because the ambient
 * PATH is shell-dependent and would otherwise miss them.
 *
 * Both are injectable so a caller can describe a host rather than inherit this
 * one: left real, the Git dirs read the environment and the filesystem, so on
 * Windows a test picks up whatever Git install is present. Empty on POSIX
 * either way, since only Git for Windows hides its tools from the ambient PATH.
 */
const seededDirs = (
  interpreterDir: string,
  gitToolDirs: readonly string[] | undefined,
  entries: string[],
): string[] => [interpreterDir, ...(gitToolDirs ?? windowsGitDirs(entries))];

/**
 * rwxr-xr-x — the shadow wrappers are execed by name off PATH.
 */
const shadowMode = 0o755;
/*
 * Escapes what cmd's parser would otherwise act on in an `echo` argument. A hint
 * naming a path like `evals/<suite>/bin/` carries angle brackets, and unescaped
 * those are redirections: cmd fails the line and prints nothing at all. Escaped
 * in one pass, with ^ in the class, so an escape never gets escaped again. `\|`
 * is escaped because v-mode reserves the bare pipe inside a class.
 */
const cmdEscaped = (text: string): string =>
  text.replaceAll(/[&<>^\|]/gv, character => `^${character}`);
/**
 * `command -v` convention: not found. Distinct from a stub's own failures.
 */
const shadowExitCode = 127;
/**
 * Column width the probe pads each tool name to, for a readable report.
 */
const probeColumnWidth = 12;

/**
 * Binds the isolation primitives to one {@link IsolationPolicy}.
 */
export const createIsolation = (policy: IsolationPolicy): Isolation => {
  const {
    aggregatorPatterns = defaultAggregatorPatterns,
    dangerTools,
    neededTools,
    shadowHint = defaultShadowHint,
  } = policy;

  const isAggregator = (dir: string): boolean =>
    aggregatorPatterns.some(pattern => pattern.test(dir));
  const hasDanger = (dir: string): boolean =>
    dangerTools.some(tool => hasTool(dir, tool));
  /*
   * Whether poisonDangerTools has planted its stand-ins in `stubDir`. Admitting
   * a dir that carries a danger CLI is only safe behind those, so this is
   * checked rather than assumed — the ordering is easy to get wrong in a new
   * caller.
   */
  const isPoisoned = (stubDir: string): boolean =>
    dangerTools.every(tool => existsSync(path.join(stubDir, tool)));

  return {
    assertFailSafe: ({ run, scrubbedPath, stubDir }) => {
      const probe = [...neededTools, ...dangerTools]
        .map(tool =>
          `printf '%-${String(probeColumnWidth)}s' ${tool}; ` +
          `command -v ${tool} || echo '(absent)'`)
        .join('; ');
      const result = run('bash', ['-c', probe], {
        env: { ...process.env, PATH: scrubbedPath },
        encoding: 'utf8',
      });
      const output = String(result.stdout);
      const lineFor = (tool: string): string =>
        output.split('\n').find(line => line.startsWith(tool)) ?? '';
      /*
       * Match the stub dir by its unique mkdtemp basename, not its full path:
       * the probe runs under Git Bash, whose `command -v` reports a translated
       * path (`C:\…\Temp\skills-eval-bin-XXXX` surfaces as
       * `/tmp/skills-eval-bin-XXXX`), so a full-path compare misfires and flags
       * a correctly-shadowed CLI as a breach. The basename is random per run, so
       * it cannot collide with a real CLI's path yet survives the translation.
       */
      const stubMarker = path.basename(stubDir).toLowerCase();
      const failures: string[] = [];
      /*
       * Both loops walk the policy rather than a literal list: a tool added to
       * the policy but missing from a check here would be probed and reported,
       * yet never actually enforced.
       */
      for (const tool of neededTools)
        if (lineFor(tool).includes('(absent)'))
          failures.push(`${tool} must be present`);
      for (const tool of dangerTools)
        if (
          !lineFor(tool).includes('(absent)') &&
          !lineFor(tool).toLowerCase().includes(stubMarker)
        )
          failures.push(`${tool} must be unreachable or a stub (fail-safe breach)`);
      return failures;
    },

    buildScrubbedPath: ({
      stubDir,
      sourcePath = process.env['PATH'] ?? '',
      /* Injectable so a caller can describe a host rather than inherit this one.
         Left real, it is the one non-synthetic directory a test would other-
         wise pull in — and on a single-prefix layout it both carries a danger
         CLI and supplies the needed tools, which silently changes the outcome
         the test is pinning. */
      interpreterDir = path.dirname(process.execPath),
      gitToolDirs,
    }) => {
      const entries = sourcePath.split(path.delimiter).filter(Boolean);
      const admitted = new Set(seededDirs(interpreterDir, gitToolDirs, entries));
      const missing: string[] = [];
      for (const tool of neededTools) {
        // Iterated, not spread: the Set dedupes admissions without a copy per tool.
        if (admitted.values().some(dir => hasTool(dir, tool))) continue;
        const candidates = entries.filter(
          entry => !isAggregator(entry) && hasTool(entry, tool),
        );
        const dir = candidates.find(entry => !hasDanger(entry)) ?? candidates[0];
        if (dir === undefined) missing.push(tool);
        else admitted.add(dir);
      }
      const allow = [...admitted];
      /*
       * Seeded dirs can carry a danger CLI too — Termux's $PREFIX/bin holds node
       * and gh alike — so the interlock covers everything admitted, not just
       * fallbacks.
       */
      const exposed = allow.filter(dir => hasDanger(dir));
      if (exposed.length > 0 && !isPoisoned(stubDir))
        throw new Error(
          `refusing to admit ${exposed.join(', ')}: these supply provider CLIs, ` +
          `and poisonDangerTools() has not run for ${stubDir}.`,
        );
      return { path: [stubDir, ...allow].join(path.delimiter), allow, missing };
    },

    poisonDangerTools: (stubDir) => {
      for (const tool of dangerTools) {
        /*
         * Kept to ASCII: the .cmd form is read back through the console's OEM
         * codepage, which mangles anything else.
         */
        const message =
          `eval isolation: '${tool}' is not available. The harness admits no ` +
          `real provider CLIs; ${shadowHint} if this suite needs it.`;
        writeFileSync(
          path.join(stubDir, tool),
          `#!/bin/sh\necho "${message}" >&2\nexit ${String(shadowExitCode)}\n`,
        );
        chmodSync(path.join(stubDir, tool), shadowMode);
        if (process.platform === 'win32')
          writeFileSync(
            path.join(stubDir, `${tool}.cmd`),
            `@echo off\r\necho ${cmdEscaped(message)} 1>&2\r\n` +
            `exit /b ${String(shadowExitCode)}\r\n`,
          );
      }
    },
  };
};

/*
 * OS plumbing the child chain (node → promptfoo → claude.exe → Git Bash) needs
 * to run at all — Docker gets these from its Linux base image; on the host we
 * forward them by name so nothing behavioral rides along. HOME is set separately
 * to a clean dir, so the home-pointing vars here are deliberately omitted.
 */
const windowsEssentialVars = [
  'APPDATA', 'COMPUTERNAME', 'ComSpec', 'LOCALAPPDATA',
  'NUMBER_OF_PROCESSORS', 'OS', 'PATHEXT', 'PROCESSOR_ARCHITECTURE',
  'PROCESSOR_ARCHITEW6432', 'PROGRAMDATA', 'ProgramFiles', 'ProgramFiles(x86)',
  'ProgramW6432', 'SESSIONNAME', 'SystemRoot', 'TEMP', 'TMP', 'USERDOMAIN',
  'USERNAME', 'windir',
];
const posixEssentialVars = [
  'ANDROID_DATA', 'ANDROID_ROOT', 'LANG', 'LANGUAGE', 'LD_LIBRARY_PATH',
  'LD_PRELOAD', 'LOGNAME', 'PREFIX', 'SHELL', 'TERM', 'TMPDIR', 'TZ', 'USER',
];
const osEssentialVars =
  process.platform === 'win32' ? windowsEssentialVars : posixEssentialVars;
/**
 * Auth + network config the SDK needs to reach the API; forwarded only if set.
 */
const passthroughVars = [
  'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'HTTP_PROXY', 'http_proxy',
  'HTTPS_PROXY', 'https_proxy', 'NODE_EXTRA_CA_CERTS', 'NO_PROXY', 'no_proxy',
];
/**
 * Length of a Windows drive prefix (`C:`) when splitting HOME into drive+path.
 */
const winDrivePrefixLength = 2;

/**
 * Constructs the eval env from scratch (allowlist), rather than inheriting the
 * caller's. Only OS plumbing, auth/network config, PATH/STUB_BINDIR, and a clean
 * HOME go in — so behavioral vars from the surrounding session never reach the
 * eval agent. Policy-free: nothing here depends on which tools are admitted.
 */
export const buildEvalEnv = ({
  scrubbedPath,
  stubDir,
  homeDir,
  sourceEnv = process.env,
}: {
  scrubbedPath: string;
  stubDir: string;
  homeDir: string;
  sourceEnv?: NodeJS.ProcessEnv;
}): Record<string, string> => {
  const env: Record<string, string> = {
    CLAUDE_CODE_EXECUTABLE: claudeExecutable(sourceEnv),
    HOME: homeDir,
    PATH: scrubbedPath,
    STUB_BINDIR: stubDir,
  };
  for (const name of [...osEssentialVars, ...passthroughVars]) {
    const value = sourceEnv[name];
    if (value !== undefined) env[name] = value;
  }
  if (process.platform !== 'win32')
    for (const [name, value] of Object.entries(sourceEnv))
      if (value !== undefined && name.startsWith('LC_')) env[name] = value;
  if (process.platform === 'win32') {
    env['USERPROFILE'] = homeDir;
    env['HOMEDRIVE'] = homeDir.slice(0, winDrivePrefixLength);
    env['HOMEPATH'] = homeDir.slice(winDrivePrefixLength);
  }
  return env;
};
