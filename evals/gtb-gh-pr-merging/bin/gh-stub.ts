#!/usr/bin/env node
/*
 * `gh` for this eval: the real gh, against the fake GitHub setup.ts runs.
 *
 * Spike. This double invents nothing: it records the call, then hands it to
 * the real gh (GH_REAL, named by the runner) with an environment pointing
 * every request at the fake. What gh prints, and with what status, is gh's.
 *
 * The scenario is found the way every double here finds it, from the marker
 * above the working directory, and travels to the fake in the token with the
 * call and its run, so whatever the fake refuses is recorded beside it.
 *
 * The environment is built from an allowlist rather than inherited, so that
 * nothing the caller carries — a token, a host, a proxy exemption — can point
 * gh anywhere but the fake.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hermeticGitConfig, resolveRealGit } from '@gtbuchanan/git-fixtures/real-git';
import { fakeGhEnv } from '@gtbuchanan/github-api-fake/gh-env';
import { stdinBody } from '@gtbuchanan/github-cli-stub/body';
import { exitCodeFrom } from '@gtbuchanan/stub-runtime/passthrough';
import { runVar } from '@gtbuchanan/stub-runtime/run-log';
import { locateScenario } from '@gtbuchanan/stub-runtime/scenario';
import { argv, logCallToRun } from '@gtbuchanan/stub-runtime/stub';
import spawn from 'cross-spawn';
import { scenarios } from '#src/scenarios.ts';

const located = locateScenario(scenarios, process.cwd());
const stdin = stdinBody(argv);
logCallToRun('gh', stdin);
const run = process.env[runVar];

const realGh = process.env['GH_REAL'];
const port = Number(process.env['GITHUB_FAKE_PORT']);
if (realGh === undefined || !Number.isSafeInteger(port) || port <= 0) {
  process.stderr.write('gh-stub: GH_REAL and GITHUB_FAKE_PORT must both be set\n');
  process.exit(1);
}

/**
 * What gh needs from this process to start, and nothing that could carry a
 * credential or point it anywhere.
 */
const inherited = [
  'HOME', 'PATH', 'Path', 'STUB_BINDIR', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE',
];

/* The real git first, so gh's own git calls (remotes, branches) go straight
   to it rather than through the recording double, and are not logged as the
   agent's. */
const realGitDir = path.dirname(resolveRealGit());
const inheritedPath = process.env['PATH'] ?? process.env['Path'] ?? '';
const pathValue = [realGitDir, inheritedPath].join(path.delimiter);

const ghDir = mkdtempSync(path.join(tmpdir(), 'gh-run-'));
const caller = { argv, ...(run !== undefined && { run }), world: located.scenario.key };

const env = {
  ...Object.fromEntries(
    inherited.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  ),
  ...hermeticGitConfig,
  ...fakeGhEnv({
    dir: ghDir,
    port,
    caller,
  }),
  PATH: pathValue,
};

/* A body read for the log is handed on; otherwise gh reads standard input
   itself, if it reads it at all. */
const result = spawn.sync(realGh, argv, stdin === ''
  ? { env, stdio: 'inherit' }
  : { env, input: stdin, stdio: ['pipe', 'inherit', 'inherit'] });
process.exitCode = exitCodeFrom(result.status);
