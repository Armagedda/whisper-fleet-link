# Secure Build Script for Whisper Fleet Link
# 1. Build backend (Rust)
# 2. Build frontend (Vite)
# 3. Encrypt sensitive configs
# 4. Generate TLS certs
# 5. Sign backend executable and installer
# 6. Package everything into installer

$ErrorActionPreference = 'Stop'

Write-Host "[1/6] Building backend (Rust)..."
cd ../../backend
cargo build --release
cd ../..

Write-Host "[2/6] Building frontend (Vite)..."
npm install
npm run build

Write-Host "[3/6] Encrypting sensitive configuration files..."
powershell -ExecutionPolicy Bypass -File build/windows/encrypt-config.ps1

Write-Host "[4/6] Generating TLS certificates..."
powershell -ExecutionPolicy Bypass -File build/windows/generate-cert.ps1

Write-Host "[5/6] Signing backend executable and installer..."
$CertPath = $env:SIGN_CERT_PATH
$Password = $env:SIGN_CERT_PASSWORD
if (-not $CertPath) { $CertPath = Read-Host 'Path to code signing certificate (.pfx)' }
if (-not $Password) { $Password = Read-Host 'Certificate password' }

$exe = "backend/target/release/backend.exe"
$installer = "build/windows/WhisperFleetLinkSetup.exe"

if (Test-Path $exe) {
    & "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe" sign /f $CertPath /p $Password /tr http://timestamp.digicert.com /td sha256 /fd sha256 $exe
    if ($LASTEXITCODE -ne 0) { Write-Error 'Code signing failed for backend.exe'; exit 1 }
    Write-Host "Signed $exe"
}
if (Test-Path $installer) {
    & "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe" sign /f $CertPath /p $Password /tr http://timestamp.digicert.com /td sha256 /fd sha256 $installer
    if ($LASTEXITCODE -ne 0) { Write-Error 'Code signing failed for installer'; exit 1 }
    Write-Host "Signed $installer"
}

Write-Host "[6/6] Packaging installer..."
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" build/windows/package-installer.iss

Write-Host "Build and packaging complete!" 