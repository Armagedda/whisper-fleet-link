# Sign the backend Windows executable
param(
    [string]$CertPath = $(Read-Host -Prompt 'Path to code signing certificate (.pfx)'),
    [string]$Password = $(Read-Host -Prompt 'Certificate password')
)

$exe = "backend/target/release/backend.exe"
if (Test-Path $exe) {
    & "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe" sign /f $CertPath /p $Password /tr http://timestamp.digicert.com /td sha256 /fd sha256 $exe
    Write-Host "Signed $exe"
} else {
    Write-Host "Executable not found: $exe"
} 