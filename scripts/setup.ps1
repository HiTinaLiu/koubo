$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

python -m pip install -r requirements.txt
Set-Location "$root\web"
npm install
Set-Location "$root\remotion"
npm install
npx remotion browser ensure
