$ErrorActionPreference = "SilentlyContinue"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$envFile = Join-Path $repoRoot ".env.local-real"
$script:failureCount = 0

function Result([string]$Label, [bool]$Ok, [string]$Detail = "") {
  if ($Ok) {
    if ($Detail) { Write-Output "[OK] $Label - $Detail" }
    else { Write-Output "[OK] $Label" }
  } else {
    $script:failureCount += 1
    if ($Detail) { Write-Output "[FAIL] $Label - $Detail" }
    else { Write-Output "[FAIL] $Label" }
  }
}

function State([string]$Label, [string]$Value, [string]$Detail = "") {
  if ($Detail) { Write-Output "[$Value] $Label - $Detail" }
  else { Write-Output "[$Value] $Label" }
}

function Test-LocalPort([int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $attempt = $client.ConnectAsync("127.0.0.1", $Port)
    if (-not $attempt.Wait(1000)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Read-EnvFile([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
  }
  return $values
}

function Http([string]$Uri, [string]$Method = "Get") {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Method $Method -TimeoutSec 5
    return [pscustomobject]@{ code = [int]$response.StatusCode; body = [string]$response.Content }
  } catch {
    $code = 0
    if ($_.Exception.Response) { try { $code = [int]$_.Exception.Response.StatusCode } catch {} }
    return [pscustomobject]@{ code = $code; body = "" }
  }
}

$values = Read-EnvFile $envFile
Result "LOCAL_REAL env" (Test-Path -LiteralPath $envFile) "explicit .env.local-real"
Result "DATABASE_URL" ($values.ContainsKey("DATABASE_URL") -and $values.DATABASE_URL) "target=127.0.0.1:55432/content_center"
Result "REDIS_URL" ($values.ContainsKey("REDIS_URL") -and $values.REDIS_URL) "target=127.0.0.1:6379"
Result "STORAGE_DRIVER" ($values.STORAGE_DRIVER -eq "S3_COMPATIBLE")
Result "Runtime guard" ($values.RUNTIME_GUARD -eq "DOCKER_COMPOSE") "reviewed Docker Compose"

$dockerVersion = (& docker info --format '{{.ServerVersion}}' 2>$null | Out-String).Trim()
Result "Docker daemon" ($LASTEXITCODE -eq 0 -and $dockerVersion) $(if ($dockerVersion) { "server $dockerVersion" } else { "not running" })

$pgPort = Test-LocalPort 55432
$pgReady = (& docker exec content-center-postgres-1 pg_isready -U content_center -d content_center 2>$null | Out-String).Trim()
$pgReadyExit = $LASTEXITCODE
$pgSelect = (& docker exec content-center-postgres-1 psql -X -U content_center -d content_center -Atqc "SELECT 1" 2>$null | Out-String).Trim()
$pgSelectExit = $LASTEXITCODE
Result "PostgreSQL" ($pgPort -and $pgReadyExit -eq 0 -and $pgReady -match "accepting connections" -and $pgSelectExit -eq 0 -and $pgSelect -eq "1") "127.0.0.1:55432"

$redisPort = Test-LocalPort 6379
$redisPing = (& docker exec content-center-redis-1 redis-cli ping 2>$null | Out-String).Trim()
$redisExit = $LASTEXITCODE
Result "Redis" ($redisPort -and $redisExit -eq 0 -and $redisPing -eq "PONG") "127.0.0.1:6379"

$minioPort = Test-LocalPort 9000
$minioHealth = Http "http://127.0.0.1:9000/minio/health/live" "Head"
Result "MinIO API" ($minioPort -and $minioHealth.code -ge 200 -and $minioHealth.code -lt 500) "127.0.0.1:9000"
Result "MinIO Console" (Test-LocalPort 9001) "127.0.0.1:9001"

$asr = Http "http://127.0.0.1:8765/health"
$asrHealthy = $false
if ($asr.code -ge 200 -and $asr.code -lt 300) {
  try { $asrHealthy = (($asr.body | ConvertFrom-Json).status -eq "NORMAL") } catch {}
}
Result "Local ASR" $asrHealthy "127.0.0.1:8765"

$worker = Http "http://127.0.0.1:3010/health" "Head"
Result "Worker" ($worker.code -eq 200) "health endpoint 127.0.0.1:3010"

$web = Http "http://127.0.0.1:3000/"
Result "Web" ($web.code -ge 200 -and $web.code -lt 500) "127.0.0.1:3000"

$runtime = Http "http://127.0.0.1:3000/api/dev/runtime-health"
if ($runtime.code -eq 200) {
  try {
    $health = $runtime.body | ConvertFrom-Json
    State "Provider policy" "INFO" $health.policy
    foreach ($item in @(@{ name = "Runtime database"; value = $health.database.status }, @{ name = "Runtime Redis"; value = $health.redis.status }, @{ name = "Runtime worker"; value = $health.worker.status }, @{ name = "Runtime storage"; value = $health.storage.status }, @{ name = "Runtime RedFox"; value = $health.redfox.status }, @{ name = "Runtime LLM"; value = $health.llm.status }, @{ name = "Runtime ASR"; value = $health.asr.status })) {
      if ($item.value -eq "OK") { State $item.name "OK" }
      elseif ($item.value -eq "UNCONFIGURED") { State $item.name "UNCONFIGURED" }
      else { Result $item.name $false $item.value }
    }
  } catch {
    Result "Runtime Health" $false "invalid response"
  }
} else {
  Result "Runtime Health" $false "web endpoint unavailable"
}

if ($script:failureCount -eq 0) {
  Write-Output "[OK] doctor passed"
  exit 0
}
Write-Output "[FAIL] doctor found $($script:failureCount) blocking checks"
exit 1
