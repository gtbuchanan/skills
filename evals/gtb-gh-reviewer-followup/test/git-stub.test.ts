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
import path from 'node:path';
import { test } from 'vitest';

const stub = path.join(import.meta.dirname, '..', 'bin', 'git-stub.ts');

interface Run {
  readonly status: number | undefined;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * One `git` invocation, as the agent would make it.
 *
 * STUB_LOG is deliberately left unset: the call log is the checker's input, and
 * nothing here is asserting about it.
 */
const git = (...args: readonly string[]): Run => {
  const result = spawnSync(process.execPath, [stub, ...args], {
    encoding: 'utf8',
  });

  return {
    status: result.status ?? undefined,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

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
