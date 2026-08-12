/*
 * Tests for the isolation primitives.
 *
 * These declare their own policy rather than importing the repo's, so they
 * describe the mechanism instead of today's tool list — adding `kubectl` to the
 * eval policy should not edit a single assertion here. They run entirely on
 * synthetic directories and a fake spawn, so they assert the same properties on
 * every host: no container, no network, and no dependency on which CLIs the
 * developer happens to have installed. That matters more than usual here — the
 * failure this module exists to prevent is silent, and a self-test that only
 * ever passes would not notice losing it.
 *
 * That is also why every case injects both seeds. They are admitted
 * unconditionally, so left real they are the only non-synthetic directories
 * these would depend on — the interpreter's own dir, which on a single-prefix
 * host both carries a danger CLI and supplies the needed tools, and the Git
 * tool dirs, which on Windows come from whatever Git install is present. Either
 * decides the outcome before the fixture gets a say.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import { createIsolation } from '#scripts/scrubbed-path.ts';

const dangerTools = ['az', 'gh'];
const neededTools = ['pnpm'];
const { assertFailSafe, buildScrubbedPath, poisonDangerTools } = createIsolation({
  dangerTools,
  neededTools,
});

/**
 * Width the probe pads each tool name to, matching its `printf '%-12s'`.
 */
const toolColumnWidth = 12;

/**
 * A disposable directory holding an empty file per named tool. Extensionless
 * names match on both platforms: the Windows extension list includes the empty
 * string, so `hasTool` finds a bare `pnpm` either way.
 */
const toolDir = (...tools: string[]): Disposable & { readonly dir: string } => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scrubbed-path-test-'));

  for (const tool of tools) writeFileSync(path.join(dir, tool), '');

  return {
    dir,
    [Symbol.dispose]: () => {
      rmSync(dir, { force: true, recursive: true });
    },
  };
};

/**
 * A spawnSync stand-in returning the probe output `assertFailSafe` parses:
 * one line per tool, the name padded, then its resolved path or `(absent)`.
 */
const fakeRun = (resolved: Record<string, string>) => () => ({
  /* eslint-disable-next-line unicorn/no-null --
     spawnSync's return type declares `signal: NodeJS.Signals | null`, so the
     stand-in has to match it. */
  signal: null,
  status: 0,
  output: [],
  pid: 0,
  stderr: '',
  stdout: Object.entries(resolved)
    .map(([tool, where]) => `${tool.padEnd(toolColumnWidth)}${where}`)
    .join('\n'),
});

const toolchainPresent = { pnpm: '/usr/bin/pnpm' };
const providersAbsent = { az: '(absent)', gh: '(absent)' };
const stubDirPath = '/elsewhere/skills-eval-bin-ABC123';

test('admits a directory that supplies a needed tool', ({ expect }) => {
  using interpreter = toolDir();
  using prefix = toolDir('pnpm');
  using stub = toolDir();

  expect(buildScrubbedPath({
    gitToolDirs: [],
    interpreterDir: interpreter.dir,
    sourcePath: prefix.dir,
    stubDir: stub.dir,
  }).allow).toContain(prefix.dir);
});

test('reports a needed tool no admitted directory supplies', ({ expect }) => {
  using interpreter = toolDir();
  using empty = toolDir();
  using stub = toolDir();

  expect(buildScrubbedPath({
    gitToolDirs: [],
    interpreterDir: interpreter.dir,
    sourcePath: empty.dir,
    stubDir: stub.dir,
  }).missing).toContain('pnpm');
});

test('refuses an unshadowed directory that also carries a provider CLI', ({ expect }) => {
  /*
   * The single-prefix case: one directory supplies a tool the skills need AND
   * one they must never reach, so no subset of directories separates them.
   */
  using interpreter = toolDir();
  using prefix = toolDir('pnpm', 'gh');
  using stub = toolDir();

  expect(() => buildScrubbedPath({
    gitToolDirs: [],
    interpreterDir: interpreter.dir,
    sourcePath: prefix.dir,
    stubDir: stub.dir,
  })).toThrow(/refusing to admit/v);
});

test('admits that same directory once the shadows are planted', ({ expect }) => {
  using interpreter = toolDir();
  using prefix = toolDir('pnpm', 'gh');
  using stub = toolDir();

  poisonDangerTools(stub.dir);

  expect(buildScrubbedPath({
    gitToolDirs: [],
    interpreterDir: interpreter.dir,
    sourcePath: prefix.dir,
    stubDir: stub.dir,
  }).allow).toContain(prefix.dir);
});

test('holds the interlock over a seeded directory too', ({ expect }) => {
  /*
   * The seeds are admitted without consulting the source PATH, so they bypass
   * the candidate filtering entirely — and on a single-prefix host the
   * interpreter's own dir is exactly the one carrying a danger CLI. Termux is
   * that host: node, bash, git and gh all sit in $PREFIX/bin.
   */
  using interpreter = toolDir('pnpm', 'gh');
  using stub = toolDir();

  expect(() => buildScrubbedPath({
    gitToolDirs: [],
    interpreterDir: interpreter.dir,
    sourcePath: '',
    stubDir: stub.dir,
  })).toThrow(/refusing to admit/v);
});

