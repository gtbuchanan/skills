#requires -Version 7

<#
.SYNOPSIS
  Reject all but the latest pending Azure Pipelines approvals for a given
  pipeline + branch, optionally approving the latest.

.DESCRIPTION
  Each pipeline run blocks at its first manual-approval checkpoint, so a
  branch like `main` can accumulate several runs waiting on approval. Only
  the latest run should ship; the rest are superseded. This script rejects
  every pending approval except the one tied to the highest-numbered
  in-progress run (the "latest"). Pass -ApproveLatest to also approve that
  newest run in the same operation.

  Everything it prints names runs the way the Azure DevOps UI does — the
  pipeline name and the run name (build number) first, the numeric definition
  and build ids second, plus a direct link to the latest run. A bare build id
  is only meaningful after pasting it into a URL, which is exactly the lookup
  the caller should not have to do.

  Auth: mints a bearer token from the active `az login` session via
  `az account get-access-token` — no PAT required. If that call fails with
  AADSTS500011 ("resource principal ... was not found"), consent the Azure
  DevOps app once:

      az login --scope 499b84ac-1321-427f-aa17-267ca6975798/.default

.PARAMETER PipelineId
  Build definition id. Required.

.PARAMETER Organization
  Azure DevOps organization URL, e.g. https://dev.azure.com/contoso.
  Required.

.PARAMETER Project
  Azure DevOps project name or id. Required.

.PARAMETER Branch
  Branch name without the refs/heads/ prefix. Default: main.

.PARAMETER ApproveLatest
  Also approve the latest pending run instead of leaving it for manual
  approval.

.EXAMPLE
  ./resolve-azp-deployment-backlog.ps1 -PipelineId 1234 `
    -Organization https://dev.azure.com/contoso -Project my-project -WhatIf

  Preview every reject the script would issue for pipeline 1234 on main,
  without making changes.

.EXAMPLE
  ./resolve-azp-deployment-backlog.ps1 -PipelineId 1234 `
    -Organization https://dev.azure.com/contoso -Project my-project `
    -ApproveLatest

  Reject every superseded main approval and approve the latest in one
  shot.
#>

[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory)]
  [int]$PipelineId,

  [Parameter(Mandatory)]
  [string]$Organization,

  [Parameter(Mandatory)]
  [string]$Project,

  [string]$Branch = 'main',
  [switch]$ApproveLatest,

  <#
    Skip the ConfirmImpact='High' prompt for non-interactive runs. Prefer this
    over -Confirm:$false: a plain switch binds correctly under `pwsh -File`,
    whereas `-File ... -Confirm:$false` passes "$false" unparsed and leaves
    ShouldProcess to hang on the prompt (or throw a null-reference). -WhatIf
    still wins over -Force, so a dry run never mutates.
  #>
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

<#
  Renders a run the way the portal labels it: run name first, numeric build id
  second. Both matter — the name is what the caller recognises in the UI and in
  the approval email, the id is what a REST call or a support ticket needs — but
  leading with the id forces a URL lookup just to learn which run is meant.
  Falls back to the id alone if a run somehow carries no build number.
#>
function Format-Run {
  param([Parameter(Mandatory)]$Run)

  $name = $Run.buildNumber
  if ([string]::IsNullOrWhiteSpace($name)) { return "build $($Run.id)" }
  "$name (build $($Run.id))"
}

# Azure DevOps AAD app id — token audience for ADO REST.
$adoResource = '499b84ac-1321-427f-aa17-267ca6975798'
$token = az account get-access-token --resource $adoResource --query accessToken -o tsv --only-show-errors
$headers = @{ Authorization = "Bearer $token" }

$base = "$($Organization.TrimEnd('/'))/$Project/_apis"

# Fetch all recent runs (not just inProgress) so we can detect when a newer
# run has already completed — approving an older still-pending run after a
# newer one shipped would publish stale code.
$runsUri = "$base/build/builds?api-version=7.1&definitions=$PipelineId&branchName=refs/heads/$Branch&queryOrder=queueTimeDescending&" + '$top=200'
$runs = (Invoke-RestMethod -Headers $headers -Uri $runsUri).value
if (-not $runs) {
  Write-Host "No runs found for pipeline $PipelineId on $Branch."
  return
}

$sortedRuns = @($runs | Sort-Object id -Descending)
$absoluteLatest = $sortedRuns[0]

# Every build carries its definition, so the pipeline's display name comes free
# with the runs query — no extra call to turn the caller's definition id back
# into something they recognise.
$pipelineName = $absoluteLatest.definition.name
if ([string]::IsNullOrWhiteSpace($pipelineName)) { $pipelineName = "definition $PipelineId" }
Write-Host "Pipeline: $pipelineName (definition $PipelineId)"
Write-Host "Branch:   $Branch"

