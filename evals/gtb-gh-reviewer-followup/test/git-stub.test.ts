/*
 * Tests for the fake `git` this orchestration suite runs the skill against.
 *
 * This suite models no repository at all: the dependent skills are mocked, the
 * working directory is the runner's skills workspace, and the prompt tells the
 * agent the checkout is already in place and not to run git. So every git call
 * that arrives here is out of contract, and the only question is what the
 * double says about one.
 *
 * Success is the one answer it must not give. That is the worst outcome
 * available to a double — `status` reporting a clean tree, `log` reporting no
 * history, `diff` reporting nothing changed, each of them confidently and each
 * of them invented — and every assertion about what the run *called* still
 * passes, so the suite reports success for a run that deserved to fail.
 *
 * Each case spawns a process and is still cheap enough for the fast bucket,
 * which is where they belong: refusing is the whole of what this double does,
 * so a refusal that stopped happening has to fail the gate that runs on every
 * check rather than the one that runs later.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';

const stub = path.join(import.meta.dirname, '..', 'bin', 'git-stub.ts');

interface Run {
  readonly logged: boolean;
  readonly status: number | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * One `git` invocation, with a log of its own so a case can tell whether the
 * call was recorded.
 */
const git = (...args: readonly string[]): Run => {
  const dir = mkdtempSync(path.join(tmpdir(), 'git-stub-'));
  const log = path.join(dir, 'calls.jsonl');
  const result = spawnSync(process.execPath, [stub, ...args], {
    encoding: 'utf8',
    env: { ...process.env, STUB_LOG: log },
  });

  return {
    logged: existsSync(log),
    status: result.status ?? undefined,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

test('the agent runtime\'s own git calls are answered, not refused or recorded', ({
  expect,
}) => {
  /*
   * Claude Code runs these itself at startup, with hooks disabled. They are
   * not the agent's, so refusing and recording them would count against every
   * run a gap the agent never reached.
   */
  const result = git('-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=', '--version');

  expect(result).toMatchObject({ logged: false, status: 0 });
  expect(result.stdout).toContain('git version');
});

test('the runtime\'s exec-path probe is answered too', ({ expect }) => {
  expect(git('--exec-path')).toMatchObject({ logged: false, status: 0 });
});

test('a call from the agent is still recorded', ({ expect }) => {
  expect(git('status').logged).toBe(true);
});

test('a read this suite models nothing for fails loudly', ({ expect }) => {
  /* The reads are the dangerous ones: an invented "clean" answer is one an
     agent acts on, and a checker asserting on calls cannot see that it did. */
  const result = git('status', '--porcelain');

  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe('');
});

test('the refusal names the call that was not modelled', ({ expect }) => {
  /* Named verbatim because the author's next move is to decide whether this
     suite should model that command or stop making it. */
  const result = git('pull', '--ff-only');

  expect(result.stderr).toContain('pull --ff-only');
});
