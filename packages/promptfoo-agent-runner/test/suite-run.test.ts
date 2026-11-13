/*
 * Tests for running one suite's process.
 *
 * The process is a fake: two streams and a close listener, which each test writes
 * to and then closes, so what the runner captures and reports is driven exactly.
 *
 * `expect` comes from the test context rather than the import, so the shared
 * setup's per-test assertion count sees it.
 */
import { PassThrough } from 'node:stream';
import { test } from 'vitest';
import { type SuiteProcess, type SuiteRunSteps, runSuite } from '#src/suite-run.ts';

const env = { PATH: '/scrubbed' };
const workspace = '/tmp/skills-eval-ws-1';

/**
 * The close listener before the runner registers its own.
 */
const notListening = (): void => {
  // Replaced once the runner listens.
};

interface FakeSuite {
  /**
   * Every env the suite was launched under.
   */
  readonly launches: Record<string, string>[];
  /**
   * Every progress line reported.
   */
  readonly progress: string[];
  readonly steps: SuiteRunSteps;
  /**
   * Writes `chunks` to the process's stdout, in order, then closes it with `code`,
   * once the suite has launched.
   */
  readonly finish: (code: number | null, chunks?: readonly string[]) => void;
  /**
   * Writes `chunk` to the process's stderr, once the suite has launched.
   */
  readonly writeStderr: (chunk: string) => void;
}

const fakeSuite = (
  populateWorkspace: SuiteRunSteps['populateWorkspace'] = () => {
    // Populates without complaint.
  },
): FakeSuite => {
  const launches: Record<string, string>[] = [];
  const progress: string[] = [];
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let onClose: (code: number | null) => void = notListening;
  /* A real process writes nothing before it starts, so this one holds each write
   * until the runner has launched it and is listening. */
  const held: (() => void)[] = [];
  let isLaunched = false;
  const afterLaunch = (write: () => void): void => {
    if (isLaunched) write();
    else held.push(write);
  };
  const child: SuiteProcess = {
    on: (_event, listener) => {
      onClose = listener;
    },
    stderr,
    stdout,
  };
  return {
    finish: (code, chunks = []) => {
      afterLaunch(() => {
        for (const chunk of chunks) stdout.write(chunk);
        setImmediate(() => {
          onClose(code);
        });
      });
    },
    launches,
    progress,
    steps: {
      isolatedEnv: () => ({ env }),
      loadConfig: () => Promise.resolve({ env: [] }),
      launch: (launchEnv) => {
        launches.push(launchEnv);
        isLaunched = true;
        setImmediate(() => {
          for (const write of held) write();
        });
        return child;
      },
      mintWorkspace: () => workspace,
      populateWorkspace,
      progress: (line) => {
        progress.push(line);
      },
    },
    writeStderr: (chunk) => {
      afterLaunch(() => {
        stderr.write(chunk);
      });
    },
  };
};

test('a suite that cannot be set up fails with its error as output', async ({ expect }) => {
  const suite = fakeSuite(() => {
    throw new Error('skills add failed');
  });

  const result = await runSuite('broken', suite.steps);

  expect(result).toStrictEqual({
    code: 1,
    name: 'broken',
    out: 'Error: skills add failed',
    workspace,
  });
});

test('a suite that cannot be set up is never launched', async ({ expect }) => {
  const suite = fakeSuite(() => {
    throw new Error('skills add failed');
  });

  await runSuite('broken', suite.steps);

  expect(suite.launches).toStrictEqual([]);
});

test('a suite runs against its workspace with debug logging', async ({ expect }) => {
  const suite = fakeSuite();
  const run = runSuite('fine', suite.steps);
  suite.finish(0);
  await run;

  expect(suite.launches).toStrictEqual([
    { ...env, EVAL_WORKSPACE: workspace, LOG_LEVEL: 'debug' },
  ]);
});

test('a suite reports the exit code its process closed with', async ({ expect }) => {
  const suite = fakeSuite();
  const run = runSuite('fine', suite.steps);
  suite.finish(3);
  const { code } = await run;

  expect(code).toBe(3);
});

test('a suite whose process closes without a code fails', async ({ expect }) => {
  const suite = fakeSuite();
  const run = runSuite('fine', suite.steps);
  /* eslint-disable-next-line unicorn/no-null --
     A child process that exits on a signal closes with a null code. */
  suite.finish(null);
  const { code } = await run;

  expect(code).toBe(1);
});

test('a suite captures both output streams', async ({ expect }) => {
  const suite = fakeSuite();
  const run = runSuite('fine', suite.steps);
  suite.writeStderr('warned\n');
  suite.finish(0, ['said\n']);
  const { out } = await run;

  expect(out).toBe('warned\nsaid\n');
});

test('a suite reports progress as each test completes', async ({ expect }) => {
  const suite = fakeSuite();
  const run = runSuite('fine', suite.steps);
  suite.finish(0, ['noise\n', 'Eval #1 complete (1 of 2)\n', 'Eval #2 complete (2 of 2)\n']);
  await run;

  expect(suite.progress).toStrictEqual(['[fine] 1/2', '[fine] 2/2']);
});

test('a completion line split across chunks is reported once', async ({ expect }) => {
  const suite = fakeSuite();
  const run = runSuite('fine', suite.steps);
  suite.finish(0, ['Eval #1 compl', 'ete (1 of 1)\n']);
  await run;

  expect(suite.progress).toStrictEqual(['[fine] 1/1']);
});

test('a completion line with colour inside it is reported', async ({ expect }) => {
  const suite = fakeSuite();
  const run = runSuite('fine', suite.steps);
  suite.finish(0, ['Eval #1 complete (\u{1B}[1m1\u{1B}[0m of 1)\n']);
  await run;

  expect(suite.progress).toStrictEqual(['[fine] 1/1']);
});
