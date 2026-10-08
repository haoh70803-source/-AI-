$ErrorActionPreference = "Continue"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$stateFile = Join-Path (Join-Path $env:LOCALAPPDATA "ContentCenter\dev") "services.json"

if (Test-Path -LiteralPath $stateFile) {
  try {
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    foreach ($entry in $state.PSObject.Properties) {
      $service = $entry.Value
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($service.pid)" -ErrorAction SilentlyContinue
      if (-not $process) {
        Write-Output "[INFO] $($entry.Name) already stopped"
        continue
      }
      if ($process.CommandLine -notmatch "(?i)pnpm|local-asr|server\.py") {
        Write-Output "[WARN] Skipping $($entry.Name): PID $($service.pid) belongs to another process"
        continue
      }
      & taskkill.exe /PID $service.pid /T /F 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { Write-Output "[OK] Stopped $($entry.Name)" }
      else { Write-Output "[WARN] Could not stop $($entry.Name)" }
    }
  } catch {
    Write-Output "[WARN] Could not read service state; stopping Compose services only"
  }
  Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
}

Push-Location $repoRoot
try {
  & docker compose -f docker-compose.dev.yml down
  if ($LASTEXITCODE -eq 0) {
    Write-Output "[OK] Stopped Docker Compose services; named volumes preserved"
  } else {
    Write-Output "[WARN] Docker Compose services failed to stop"
  }
} finally {
  Pop-Location
}
