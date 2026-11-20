# Локальный запуск mock-Keycloak (auth-mock) на :3000.
# Разрешаем redirect/CORS и для фронта Компаса (:4200), и для «Плана развития» (:8081),
# чтобы оба были OIDC-клиентами одного Keycloak (единый вход / SSO).
#
# Запуск:   ./run-authmock-local.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$env:ALLOWED_REDIRECT_ORIGINS = "http://localhost:4200,http://localhost:8081"
$env:CORS_ORIGINS = "http://localhost:4200,http://localhost:8081"

# освободить :3000 при зависшем node
$busy = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  $busy | ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq "node") { Write-Host "Освобождаю :3000 (PID $($p.Id))"; Stop-Process -Id $p.Id -Force }
  }
}

Write-Host "mock-Keycloak :3000  |  redirect/CORS: :4200 + :8081  |  SSO-cookie включён"
Set-Location (Join-Path $root "auth-mock")
npm run dev
