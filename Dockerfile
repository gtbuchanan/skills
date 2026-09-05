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

# Named so a fresh install can be aimed here alone
# (`--no-cache-filter=runtime`) rather than at a bare `--no-cache`, which
# re-exports every layer. Both discard the store below, so either is for
# proving a cold build works rather than for iterating.
FROM node:24-bookworm-slim AS runtime

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
#
# The store sits on a cache mount, which outlives this layer: when a manifest
# or the lockfile moves, only what actually changed is pulled again. That is a
# correctness measure before a speed one — the agent SDK ships its native CLI
# as a ~90 MB *optional* dependency, and pnpm drops an optional whose download
# exhausts its retries while still exiting 0, leaving an image on which every
# eval dies for want of a binary. A tarball the store holds cannot fail that
# way; the raised retry budget covers the first fetch, which no cache can.
#
# `sharing=locked` keeps two builds off the store at once. Importing by copy
# because the mount is a different filesystem, so pnpm cannot hardlink out of
# it — and if it ever could, the links would dangle once the mount went away.
RUN --mount=type=cache,target=/pnpm-store,sharing=locked \
  pnpm pkg delete scripts.prepare \
  && pnpm install --no-frozen-lockfile \
    --store-dir=/pnpm-store \
    --package-import-method=copy \
    --fetch-retries=5 \
    --fetch-timeout=300000

# The guards above are probabilistic and pnpm reports a dropped optional as
# success, so the install can still come back incomplete and green, with only a
# hand-run `pnpm eval:docker` to find out. This asks what the SDK asks at spawn
# time — did a platform package for this host land — so CI's image job fails
# rather than shipping one whose evals all die.
#
# Resolved from the SDK's own entry, since the platform packages are its
# dependencies rather than ours, and reached from /work so the answer is about
# the root install the provider is spawned from. Platform and arch are read
# rather than written, so an arm64 build is not failed for wanting no x64
# binary.
RUN node --input-type=module -e ' \
  import { createRequire } from "node:module"; \
  const sdk = "@anthropic-ai/claude-agent-sdk"; \
  const fromSdk = createRequire(createRequire("/work/").resolve(sdk)); \
  const base = `${sdk}-${process.platform}-${process.arch}`; \
  const found = [base, `${base}-musl`].find((name) => { \
    try { return fromSdk.resolve(`${name}/package.json`); } catch { return false; } \
  }); \
  if (!found) throw new Error( \
    `${base} did not install: pnpm drops an optional whose download fails \
and still exits 0. Every eval in this image would want that native CLI.`); \
  console.log(`native CLI present: ${found}`);'
