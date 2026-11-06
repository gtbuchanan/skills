#!/usr/bin/env node
/*
 * Fake `git` for this eval — and it answers nothing.
 *
 * This suite models no repository. The dependent skills are mocked, the working
 * directory is the runner's skills workspace rather than a checkout, and the
 * prompt tells the agent it is already in the PR's checkout and not to run git.
 * So there is no world here for a git call to be true against, and nothing to
 * pass one through to either — which is what separates this from the doubles
 * built on `@gtbuchanan/cli-doubles/passthrough`, whose suites seed a real
 * checkout precisely so the real git can answer.
 *
 * That leaves only what to say when a call arrives, and success is the one
 * answer that must not be given. `status` would report a clean tree, `log` no
 * history, `diff` nothing changed — each of them invented, each of them acted
 * on, and every assertion about what the run *called* still passing. So it
 * refuses: the honest answer, and the loud one.
 *
 * Logged before it is refused, because a call this suite did not expect is
 * exactly what an author wants to find in the record.
 *
 * Installed as `git` at the front of the eval PATH by the runner.
 */
import { passThrough } from '@gtbuchanan/cli-doubles/passthrough';
import { requireRealTool } from '@gtbuchanan/cli-doubles/real-tool';
import { argv, emit, joined, logCallToRun } from '@gtbuchanan/cli-doubles/stub';
import { claudeCode } from '@gtbuchanan/eval-agents/claude-code';
import { hermeticGitEnv } from '@gtbuchanan/git-fixtures/hermetic-git';
import { isAgentRuntimeCall } from '@gtbuchanan/promptfoo-agent/agents';

/* The agent runtime's own git calls, such as Claude Code's at startup. They
   are not the agent's, so the real git answers them and nothing records them;
   refused, every run would count a gap the agent never reached. */
if (isAgentRuntimeCall([claudeCode], 'git', argv))
  process.exit(passThrough({ argv, binary: requireRealTool('git'), env: hermeticGitEnv() }));

/**
 * Exit status for a call the double cannot answer. Any non-zero would do; 1 is
 * what git uses for an ordinary failure.
 */
const refusedExit = 1;

const log = logCallToRun('git');

emit({
  call: { argv, cmd: 'git', stdin: '' },
  code: refusedExit,
  kind: 'refused',
  reason: 'no repository is modelled',
  stderr:
    `git-stub: no canned response for "git ${joined}". This suite models no ` +
    'repository, and the run was told the checkout is already in place. Model ' +
    'the command rather than letting the call return empty success.\n',
  stdout: '',
}, log);
