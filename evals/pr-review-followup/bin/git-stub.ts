#!/usr/bin/env node
/*
 * Fake `git` for the pr-review-followup eval. The prompt tells the agent it is
 * already in the checkout (skip worktree setup/teardown), but this no-op stub is
 * a safety net so any stray git call (e.g. a `git pull --ff-only`) succeeds
 * quietly instead of touching a real repo. Every call is logged to $STUB_LOG.
 *
 * Installed as `git` at the front of the eval PATH by the runner.
 */
import { logCall } from '#lib/stub.ts';

logCall('git');

// no output, success for every subcommand
process.exit(0);
