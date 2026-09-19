# ULTRON installer for Windows 11 (PowerShell)
#
# NOTE: authored on Linux — reviewed carefully but NOT executed on Windows by
# the author. It performs plain, inspectable steps (node check → npm install →
# .env → drizzle push → build). If anything misbehaves, follow
# docs/SETUP-WINDOWS.md manually; every step is documented there.
#
# Usage (from the repo root):
#   powershell -ExecutionPolicy Bypass -File .\install.ps1

$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host "`n[ultron] $msg" -ForegroundColor Yellow }

Step "Checking Node.js (needs v22+)"
$nodeVersion = (node -v) 2>$null
if (-not $nodeVersion) { throw "node not found. Install Node.js 22 LTS from https://nodejs.org and re-run." }
Write-Host "       found $nodeVersion"

Step "Checking npm"
$npmVersion = (npm -v)
Write-Host "       npm $npmVersion"

Step "Preparing .env"
if (Test-Path .env) {
  Write-Host "       .env already exists — leaving it untouched"
} else {
  $pgPass = Read-Host "       PostgreSQL 'postgres' user password (created during PostgreSQL install)"
  @"
DATABASE_URL=postgresql://postgres:$pgPass@127.0.0.1:5432/app_db
# Optional local brain (Ollama):
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_MODEL=llama3.2:3b
# Optional cloud brain:
# ULTRON_BRAIN=cloud
# ULTRON_BRAIN_API_KEY=your-key-here
# ULTRON_BRAIN_MODEL=your-model-id
"@ | Out-File -Encoding utf8 .env
  Write-Host "       wrote .env"
}

Step "Installing dependencies (npm install)"
npm install

Step "Applying database schema (drizzle-kit push)"
npx drizzle-kit push

Step "Building ULTRON (npm run build)"
npm run build

Write-Host "`n[ultron] Done. Launch with:  node bin/ultron.mjs" -ForegroundColor Green
Write-Host "[ultron] Then open:          http://localhost:3000/presence  (Chrome/Edge)" -ForegroundColor Green
Write-Host "[ultron] Diagnostics:        http://localhost:3000/api/doctor" -ForegroundColor Green