$inProgressRuns = @($sortedRuns | Where-Object { $_.status -eq 'inProgress' })
if (-not $inProgressRuns) {
  Write-Host "No in-progress runs found on $Branch."
  return
}

$latestInProgress = $inProgressRuns[0]
$latestRunId = [int]$latestInProgress.id
$latestRunLabel = Format-Run $latestInProgress
$olderRuns = @($inProgressRuns | Select-Object -Skip 1)
$olderRunIds = @($olderRuns | ForEach-Object { [int]$_.id })

Write-Host ''
Write-Host "Latest in-progress run: $latestRunLabel"
# The runs payload already links each build in the portal; echoing it saves the
# caller from turning a build id back into a URL by hand.
$latestRunUrl = $latestInProgress._links.web.href
if ($latestRunUrl) { Write-Host "  $latestRunUrl" }

Write-Host ''
Write-Host ("Superseded in-progress runs ({0}):" -f $olderRuns.Count)
if ($olderRuns.Count -eq 0) {
  Write-Host '  (none)'
}
else {
  foreach ($r in $olderRuns) { Write-Host "  $(Format-Run $r)" }
}

# Block -ApproveLatest if a strictly newer run has already completed —
# approving here would ship code that's already been superseded.
$blockApproval = $false
if ([int]$absoluteLatest.id -gt $latestRunId) {
  Write-Warning ("Newer run already completed: {0} — status={1}, result={2}. The latest in-progress run is NOT the absolute latest." -f (Format-Run $absoluteLatest), $absoluteLatest.status, $absoluteLatest.result)
  if ($ApproveLatest) {
    Write-Warning '-ApproveLatest will be ignored to avoid shipping a superseded run.'
    $blockApproval = $true
  }
}

$approvalsUri = "$base/pipelines/approvals?api-version=7.1&state=pending&" + '$top=500'
$pending = (Invoke-RestMethod -Headers $headers -Uri $approvalsUri).value

$ownedRunIds = @($latestRunId) + $olderRunIds
$relevant = @($pending | Where-Object { $ownedRunIds -contains [int]$_.pipeline.owner.id })
$toReject = @($relevant | Where-Object { $olderRunIds -contains [int]$_.pipeline.owner.id })
$toApprove = if ($ApproveLatest -and -not $blockApproval) {
  @($relevant | Where-Object { [int]$_.pipeline.owner.id -eq $latestRunId })
}
else { @() }

if ($toReject.Count -eq 0 -and $toApprove.Count -eq 0) {
  Write-Host 'Nothing to do — no matching pending approvals.'
  return
}

# These comments land in the approval history, where a human reads them later
# and has no way to look up a bare build id in passing.
$updates = @()
foreach ($a in $toReject) {
  $updates += @{ approvalId = $a.id; status = 'rejected'; comment = "Superseded by run $latestRunLabel" }
}
foreach ($a in $toApprove) {
  $updates += @{ approvalId = $a.id; status = 'approved'; comment = "Approved as latest $Branch run $latestRunLabel" }
}

$summary = "$($toReject.Count) reject, $($toApprove.Count) approve ($pipelineName, $Branch)"
# -WhatIf always routes through ShouldProcess so the dry-run preview prints and
# nothing mutates; -Force bypasses the interactive prompt only for a real run.
$proceed = if (-not $WhatIfPreference -and $Force) { $true }
else { $PSCmdlet.ShouldProcess($summary, 'PATCH pipelines/approvals') }
if (-not $proceed) {
  return
}

$body = ConvertTo-Json @($updates) -Depth 4
$result = Invoke-RestMethod -Method Patch -Headers $headers -ContentType 'application/json' -Uri "$base/pipelines/approvals?api-version=7.1" -Body $body

# Approval ids are opaque GUIDs that appear nowhere in the portal, so report
# each outcome against the run it gated. The mapping comes from the pending
# approvals already fetched rather than the PATCH response, so it holds even if
# the response omits the owning run.
$runsById = @{}
foreach ($r in $inProgressRuns) { $runsById[[string]$r.id] = $r }
$runByApproval = @{}
foreach ($a in $relevant) { $runByApproval[[string]$a.id] = $runsById[[string]$a.pipeline.owner.id] }

Write-Host ''
Write-Host 'Approval results:'
foreach ($a in $result.value) {
  $run = $runByApproval[[string]$a.id]
  # An approval we never sent coming back in the response is an anomaly, and
  # there is no run name to show for it. Say so plainly and keep the GUID —
  # unlike the normal rows, it is the only handle that identifies the record.
  $label = $run ? (Format-Run $run) : "unmapped approval $($a.id)"
  Write-Host ("  {0,-9} {1}" -f $a.status, $label)
  Write-Verbose ("approval {0} -> {1}" -f $a.id, $label)
}