test('seeds the git tool dirs it is given', ({ expect }) => {
  /*
   * Pins that the option is consumed rather than decorative. Injecting an empty
   * list cannot show this: on a host with Git installed the real seeds carry no
   * danger CLI and supply nothing this policy needs, so ignoring the option
   * would look identical. A seeded dir carrying one is the difference.
   */
  using interpreter = toolDir();
  using gitDir = toolDir('gh');
  using stub = toolDir();

  expect(() => buildScrubbedPath({
    gitToolDirs: [gitDir.dir],
    interpreterDir: interpreter.dir,
    sourcePath: '',
    stubDir: stub.dir,
  })).toThrow(/refusing to admit/v);
});

test('admits a seeded directory once the shadows are planted', ({ expect }) => {
  // Which is what lets the harness run at all on a single-prefix layout.
  using interpreter = toolDir('pnpm', 'gh');
  using stub = toolDir();

  poisonDangerTools(stub.dir);

  expect(buildScrubbedPath({
    gitToolDirs: [],
    interpreterDir: interpreter.dir,
    sourcePath: '',
    stubDir: stub.dir,
  }).allow).toContain(interpreter.dir);
});

test('holds the interlock against a partially shadowed stub dir', ({ expect }) => {
  /*
   * The shadows are what make admitting such a directory safe, so the check has
   * to cover the whole policy: a stub dir carrying all but one danger CLI still
   * leaves that one reachable.
   */
  using interpreter = toolDir();
  using prefix = toolDir('pnpm', 'gh');
  using stub = toolDir('az');

  expect(() => buildScrubbedPath({
    gitToolDirs: [],
    interpreterDir: interpreter.dir,
    sourcePath: prefix.dir,
    stubDir: stub.dir,
  })).toThrow(/refusing to admit/v);
});

test('never admits an aggregator directory', ({ expect }) => {
  /*
   * Shim dirs re-export every tool, danger CLIs included, so admitting one
   * defeats the narrowing. The pattern matches on the directory's own name,
   * so this one is built by hand rather than by mkdtemp.
   */
  using interpreter = toolDir();
  using root = toolDir();
  using stub = toolDir();
  const shims = path.join(root.dir, 'mise', 'shims');

  mkdirSync(shims, { recursive: true });
  writeFileSync(path.join(shims, 'pnpm'), '');

  const scrubbed = buildScrubbedPath({
    gitToolDirs: [],
    interpreterDir: interpreter.dir,
    sourcePath: shims,
    stubDir: stub.dir,
  });

  expect(scrubbed.allow).not.toContain(shims);
  expect(scrubbed.missing).toContain('pnpm');
});

test('plants a shadow that fails for every provider CLI in the policy', ({ expect }) => {
  using stub = toolDir();

  poisonDangerTools(stub.dir);

  for (const tool of dangerTools)
    expect(readFileSync(path.join(stub.dir, tool), 'utf8')).toMatch(/exit 127/v);
});

test('fail-safe passes when the toolchain is present and providers absent', ({ expect }) => {
  expect(assertFailSafe({
    run: fakeRun({ ...toolchainPresent, ...providersAbsent }),
    scrubbedPath: '/irrelevant',
    stubDir: stubDirPath,
  })).toStrictEqual([]);
});

test('fail-safe reports a reachable provider CLI as a breach', ({ expect }) => {
  const failures = assertFailSafe({
    run: fakeRun({
      ...toolchainPresent,
      ...providersAbsent,
      gh: '/usr/local/bin/gh',
    }),
    scrubbedPath: '/irrelevant',
    stubDir: stubDirPath,
  });

  expect(failures).toStrictEqual(['gh must be unreachable or a stub (fail-safe breach)']);
});

test('fail-safe enforces every provider CLI the policy names', ({ expect }) => {
  /*
   * The checks walk the policy rather than a literal list, so a CLI added to it
   * is enforced rather than merely probed — the silent gap being guarded here.
   */
  const extended = createIsolation({
    dangerTools: [...dangerTools, 'kubectl'],
    neededTools,
  });
  const failures = extended.assertFailSafe({
    run: fakeRun({
      ...toolchainPresent,
      ...providersAbsent,
      kubectl: '/usr/local/bin/kubectl',
    }),
    scrubbedPath: '/irrelevant',
    stubDir: stubDirPath,
  });

  expect(failures).toStrictEqual([
    'kubectl must be unreachable or a stub (fail-safe breach)',
  ]);
});

test('fail-safe accepts a provider CLI resolved inside the stub dir', ({ expect }) => {
  /*
   * Regression: the probe runs under Git Bash, whose `command -v` reports a
   * translated path, so the directory it names differs from the stub dir while
   * the mkdtemp basename survives. Matching on the full path flagged every
   * correctly-shadowed CLI as a breach and aborted the run before any suite
   * started.
   *
   * The two paths differ in directory and agree only on that basename, which
   * is the property under test — spelling the real Windows stub dir here would
   * instead assert that POSIX `path.basename` splits on a backslash, which it
   * does not.
   */
  expect(assertFailSafe({
    run: fakeRun({
      ...toolchainPresent,
      ...providersAbsent,
      gh: '/tmp/skills-eval-bin-ABC123/gh',
    }),
    scrubbedPath: '/irrelevant',
    stubDir: stubDirPath,
  })).toStrictEqual([]);
});

test('fail-safe reports a missing member of the toolchain', ({ expect }) => {
  expect(assertFailSafe({
    run: fakeRun({ ...providersAbsent, pnpm: '(absent)' }),
    scrubbedPath: '/irrelevant',
    stubDir: stubDirPath,
  })).toStrictEqual(['pnpm must be present']);
});
