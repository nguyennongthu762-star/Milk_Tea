$ErrorActionPreference = 'Stop'
# A native command's stderr contains the detailed, sanitized Node error.
# Do not turn it into a generic PowerShell exception or print command environment.
if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
    $PSNativeCommandUseErrorActionPreference = $false
}
$previousAdminName = $env:ADMIN_USERNAME
$previousAdminPassword = $env:ADMIN_PASSWORD
$credentialPointer = [IntPtr]::Zero
$secureAdminPassword = $null
$adminExitCode = 1
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Không tìm thấy Node.js. Cài Node.js 22 trở lên và mở lại Terminal.'
    }
    $adminName = Read-Host 'Tên đăng nhập admin (3–80 ký tự: a-z, 0-9, _, ., -)'
    $secureAdminPassword = Read-Host 'Mật khẩu admin (12–200 ký tự)' -AsSecureString
    $env:ADMIN_USERNAME = $adminName
    $credentialPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureAdminPassword)
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($credentialPointer)
    & node "$PSScriptRoot/create-admin.mjs"
    $adminExitCode = $LASTEXITCODE
} finally {
    $env:ADMIN_USERNAME = $previousAdminName
    $env:ADMIN_PASSWORD = $previousAdminPassword
    if ($credentialPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($credentialPointer) }
    if ($null -ne $secureAdminPassword) { $secureAdminPassword.Dispose() }
}
exit $adminExitCode
