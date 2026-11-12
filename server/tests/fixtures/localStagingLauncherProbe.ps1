# No DPAPI/file access or staging child: fixed synthetic input and mocked I/O.
param([ValidateSet('dpapi', 'credentials', 'child')][string]$Scenario)
$ErrorActionPreference = 'Stop'
$global:ProbeNodeExecutable = (Get-Command node -CommandType Application -ErrorAction Stop).Source
$global:ProbeChildCalls = 0
$sentinel = 'SYNTHETIC-PRIVATE-DO-NOT-PRINT'
$env:NODE_ENV = 'test'
$env:AUTH_SECRET_KEY = $sentinel
$env:DATABASE_URL = $sentinel
$env:AUTH_OTP_PROVIDER = $sentinel

function Test-Path { param($LiteralPath, $PathType) return $true }
function Get-Item { param($LiteralPath) return [pscustomobject]@{ Attributes = 0 } }
function Import-Clixml {
    param($LiteralPath)
    if ($Scenario -eq 'dpapi') { throw $sentinel }
    # Fixed test vector, never generated/persisted; does not decrypt any user file.
    return ConvertTo-SecureString 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=' -AsPlainText -Force
}
function Read-Host {
    param($Prompt, [switch]$AsSecureString)
    if ($Scenario -eq 'credentials') { throw $sentinel }
    if ($AsSecureString) { return ConvertTo-SecureString $sentinel -AsPlainText -Force }
    return 'synthetic'
}
function node {
    $global:ProbeChildCalls++
    # Ignores the supplied staging command; launches ONLY this fixed diagnostic.
    & $global:ProbeNodeExecutable -e "process.stderr.write('Staging setup stopped. stage=connect code=28P01 outcome=NOT_STARTED cleanup=none. No automatic retry.\n'); process.exitCode = 1;"
    $global:LASTEXITCODE = $LASTEXITCODE
}

$message = ''
try { & (Join-Path $PSScriptRoot '../../../scripts/local-staging.ps1') -Mode Server }
catch { $message = $_.Exception.Message }
if (!$message -or $message.Contains($sentinel)) { throw 'Unsafe or missing launcher diagnostic.' }
$expected = switch ($Scenario) {
    'dpapi' { 'stage=dpapi_load code=KEY_LOAD_FAILED' }
    'credentials' { 'stage=credentials code=CREDENTIAL_INPUT_FAILED' }
    'child' { 'stage=node_exit code=CHILD_FAILED' }
}
if (!$message.Contains($expected)) {
    $safePhase = [regex]::Match($message, 'stage=[a-z_]+ code=[A-Z_]+').Value
    throw "Wrong launcher phase: $safePhase"
}
foreach ($name in @('AUTH_SECRET_KEY', 'DATABASE_URL', 'AUTH_OTP_PROVIDER')) {
    if ([Environment]::GetEnvironmentVariable($name, 'Process') -cne $sentinel) {
        throw 'Launcher did not restore process environment.'
    }
}
if ($global:ProbeChildCalls -ne [int]($Scenario -eq 'child')) { throw 'Unexpected child invocation.' }
Write-Output 'MOCK_LAUNCHER_PASS'
