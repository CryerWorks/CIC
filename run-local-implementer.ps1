<#
.SYNOPSIS
  Spawns the implementer agent for a single handoff task.
.DESCRIPTION
  Runs opencode with the specified agent for the given task.
  STATE.md must already be set to "in_progress" by the caller.
.PARAMETER TaskId
  The task identifier matching .agent/handoff/<TaskId>/
.PARAMETER TimeoutSeconds
  Max seconds to wait (default 600). Use 0 for no timeout (blocks forever).
.PARAMETER Interactive
  Run the implementer in interactive split-footer mode (debugging).
.PARAMETER AgentName
  Agent to run (default: implementer). Use "frontier-implementer" for the DeepSeek V4 Flash implementer.
.EXAMPLE
  .\run-local-implementer.ps1 -TaskId feat-001
  .\run-local-implementer.ps1 -TaskId feat-001 -TimeoutSeconds 300
  .\run-local-implementer.ps1 -TaskId feat-001 -AgentName frontier-implementer
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$TaskId,

  [int]$TimeoutSeconds = 600,

  [switch]$Interactive,

  [string]$AgentName = "implementer"
)

$handoff = Join-Path -Path $PSScriptRoot -ChildPath ".agent/handoff/$TaskId"
$stateFile = Join-Path -Path $handoff -ChildPath "STATE.md"
$projRoot = $PSScriptRoot

if (-not (Test-Path -LiteralPath $handoff)) {
  Write-Error "Handoff not found: $handoff"
  exit 1
}

# Run implementer
Write-Host "[implementer] Task $TaskId starting..."

if ($Interactive) {
  opencode run --agent $AgentName --dir "$projRoot" --interactive "Implement task $TaskId. See $handoff/MANIFEST.md"
} else {
  if ($TimeoutSeconds -gt 0) {
    $job = Start-Job -ScriptBlock {
      param($root, $id, $taskDir, $agent)
      opencode run --agent $agent --dir "$root" "Implement task $id. See $taskDir/MANIFEST.md"
    } -ArgumentList $projRoot, $TaskId, $handoff, $AgentName
    if (Wait-Job $job -Timeout $TimeoutSeconds) {
      Receive-Job $job
    } else {
      Stop-Job $job
      Receive-Job $job | Out-Null
      Write-Warning "[implementer] Task $TaskId timed out after ${TimeoutSeconds}s"
      # Set STATE.md to timed_out so orchestrator can detect
      if (Test-Path -LiteralPath $stateFile) {
        $state = Get-Content -Path $stateFile -Raw
        $state = $state -replace '(?m)^-\s+\*\*State\*\*:\s*\S+.*$', "- **State**: timed_out"
        Set-Content -Path $stateFile -Value $state -Force
      }
      exit 2
    }
  } else {
    # No timeout — blocks until completion
    opencode run --agent $AgentName --dir "$projRoot" "Implement task $TaskId. See $handoff/MANIFEST.md"
  }
}

# Check result
if (Test-Path -LiteralPath $stateFile) {
  $state = Get-Content -Path $stateFile -Raw
  if ($state -match '(?i)approved') {
    Write-Host "[implementer] Task $TaskId → approved"
    exit 0
  } elseif ($state -match '(?i)rejected') {
    Write-Host "[implementer] Task $TaskId → rejected. See $handoff/REVISION_REQUEST.md"
    exit 1
  } else {
    Write-Host "[implementer] Task $TaskId → review needed. See $handoff/IMPL_REPORT.md"
    exit 0
  }
} else {
  Write-Error "[implementer] STATE.md not found after run"
  exit 1
}
