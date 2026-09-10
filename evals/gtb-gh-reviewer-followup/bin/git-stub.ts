#!/usr/bin/env node
/*
 * Fake `git` for this eval — and it answers nothing.
 *
 * This suite models no repository. The dependent skills are mocked, the working
 * directory is the runner's skills workspace rather than a checkout, and the
 * prompt tells the agent it is already in the PR's checkout and not to run git.
 * So there is no world here for a git call to be true against, and nothing to
 * pass one through to either — which is what separates this from the doubles
 * built on `@gtbuchanan/stub-runtime/passthrough`, whose suites seed a real
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
import { emit, joined, logCall } from '@gtbuchanan/stub-runtime/stub';

/**
 * Exit status for a call the double cannot answer. Any non-zero would do; 1 is
 * what git uses for an ordinary failure.
 */
const refusedExit = 1;

logCall('git');

emit({
  code: refusedExit,
  stderr:
    `git-stub: no canned response for "git ${joined}". This suite models no ` +
    'repository, and the run was told the checkout is already in place. Model ' +
    'the command rather than letting the call return empty success.\n',
  stdout: '',
});
