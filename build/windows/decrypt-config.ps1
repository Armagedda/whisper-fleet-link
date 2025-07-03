# Decrypt sensitive config files using AES
param(
    [string]$Password = $(Read-Host -Prompt 'Enter decryption password')
)

$files = @('.env.enc', 'backend/backend/config.json.enc')
foreach ($file in $files) {
    if (Test-Path $file) {
        $in = [IO.File]::ReadAllBytes($file)
        $iv = $in[0..15]
        $encrypted = $in[16..($in.Length-1)]
        $key = [System.Text.Encoding]::UTF8.GetBytes($Password.PadRight(32).Substring(0,32))
        $aes = [System.Security.Cryptography.Aes]::Create()
        $aes.Key = $key
        $aes.IV = $iv
        $decryptor = $aes.CreateDecryptor()
        $plaintext = $decryptor.TransformFinalBlock($encrypted, 0, $encrypted.Length)
        $outFile = $file -replace '\.enc$', ''
        [IO.File]::WriteAllBytes($outFile, $plaintext)
        Write-Host "Decrypted $file -> $outFile"
    }
}
Write-Host "Decryption complete. Do not commit plaintext config files!" 