$ErrorActionPreference = "Stop"

Write-Host "Starting installation process..." -ForegroundColor Cyan

# Check for required tools
if (!(Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Error "cargo could not be found. Please install Rust and Cargo."
    exit 1
}

if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm could not be found. Please install Node.js and npm."
    exit 1
}

# Build CLI
Write-Host "Building CLI..." -ForegroundColor Cyan
Push-Location cli
cargo build --release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location
Write-Host "CLI built successfully." -ForegroundColor Green

# Build Daemon
Write-Host "Building Daemon..." -ForegroundColor Cyan
Push-Location daemon
npm install
npm run build:pkg
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Packaging Daemon..." -ForegroundColor Cyan
# Use npx to run pkg without global installation
# Target Windows x64 Node 18 (pkg 5.8.1 limit)
npx pkg . --targets node18-win-x64 --output tab-daemon.exe
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location
Write-Host "Daemon built and packaged successfully." -ForegroundColor Green

# Organize executables
Write-Host "Organizing executables..." -ForegroundColor Cyan
if (!(Test-Path "bin")) {
    New-Item -ItemType Directory -Force -Path "bin" | Out-Null
}

# Copy CLI binary
if (Test-Path "cli\target\release\tab.exe") {
    Copy-Item "cli\target\release\tab.exe" -Destination "bin\" -Force
} else {
    Write-Error "Error: CLI binary not found at cli\target\release\tab.exe"
    exit 1
}

# Move Daemon binary
if (Test-Path "daemon\tab-daemon.exe") {
    Move-Item "daemon\tab-daemon.exe" -Destination "bin\" -Force
} else {
    Write-Error "Error: Daemon binary not found at daemon\tab-daemon.exe"
    exit 1
}

Write-Host "Installation complete!" -ForegroundColor Green
Write-Host "Executables are located in:" -ForegroundColor Green
Write-Host "  - bin\tab.exe"
Write-Host "  - bin\tab-daemon.exe"
