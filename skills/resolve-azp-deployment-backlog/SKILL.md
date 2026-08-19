---
name: resolve-azp-deployment-backlog
description: Clear a backlog of pending Azure Pipelines manual-approval deployments for a given pipeline + branch by rejecting every superseded approval and, optionally, approving only the newest one. Use whenever the user mentions an Azure DevOps / azp / Azure Pipelines pipeline whose `main` (or another long-running branch) has multiple runs queued at a manual approval checkpoint — typical phrasings include "reject the stale main deployments", "clear the approval backlog", "approve only the latest pipeline run", "stuck pending approvals", "fast-forward the deploy queue", or "supersede older deployments". Also use when the user wants to ship only the latest commit and discard everything older sitting at an approval gate.
---

# Resolve Azure Pipelines Deployment Backlog

Only the latest run on a branch should ship. Anything older sitting at an
approval gate is superseded and should be rejected. The bundled script does
this deterministically in one call.

## What the script does

1. Lists recent runs for the given pipeline + branch (all statuses) and
   identifies the absolute latest by id.
1. Picks the highest-numbered `inProgress` run as the approval candidate.
1. If a strictly newer run has already completed, warns and forces
   `-ApproveLatest` off — approving the candidate would ship superseded
   code. Older pending rejects still proceed.
1. Queries pending approvals across the project; keeps only those whose
   owning run is in the in-progress set above.
1. Rejects every pending approval tied to an older run with the comment
   `Superseded by run <latest-run-name> (build <latest-id>)`.
1. With `-ApproveLatest` (and no newer completed run), also approves the
   approval tied to the latest in-progress run.

Everything it prints is keyed to what the Azure DevOps UI shows — the pipeline
name and each run's name (its build number) first, the numeric definition and
build ids in parentheses, plus the portal link for the latest run. The
rejection comment left on each approval names the superseding run the same way,
since a human reads it later in the approval history.

## Authentication

`scripts/resolve-azp-deployment-backlog.ps1` mints a bearer token from the
active `az login` session via `az account get-access-token`, then uses
`Invoke-RestMethod` for the actual HTTP — no PAT, no env var, no cmd.exe
URL-quoting hazards. If `az account get-access-token` fails with
`AADSTS500011 ... resource principal ... was not found`, the user's tenant
hasn't consented to the Azure DevOps AAD app yet. One-time fix:

```pwsh
az login --scope 499b84ac-1321-427f-aa17-267ca6975798/.default
```

## Required inputs

All three are mandatory and have no defaults.
A missing value drops into an interactive prompt the harness can't answer,
so resolve every one before invoking.

- `-PipelineId <int>` — build definition id.
- `-Organization <url>` — organization URL,
  e.g. `https://dev.azure.com/contoso`.
- `-Project <string>` — project name or id.

Resolve all three yourself — see below.
Nobody thinks of their deployments in terms of a definition id,
and making the user read one out of a browser URL
turns a one-sentence request into a scavenger hunt.

## Resolving the target pipeline

Work down this list and stop at the first step that yields a single pipeline:

1. **The user named one.**
   `az pipelines list --name '<name>' --org <url> --project <name>`
   matches on prefix as well, so a partial name usually lands.
1. **They named none — infer it from the working directory.**
   Most of the time the user is sitting in the repo whose deployments are
   stuck, and the repo's `origin` remote identifies it. Read it with
   `git remote get-url origin`, then list the pipelines built from that repo:

   ```pwsh
   az pipelines list --repository <repo> --repository-type tfsgit --org <url> --project <name>
   ```

   Use `tfsgit` for an Azure Repos remote and `github` for a GitHub-hosted
   repo built by Azure Pipelines (there `--repository` wants `owner/repo`).

1. **Still ambiguous or empty.** Ask — but ask with the candidate pipeline
   names you found, not by requesting an id.

An Azure Repos remote also settles `-Organization` and `-Project`, since both
appear in the URL (`https://dev.azure.com/<org>/<project>/_git/<repo>`, or
`git@ssh.dev.azure.com:v3/<org>/<project>/<repo>`). `az devops` picks the same
values up from git config on its own, so `--org`/`--project` can be omitted
from the `az` calls above when the working directory is the repo — but the
script still needs them passed explicitly.

## Optional inputs

- `-Branch <string>` — default `main`.
- `-ApproveLatest` — also approve the latest run.
- `-WhatIf` — preview without calling PATCH.
- `-Force` — skip the `ConfirmImpact = 'High'` prompt for a non-interactive
  run. Use this rather than `-Confirm:$false`: a plain switch binds under
  `pwsh -File`, whereas `-Confirm:$false` does not (see the invocation note
  below). `-WhatIf` still takes precedence over `-Force`, so a dry run never
  mutates.

## How to invoke

Always confirm the target pipeline and the `-ApproveLatest` decision with the
user before the live run — both actions are difficult to reverse, and a
confirmation phrased as a bare definition id is one the user cannot actually
check. Prefer a `-WhatIf` dry run first when the count of pending approvals is
large or the target pipeline is unfamiliar:

Invoke it non-interactively with `pwsh -File` and pass `-Force` on the live
run so the `ConfirmImpact = 'High'` prompt (which the harness can't answer)
is skipped:

```pwsh
# Dry run — no -Force needed, ShouldProcess previews and skips the PATCH:
pwsh -NoProfile -File <abs-path>/resolve-azp-deployment-backlog.ps1 -PipelineId 1234 -Organization https://dev.azure.com/contoso -Project my-project -WhatIf

# Live run:
pwsh -NoProfile -File <abs-path>/resolve-azp-deployment-backlog.ps1 -PipelineId 1234 -Organization https://dev.azure.com/contoso -Project my-project -ApproveLatest -Force
```

Do **not** substitute `-Confirm:$false` for `-Force`: under `pwsh -File` the
`$false` token is passed as an unparsed string, so the switch never binds and
`ShouldProcess` hangs on the prompt (or throws `Object reference not set to
an instance of an object`). `-Force` is a plain switch and binds cleanly.

## How to report back

The script already prints run names; carry them through to your summary
instead of collapsing everything back to ids. A build id means nothing until
it is pasted into a URL, so a report written in ids asks the user to go look up
what you just did to their deployments.

- Name the pipeline, not the definition id: _the web-frontend pipeline
  (definition 1234)_.
- Identify each run by its run name — the build number the portal shows, like
  `20260814.3` — with the build id after it: `20260814.3 (build 987654)`.
- Say which run shipped and how many were superseded, and link the approved
  run using the URL the script echoes.

Carry the ids along in parentheses. They are what a follow-up REST call or a
support ticket needs; they just should not be the only handle on offer.

## Why a script, not inline REST

The `approvalsandchecks/approvals` area isn't surfaced through
`az devops invoke`, so any inline approach has to hand-roll URL construction
and JSON bodies for the batch PATCH. Bundling it keeps the call site short,
adds `-WhatIf` for safety, and makes the reject/approve loop atomic.
