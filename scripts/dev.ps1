$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

Write-Host "Electron 桌面端启动中…"
Set-Location "$root\web"
npm run electron:dev
