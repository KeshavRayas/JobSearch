# Registers a daily Windows Task Scheduler job for the nightly pipeline.
#   powershell -ExecutionPolicy Bypass -File scripts/schedule-nightly.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/schedule-nightly.ps1 -Time 06:30
#
# The task runs `bun run agent -- nightly` from the repo root: ingest -> match
# -> digest. It uses the current user's credentials, so no service account is
# needed. Remove it with:
#   Unregister-ScheduledTask -TaskName "Job Search Nightly" -Confirm:$false

param(
  [string]$Time = "02:00",
  [string]$TaskName = "Job Search Nightly"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

$bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
if (-not $bun) {
  Write-Error "bun is not on PATH. Install it first: https://bun.sh"
}

if (-not (Test-Path (Join-Path $repo ".env"))) {
  Write-Error "No .env in $repo. Run 'bun run setup' first."
}

try {
  $action = New-ScheduledTaskAction `
    -Execute $bun `
    -Argument "run agent -- nightly" `
    -WorkingDirectory $repo

  $trigger = New-ScheduledTaskTrigger -Daily -At $Time

  $settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Job Search: ingest, match, and email the nightly digest" `
    -Force | Out-Null

  Write-Host "Registered '$TaskName' daily at $Time."
  Write-Host "Working directory: $repo"
  Write-Host "Run now:  Start-ScheduledTask -TaskName '$TaskName'"
  Write-Host "Result:   Get-ScheduledTaskInfo -TaskName '$TaskName'"
} catch {
  Write-Host ""
  Write-Host "Could not register the task automatically: $($_.Exception.Message)"
  Write-Host ""
  Write-Host "Create it manually in Task Scheduler:"
  Write-Host "  Program:   $bun"
  Write-Host "  Arguments: run agent -- nightly"
  Write-Host "  Start in:  $repo"
  Write-Host "  Trigger:   Daily at $Time"
}
