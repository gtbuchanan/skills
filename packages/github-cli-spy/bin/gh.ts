#!/usr/bin/env node
/* v8 ignore file -- runs as its own process, which coverage does not see;
   test/gh.test.ts drives it through real gh calls, and src/handoff.ts holds
   its decisions where fast tests reach them. */
/*
 * `gh` for a suite whose GitHub is the fake: the real gh, against the world of
 * the workspace the call is made in.
 *
 * Invents nothing. It records the call, then hands it to the real gh with an
 * environment pointing every request at the fake, so what gh prints, and with
 * what status, is gh's. A suite installs it with a `bin/gh-stub.ts` that
 * imports this module.
 *
 * The world and the calling run travel to the fake in the token, so whatever
 * the fake refuses is recorded beside the call that caused it.
 *
 * Each call gets its own directory for gh's config, cache and state. gh caches
 * API answers for a day, and on Windows shares that cache with the developer's
 * own gh by default.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exitCodeFrom } from '@gtbuchanan/cli-doubles/passthrough';
import { requireRealTool } from '@gtbuchanan/cli-doubles/real-tool';
import { runVar } from '@gtbuchanan/cli-doubles/run-log';
import { argv, logCallToRun } from '@gtbuchanan/cli-doubles/stub';
import { stdinBody } from '../src/body.ts';
import { realGhEnv } from '../src/env.ts';
import { handoff } from '../src/handoff.ts';

const stdin = stdinBody(argv);
logCallToRun('gh', stdin);

const target = handoff(process.cwd(), process.env);

if (target.kind === 'refused') {
  process.stderr.write(`gh: ${target.reason}\n`);
  process.exitCode = 1;
} else {
  const run = process.env[runVar];
  const callDir = mkdtempSync(path.join(tmpdir(), 'gh-call-'));
  const env = realGhEnv({
    caller: { argv, ...(run !== undefined && { context: run }), world: target.world },
    dir: callDir,
    port: target.port,
    realGit: requireRealTool('git'),
    sourceEnv: process.env,
  });

  /* A body read for the log is handed on; otherwise gh reads standard input
     itself, if it reads it at all. */
  const result = spawnSync(target.realGh, argv, stdin === ''
    ? { env, stdio: 'inherit' }
    : { env, input: stdin, stdio: ['pipe', 'inherit', 'inherit'] });
  process.exitCode = exitCodeFrom(result.status);
}
