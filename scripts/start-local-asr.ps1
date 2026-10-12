param([int]$StartupTimeoutSeconds = 180)

$ErrorActionPreference = 'Stop'
$asrWorkspace = Split-Path -Parent $PSScriptRoot
$asrPython = Join-Path $asrWorkspace 'services\local-asr\.venv\Scripts\python.exe'
$asrServer = Join-Path $asrWorkspace 'services\local-asr\server.py'
$asrHealthUrl = 'http://127.0.0.1:8765/health'

function Read-AsrHealth {
  try { return Invoke-RestMethod -Uri $asrHealthUrl -TimeoutSec 15 } catch { return $null }
}

$asrHealth = Read-AsrHealth
if ($asrHealth.status -eq 'NORMAL' -and $asrHealth.service -eq 'LOCAL_FUNASR') {
  Write-Output 'LOCAL_ASR_READY: existing service at 127.0.0.1:8765'
  exit 0
}
if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) {
  throw 'LOCAL_ASR_PORT_IN_USE: inspect the existing listener; no process was stopped.'
}
if (-not (Test-Path -LiteralPath $asrPython)) {
  throw 'LOCAL_ASR_ENVIRONMENT_MISSING: install the isolated environment described in docs/local-asr.md.'
}

$asrLogDirectory = Join-Path $asrWorkspace 'output\local-asr'
New-Item -ItemType Directory -Path $asrLogDirectory -Force | Out-Null
$asrLogStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$asrStdout = Join-Path $asrLogDirectory "$asrLogStamp.stdout.log"
$asrStderr = Join-Path $asrLogDirectory "$asrLogStamp.stderr.log"
$asrExistingProcess = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object {
  $_.ExecutablePath -eq $asrPython -and $_.CommandLine -and $_.CommandLine.IndexOf($asrServer, [StringComparison]::OrdinalIgnoreCase) -ge 0
} | Select-Object -First 1
$asrPreviousPath = $env:Path
$asrPreviousHost = $env:LOCAL_ASR_HOST
$asrPreviousPort = $env:LOCAL_ASR_PORT
try {
  # Reuse the workspace's existing media tools without changing the system PATH.
  $asrMediaTools = Join-Path $asrWorkspace 'output\setup\runtime\ffmpeg\ffmpeg-9.0.2-essentials_build\bin'
  if (Test-Path -LiteralPath (Join-Path $asrMediaTools 'ffmpeg.exe')) {
    $env:Path = "$asrMediaTools;$asrPreviousPath"
  }
  $env:LOCAL_ASR_HOST = '127.0.0.1'
  $env:LOCAL_ASR_PORT = '8765'
  if ($asrExistingProcess) {
    $asrProcess = Get-Process -Id $asrExistingProcess.ProcessId
    $asrStderr = $asrLogDirectory
    Write-Output "LOCAL_ASR_STARTING: waiting for existing PID=$($asrProcess.Id)"
  } else {
    $asrProcess = Start-Process -FilePath $asrPython -ArgumentList @('"' + $asrServer + '"') -WorkingDirectory $asrWorkspace -WindowStyle Hidden -RedirectStandardOutput $asrStdout -RedirectStandardError $asrStderr -PassThru
  }
} finally {
  $env:Path = $asrPreviousPath
  $env:LOCAL_ASR_HOST = $asrPreviousHost
  $env:LOCAL_ASR_PORT = $asrPreviousPort
}

$asrDeadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
do {
  $asrHealth = Read-AsrHealth
  if ($asrHealth.status -eq 'NORMAL' -and $asrHealth.service -eq 'LOCAL_FUNASR') {
    Write-Output "LOCAL_ASR_READY: PID=$($asrProcess.Id), 127.0.0.1:8765"
    Write-Output "Logs: $asrLogDirectory"
    exit 0
  }
  $asrProcess.Refresh()
  if ($asrProcess.HasExited) { throw "LOCAL_ASR_START_FAILED: inspect $asrStderr" }
  Start-Sleep -Seconds 1
} while ((Get-Date) -lt $asrDeadline)
throw "LOCAL_ASR_START_TIMEOUT: inspect $asrStderr; PID=$($asrProcess.Id)"
