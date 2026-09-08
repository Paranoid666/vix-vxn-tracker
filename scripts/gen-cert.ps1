# Generates a self-signed TLS certificate so this app can be served over HTTPS
# on your LAN -- required for Web Push to work from an Android phone.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root "certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$key = Join-Path $certDir "key.pem"
$cert = Join-Path $certDir "cert.pem"

if (Test-Path $key -and Test-Path $cert) {
    Write-Host "Certificate already exists: $cert"
    exit 0
}

Write-Host "Generating self-signed certificate..."
openssl req -x509 -newkey rsa:2048 -nodes -days 365 `
  -keyout $key -out $cert `
  -subj "/CN=localhost" `
  -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"

Write-Host ""
Write-Host "Certificates written to:"
Write-Host "  Key : $key"
Write-Host "  Cert: $cert"
Write-Host ""
Write-Host "Next: run  `$env:HTTPS='1'; npm start"
Write-Host "Then open https://<your-LAN-IP>:8788 on your phone (accept the cert warning)."
