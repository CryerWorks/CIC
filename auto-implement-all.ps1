<#
.SYNOPSIS
  Automatically implements ALL handoff tasks sequentially using the specified implementer agent.
.DESCRIPTION
  Discovers task directories under .agent/handoff/, runs the implementer for each,
  and writes SUMMARY.md. Designed for autonomous multi-task implementation.
.PARAMETER TaskId
  Comma-separated task IDs (e.g., "task-001,task-002"). If omitted, discovers all task-* dirs in natural order.
.PARAMETER TimeoutSeconds
  Max seconds to wait per task (default 600).
.PARAMETER ProjectRoot
  Project root directory (default: script location).
.PARAMETER AgentName
  Agent to run (default: implementer). Use "frontier-implementer" for DeepSeek V4 Flash implementer.
.EXAMPLE
  .\auto-implement-all.ps1
  .\auto-implement-all.ps1 -TaskId "feat-001,feat-002"
  .\auto-implement-all.ps1 -AgentName frontier-implementer -TimeoutSeconds 300
#>

param(
  [string]$TaskId,
  [int]$TimeoutSeconds = 600,
  [string]$ProjectRoot = $PSScriptRoot,
  [string]$AgentName = "implementer"
)

$ErrorActionPreference = "Stop"

# Resolve task list
$handoffDir = Join-Path -Path $ProjectRoot -ChildPath ".agent/handoff"
if (-not (Test-Path -LiteralPath $handoffDir)) {
  Write-Error "Handoff directory not found: $handoffDir"
  exit 1
}

if ($TaskId) {
  $taskIds = $TaskId -split ',' | ForEach-Object { $_.Trim() }
} else {
  $taskIds = Get-ChildItem -Path $handoffDir -Directory | Where-Object { $_.Name -ne 'SUMMARY.md' } | Sort-Object Name | ForEach-Object { $_.Name }
}

if ($taskIds.Count -eq 0) {
  Write-Host "[auto] No tasks found."
  exit 0
}

Write-Host "[auto] Implementing $($taskIds.Count) task(s): $($taskIds -join ', ')"
Write-Host ""

$results = @()

foreach ($id in $taskIds) {
  $taskDir = Join-Path -Path $handoffDir -ChildPath $id
  $stateFile = Join-Path -Path $taskDir -ChildPath "STATE.md"
  $implReport = Join-Path -Path $taskDir -ChildPath "IMPL_REPORT.md"

  if (-not (Test-Path -LiteralPath $taskDir)) {
    Write-Warning "[auto] Task directory not found: $taskDir. Skipping."
    $results += [PSCustomObject]@{ Task = $id; Status = "skipped"; Detail = "directory not found" }
    continue
  }

  # Check current state
  if (Test-Path -LiteralPath $stateFile) {
    $currentState = Get-Content -Path $stateFile -Raw
    if ($currentState -match '(?i)approved') {
      Write-Host "[auto] $id already approved. Skipping."
      $results += [PSCustomObject]@{ Task = $id; Status = "approved"; Detail = "already approved" }
      continue
    }
    if ($currentState -match '(?i)review') {
      Write-Host "[auto] $id already in review. Checking for revision request..."
      $revFile = Join-Path -Path $taskDir -ChildPath "REVISION_REQUEST.md"
      if (Test-Path -LiteralPath $revFile) {
        Write-Host "[auto] $id has pending revision request. Re-implementing..."
        # Reset to waiting for re-implementation
        Set-Content -Path $stateFile -Value "state: waiting"
      } else {
        Write-Host "[auto] $id already reviewed. Skipping."
        $results += [PSCustomObject]@{ Task = $id; Status = "review"; Detail = "awaiting remote review" }
        continue
      }
    }
  }

  # Set in_progress
  $startedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Set-Content -Path $stateFile -Value @"
# Task State

- **Task ID**: $id
- **State**: in_progress
- **Started**: $startedAt
- **Completed**:

## State Transitions
- waiting → in_progress (when implementer starts)
- in_progress → review (when implementer finishes)
- review → approved (when remote signs off)
- review → rejected (when revision requested)
- rejected → waiting (when revision ready)
"@

  Write-Host "[auto] $id → in_progress"

  # Run implementer via Start-Job (isolated from ANSI console issues)
  $job = Start-Job -ScriptBlock {
    param($root, $id, $taskDir, $agent)
    $ErrorActionPreference = "Stop"
    opencode run --agent $agent --dir "$root" "Implement task $id. See $taskDir/MANIFEST.md"
  } -ArgumentList $ProjectRoot, $id, $taskDir, $AgentName

  # Wait with timeout
  if (Wait-Job $job -Timeout $TimeoutSeconds) {
    $jobOutput = Receive-Job $job
    Write-Host $jobOutput
  } else {
    Write-Warning "[auto] $id timed out after ${TimeoutSeconds}s. Killing..."
    Stop-Job $job
    Receive-Job $job | Out-Null
  }

  # Check result
  $completedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  if (Test-Path -LiteralPath $stateFile) {
    $state = Get-Content -Path $stateFile -Raw
    if ($state -match '(?i)approved') {
      Write-Host "[auto] $id → approved" -ForegroundColor Green
      $results += [PSCustomObject]@{ Task = $id; Status = "approved"; Detail = "implemented and auto-approved" }
    } elseif ($state -match '(?i)rejected') {
      Write-Host "[auto] $id → rejected" -ForegroundColor Yellow
      $results += [PSCustomObject]@{ Task = $id; Status = "rejected"; Detail = "rejected. See REVISION_REQUEST.md" }
    } elseif ($state -match '(?i)review') {
      Write-Host "[auto] $id → review needed" -ForegroundColor Cyan
      $results += [PSCustomObject]@{ Task = $id; Status = "review"; Detail = "ready for remote review" }
    } else {
      Write-Host "[auto] $id → unknown state" -ForegroundColor Magenta
      $results += [PSCustomObject]@{ Task = $id; Status = "unknown"; Detail = "unexpected state in STATE.md" }
    }
  } else {
    Write-Error "[auto] $id → STATE.md missing after run"
    $results += [PSCustomObject]@{ Task = $id; Status = "error"; Detail = "STATE.md not found after run" }
  }
}

# Write summary
$summaryPath = Join-Path -Path $handoffDir -ChildPath "SUMMARY.md"
$summary = @"
# Auto-Implementation Summary

**Generated**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Tasks**: $($taskIds.Count)

## Results

| Task | Status | Detail |
|------|--------|--------|
"@

foreach ($r in $results) {
  $summary += "`n| $($r.Task) | $($r.Status) | $($r.Detail) |"
}

$summary += @"

## Instructions for Remote Reviewer

1. Review IMPL_REPORT.md in each task directory
2. Check STATE.md: "review" means needs your sign-off
3. Set STATE.md to "approved" or write REVISION_REQUEST.md and set to "rejected"
4. To re-implement rejected tasks: run again with same parameters (e.g., `-AgentName frontier-implementer` if used)
"@

$summary | Out-File -FilePath $summaryPath -Encoding utf8
Write-Host "[auto] Summary written to $summaryPath"

# Exit code
$failedCount = ($results | Where-Object { $_.Status -in @('rejected', 'error', 'unknown', 'timed_out') }).Count
if ($failedCount -gt 0) {
  Write-Warning "[auto] $failedCount task(s) had issues. See SUMMARY.md for details."
  exit 1
}

Write-Host "[auto] All tasks completed. Remote review needed for pending tasks."
exit 0
