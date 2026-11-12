# Windows PowerShell 5.1+. Review before running; no machine-wide settings/services.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][ValidateSet('InitializeKey', 'Bootstrap', 'Server')][string]$Mode)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or $env:NODE_ENV -cne 'test') {
    throw 'Local staging launcher stopped. stage=launcher_preflight code=ENV_REJECTED. Windows and explicit NODE_ENV=test are required.'
}
$root = Split-Path $PSScriptRoot -Parent
$keyDir = Join-Path $env:LOCALAPPDATA 'ALSQAYA-Staging'
$keyFile = Join-Path $keyDir 'auth-key.dpapi.xml'
if ([IO.Path]::GetFullPath($keyDir).StartsWith([IO.Path]::GetFullPath($root) + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Key storage must be outside the checkout.'
}

if ($Mode -eq 'InitializeKey') {
    if (Test-Path -LiteralPath $keyDir) { throw 'Key directory already exists. Never overwrite or regenerate a staging key.' }
    if ((Read-Host 'Type CREATE LOCAL STAGING KEY to create a persistent DPAPI key') -cne 'CREATE LOCAL STAGING KEY') {
        throw 'Cancelled.'
    }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($sid)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    # ACL is applied at creation, before any key material is written.
    [IO.Directory]::CreateDirectory($keyDir, $acl) | Out-Null
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        $secureKey = ConvertTo-SecureString ([Convert]::ToBase64String($bytes)) -AsPlainText -Force
        # Windows Export-Clixml encrypts SecureString with DPAPI CurrentUser.
        $secureKey | Export-Clixml -LiteralPath $keyFile -NoClobber
    } finally {
        [Array]::Clear($bytes, 0, $bytes.Length)
        $rng.Dispose()
        if ($secureKey) { $secureKey.Dispose() }
    }
    Write-Host 'Staging key created outside Git, protected for this Windows user. It was not displayed.'
    return
}

if (!(Test-Path -LiteralPath $keyFile -PathType Leaf) -or
    ((Get-Item -LiteralPath $keyDir).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
    ((Get-Item -LiteralPath $keyFile).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Local staging launcher stopped. stage=key_file code=KEY_FILE_INVALID. No key will be generated automatically.'
}
$saved = @{}
foreach ($name in @('AUTH_SECRET_KEY', 'DATABASE_URL', 'AUTH_OTP_PROVIDER')) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$exitCode = 1
$stage = 'dpapi_load'
$failureCode = 'KEY_LOAD_FAILED'
try {
    $secureKey = Import-Clixml -LiteralPath $keyFile
    if ($secureKey -isnot [Security.SecureString]) { throw 'Invalid protected key.' }
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try { $env:AUTH_SECRET_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secureKey.Dispose() }
    if ($env:AUTH_SECRET_KEY -cnotmatch '^[A-Za-z0-9+/]{43}=$') { throw 'Invalid protected key.' }

    $stage = 'credentials'
    $failureCode = 'CREDENTIAL_INPUT_FAILED'
    $dbUser = Read-Host 'PostgreSQL staging user (target is fixed: 127.0.0.1:5433/alsqaya_staging)'
    if ([string]::IsNullOrWhiteSpace($dbUser)) { throw 'Database user required.' }
    $dbPassword = Read-Host 'PostgreSQL password (hidden; never saved)' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword)
    try {
        $encodedPassword = [Uri]::EscapeDataString([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr))
        $env:DATABASE_URL = 'postgresql://' + [Uri]::EscapeDataString($dbUser) + ':' + $encodedPassword + '@127.0.0.1:5433/alsqaya_staging'
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        $dbPassword.Dispose()
        $encodedPassword = $null
    }
    $env:AUTH_OTP_PROVIDER = 'admin'
    $stage = 'node_launch'
    $failureCode = 'NODE_LAUNCH_FAILED'
    Push-Location $root
    try {
        if ($Mode -eq 'Bootstrap') {
            & node --import tsx scripts/localStagingAdmin.ts --execute
        } else {
            & node --import tsx scripts/localStagingServer.ts
        }
        $exitCode = $LASTEXITCODE
    } finally { Pop-Location }
} catch {
    # Never surface Exception/InvocationInfo: they may include sensitive input.
    throw "Local staging launcher stopped. stage=$stage code=$failureCode. No automatic retry; do not regenerate the key."
} finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
if ($exitCode -ne 0) { throw 'Local staging launcher stopped. stage=node_exit code=CHILD_FAILED. Use the preceding safe Node diagnostic; do not regenerate the key or retry automatically.' }
