$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

Write-Host "启动桌面端（会自动拉起后端）…"
Set-Location "$root\web"
npm run electron:dev
