# Локальный запуск бэка «Компас» для нового фронта (frontend-v2).
# Читает секреты из kompas/.env, слушает :8090, БД — Postgres на :5433 (docker),
# Keycloak — mock на :3000 (auth-mock). LLM — по .env (openrouter с живым ключом).
#
# Предпосылки (поднять заранее):
#   docker compose up -d postgres          # Postgres :5433
#   cd auth-mock; npm run dev               # mock-Keycloak :3000
#
# Запуск:   ./run-backend-local.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# --- JDK 21 ---
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"

# --- читаем kompas/.env (KEY=VALUE, # — комментарии) ---
$envFile = Join-Path $root ".env"
$cfg = @{}
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $cfg[$matches[1]] = $matches[2].Trim() }
  }
}

# --- порт и БД ---
$env:SERVER_PORT = "8090"
$env:SPRING_DATASOURCE_URL = "jdbc:postgresql://localhost:5433/kompas"

# --- LLM (из .env; дефолт — mock, если ключа нет) ---
$env:KOMPAS_LLM_PROVIDER        = if ($cfg.LLM_PROVIDER)        { $cfg.LLM_PROVIDER }        else { "mock" }
$env:KOMPAS_LLM_BASE_URL        = if ($cfg.LLM_BASE_URL)        { $cfg.LLM_BASE_URL }        else { "https://openrouter.ai/api/v1" }
$env:KOMPAS_LLM_API_KEY         = $cfg.LLM_API_KEY
$env:KOMPAS_LLM_MODEL           = if ($cfg.LLM_MODEL)           { $cfg.LLM_MODEL }           else { "openai/gpt-4o-mini" }
$env:KOMPAS_LLM_FALLBACK_MODEL  = $cfg.LLM_FALLBACK_MODEL
$env:KOMPAS_SECURITY_JWT_SECRET = if ($cfg.JWT_SECRET)         { $cfg.JWT_SECRET }         else { "kompas-local-mock-hmac-secret-please-change-0123456789" }

# --- освободить :8090, если держит зависший java от прошлого запуска ---
$busy = Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  $busy | ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq "java") { Write-Host "Освобождаю :8090 (PID $($p.Id))"; Stop-Process -Id $p.Id -Force }
  }
}

Write-Host "LLM: $($env:KOMPAS_LLM_PROVIDER):$($env:KOMPAS_LLM_MODEL)  |  порт :8090  |  Keycloak issuer по умолчанию :3000"
Set-Location (Join-Path $root "backend")
.\gradlew.bat bootRun --no-daemon
