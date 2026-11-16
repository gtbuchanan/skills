/*
 * Runs one suite in its own process: sets it up, launches it, streams a
 * progress line as each test finishes, and captures the full output for a
 * failure dump. Launching and reporting are passed in, so the runner's
 * bookkeeping can be tested without spawning promptfoo.
 */
import { stripVTControlCharacters } from 'node:util';
import { type SuiteSetupSteps, setUpSuite } from './suite-setup.ts';

/**
 * Marks a suite failed when its process reported no code of its own: setup
 * failed before launching it, or a signal ended it.
 */
const failedExitCode = 1;
/* promptfoo logs one of these per finished test, but only at debug level in a
 * non-TTY run (otherwise it's the TTY bar). Only this line is streamed, so each
 * suite reports per-test progress without the rest of the debug noise. */
const perTestLog = /Eval #\d+ complete \((?<done>\d+) of (?<total>\d+)\)/v;
const newline = /\r?\n/v;

export interface SuiteResult {
  readonly name: string;
  readonly code: number;
  readonly out: string;
  readonly workspace: string;
}

/**
 * The part of a child process a suite run reads.
 */
export interface SuiteProcess {
  readonly stdout: NodeJS.ReadableStream | null;
  readonly stderr: NodeJS.ReadableStream | null;
  on: (event: 'close', listener: (code: number | null) => void) => unknown;
}

export interface SuiteRunSteps extends SuiteSetupSteps {
  /**
   * Starts the suite's process under `env`.
   */
  readonly launch: (env: Record<string, string>) => SuiteProcess;
  /**
   * Reports one finished test, as `[suite] done/total`.
   */
  readonly progress: (line: string) => void;
}

/* Builds a stdout/stderr handler that reports each finished test, buffering
 * partial lines across chunks. */
const perTestStreamer = (
  name: string,
  progress: (line: string) => void,
): ((chunk: Buffer | string) => void) => {
  let pending = '';
  return (chunk) => {
    pending += String(chunk);
    const lines = pending.split(newline);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      const groups = perTestLog.exec(stripVTControlCharacters(line))?.groups;
      if (groups !== undefined)
        progress(`[${name}] ${groups['done'] ?? ''}/${groups['total'] ?? ''}`);
    }
  };
};

/**
 * Runs suite `name` to completion. A suite that cannot be set up fails alone,
 * without launching.
 */
export const runSuite = async (name: string, steps: SuiteRunSteps): Promise<SuiteResult> => {
  const setup = setUpSuite(name, steps);
  if (setup.kind === 'failed')
    return { code: failedExitCode, name, out: setup.out, workspace: setup.workspace };

  const { env, workspace } = setup;
  return new Promise<SuiteResult>((resolve) => {
    const child = steps.launch({ ...env, EVAL_WORKSPACE: workspace, LOG_LEVEL: 'debug' });
    let out = '';
    const stream = perTestStreamer(name, steps.progress);
    const onData = (chunk: Buffer | string): void => {
      out += String(chunk);
      stream(chunk);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('close', (code) => {
      resolve({ code: code ?? failedExitCode, name, out, workspace });
    });
  });
};
