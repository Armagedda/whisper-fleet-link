# Encrypt sensitive config files using AES
param(
    [string]$Password = $(Read-Host -Prompt 'Enter encryption password')
)

$files = @('.env', 'backend/backend/config.json')
foreach ($file in $files) {
    if (Test-Path $file) {
        $plaintext = Get-Content $file -Raw
        $key = [System.Text.Encoding]::UTF8.GetBytes($Password.PadRight(32).Substring(0,32))
        $aes = [System.Security.Cryptography.Aes]::Create()
        $aes.Key = $key
        $aes.GenerateIV()
        $iv = $aes.IV
        $encryptor = $aes.CreateEncryptor()
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($plaintext)
        $encrypted = $encryptor.TransformFinalBlock($bytes, 0, $bytes.Length)
        $out = $iv + $encrypted
        [IO.File]::WriteAllBytes("$file.enc", $out)
        Write-Host "Encrypted $file -> $file.enc"
    }
}
Write-Host "Encryption complete. Do not commit plaintext config files!" 