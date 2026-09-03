# Generic Linux image for running the eval harness in a deterministic shell.
# It contains no skill specifics — just Node, pnpm, and the repo's eval deps.
# Each suite mounts its own source at run time and supplies any test doubles
# (e.g. a fake gh); real provider CLIs are never installed, so a suite that
# mocks one physically cannot reach the real service.
#
# git is the deliberate exception, and not a hole in that: it is in the
# harness's `neededTools` rather than its `dangerTools`
# because it reaches no service on its own. A suite that wants a real checkout
# seeds one locally and shadows `git` with its own recorder, exactly as the
# native runner does — and the base image ships no git at all, so without this
# that suite fails to seed.
#
# The first stage reduces the context to the files pnpm needs to resolve the
# workspace, so the install below depends on manifests and nothing else. It
# takes the whole context and deletes rather than naming what to keep: a glob
# cannot express "one package.json per package" (Docker flattens
# `evals/*/package.json` onto a single destination, losing the directory that
# names each one), and enumerating them leaves a list that a new suite has to
# remember to join. This stage re-runs on any source edit and costs a copy;
# what it emits is byte-identical unless a manifest moved, so the install layer
# stays cached through ordinary work on a suite.
FROM node:24-bookworm-slim AS manifests

WORKDIR /src

COPY . .
RUN find . -type f \
      ! -name package.json \
      ! -name pnpm-workspace.yaml \
      ! -name pnpm-lock.yaml \
      ! -name .pnpmfile.cjs \
      -delete \
  && find . -mindepth 1 -type d -empty -delete

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
#
# Every workspace package's manifest comes too, and must: pnpm-workspace.yaml
# declares them, the root depends on the harness as `workspace:*`, and an
# install that cannot find the package it is told to link fails. Manifests
# only — the sources are bind-mounted at run time so a host edit is what the
# container executes, rather than whatever was baked into the image.
COPY --from=manifests /src ./
# `prepare` deploys authored skills to the agent directories on the machine,
# and an image has none — so skills-npm finds skills it cannot place and exits
# non-zero, failing the build. It was silent before this became a workspace:
# with no `packages:` globs it scanned nothing and had nothing to deploy.
# Dropped rather than installing with --ignore-scripts, which would also skip
# dependencies' own install scripts. The container runs evals; it never
# deploys.
RUN pnpm pkg delete scripts.prepare \
  && pnpm install --no-frozen-lockfile
