# Generate self-signed TLS certificate for HTTPS
$certPath = "backend/cert.pem"
$keyPath = "backend/key.pem"

if (Test-Path $certPath) { Remove-Item $certPath }
if (Test-Path $keyPath) { Remove-Item $keyPath }

openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes -keyout $keyPath -out $certPath -subj "/CN=WhisperFleetLink"
Write-Host "Generated self-signed TLS certificate and key." 