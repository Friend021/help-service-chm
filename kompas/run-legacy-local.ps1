# Локальный запуск заглушки «План развития» (legacy-stub) на :8081.
# Общий HMAC-секрет с бэком берётся из kompas/.env (JWT_SECRET), чтобы entry-токен
# и handover-токен проверялись «Компасом». Кнопка перехода ведёт на новый фронт :4200/entry.
#
# Запуск:   ./run-legacy-local.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"

# секрет из .env
$secret = "kompas-local-mock-hmac-secret-please-change-0123456789"
$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*JWT_SECRET\s*=\s*(.*)$') { $secret = $matches[1].Trim() }
  }
}
$env:LEGACY_JWT_SECRET = $secret
$env:LEGACY_KOMPAS_FRONTEND_URL = "http://localhost:4200"

# освободить :8081 при зависшем java
$busy = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  $busy | ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq "java") { Write-Host "Освобождаю :8081 (PID $($p.Id))"; Stop-Process -Id $p.Id -Force }
  }
}

Write-Host "«План развития» (legacy-stub) :8081  →  переход на http://localhost:4200/entry"
Set-Location (Join-Path $root "legacy-stub")
.\gradlew.bat bootRun --no-daemon
