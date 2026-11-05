#!/bin/sh
# Generic in-container entrypoint. run-evals.ts installs the running skill's
# test-double CLIs (evals/<name>/bin/<cmd>-stub.ts) into STUB_BINDIR — only the active
# skill's, so no cross-skill collision — and no real CLI is on PATH, so mocked
# services can't be reached through them. The one installed, gh, is off PATH,
# for the gh double to point at the fake GitHub. All args are forwarded (skill
# filter, --share, etc.).
set -e

export STUB_BINDIR=/usr/local/bin

pnpm run skills:sync
exec node packages/eval-runner/bin/run-evals.ts "$@"
