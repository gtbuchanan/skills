# Generic Linux image for running the eval harness in a deterministic shell.
# It contains no skill specifics — just Node, pnpm, and the repo's eval deps.
# Each suite mounts its own source at run time and supplies any test doubles
# (e.g. a fake gh); real provider CLIs are never installed, so a suite that
# mocks one physically cannot reach the real service.
#
# git is the deliberate exception, and not a hole in that: it is in the
# harness's `neededTools` rather than its `dangerTools` (scripts/eval-isolation.ts)
# because it reaches no service on its own. A suite that wants a real checkout
# seeds one locally and shadows `git` with its own recorder, exactly as the
# native runner does — and the base image ships no git at all, so without this
# that suite fails to seed.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /work

# Bake deps (Linux build → pulls the SDK's linux-x64 binary). --no-frozen-lockfile
# lets the Windows-authored lockfile resolve linux-only optional deps. The
# pnpmfile ships too: it is a no-op here (its os-ungating only matters on
# Android) but pnpm warns when a lockfile was built with hooks that are absent.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .pnpmfile.cjs ./
RUN pnpm install --no-frozen-lockfile
