#!/bin/sh
# Generic in-container entrypoint. run-evals.ts installs the running skill's
# test-double CLIs (evals/<name>/bin/<cmd>-stub.ts) into STUB_BINDIR — only the active
# skill's, so no cross-skill collision — and the real CLIs are never installed,
# so mocked services can't be reached. All args are forwarded (skill filter,
# --share, etc.).
set -e

export STUB_BINDIR=/usr/local/bin

pnpm run skills:sync
exec node scripts/run-evals.ts "$@"
