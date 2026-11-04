# Execute only after explicit approval. All checks run in a fresh disposable copy.
param([switch]$PreflightOnly)

$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$tempRoot = Join-Path $env:LOCALAPPDATA 'Temp\opencode'
$sandbox = Join-Path $tempRoot ('ALSQAYA-phase23-p0-checks-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
if (Test-Path -LiteralPath $sandbox) { throw 'Sandbox already exists' }

# Enumerate explicitly: never traverse reparse points or copy an environment file.
$files = [Collections.Generic.List[IO.FileInfo]]::new()
$stack = [Collections.Generic.Stack[string]]::new()
$stack.Push($source)
while ($stack.Count) {
  foreach ($item in Get-ChildItem -LiteralPath $stack.Pop() -Force) {
    $relative = $item.FullName.Substring($source.Length + 1)
    if ($item.Name -eq '.git' -or $relative -eq 'dist' -or $item.Name -like '.env*') { continue }
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
      throw "Cannot safely copy reparse point: $relative"
    }
    if ($item.PSIsContainer) { $stack.Push($item.FullName) } else { $files.Add($item) }
  }
}
New-Item -ItemType Directory -Path $sandbox | Out-Null
foreach ($file in $files) {
  $relative = $file.FullName.Substring($source.Length + 1)
  $destination = Join-Path $sandbox $relative
  New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $destination
  if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) {
    throw "Sandbox copy mismatch: $relative"
  }
}

$savedEnvironment = @{}
foreach ($entry in Get-ChildItem Env:) { $savedEnvironment[$entry.Name] = $entry.Value }
$originalLocation = Get-Location
$results = [Collections.Generic.List[object]]::new()
function Invoke-Check([string]$name, [string[]]$arguments, [string]$log) {
  $process = Start-Process -FilePath (Get-Command node -CommandType Application).Source `
    -ArgumentList $arguments -WorkingDirectory $sandbox -Wait -PassThru -NoNewWindow `
    -RedirectStandardOutput (Join-Path $sandbox "$log.log") `
    -RedirectStandardError (Join-Path $sandbox "$log.stderr.log")
  $results.Add([pscustomobject]@{ Check = $name; ExitCode = $process.ExitCode; Log = "$log.log"; Stderr = "$log.stderr.log" })
}
try {
  foreach ($key in @($savedEnvironment.Keys)) {
    if ($key -match '^(PG|DATABASE_|DB_|VITE_)' -or $key -in @('NODE_OPTIONS', 'NODE_PATH')) {
      [Environment]::SetEnvironmentVariable($key, $null, 'Process')
    }
  }
  $env:NODE_ENV = 'test'
  $env:DATABASE_URL = ''
  $env:ATTACHMENT_STORAGE_DIR = ''
  $env:TEMP = Join-Path $sandbox '.check-tmp'
  $env:TMP = $env:TEMP
  New-Item -ItemType Directory -Path $env:TEMP | Out-Null
  $guard = Join-Path $sandbox 'server\tests\helpers\reportP0Isolation.cjs'
  if (-not (Test-Path -LiteralPath $guard -PathType Leaf)) { throw 'Isolation guard is missing' }
  # NODE_OPTIONS parses backslashes as escapes inside quotes; Node accepts '/' on Windows.
  $env:NODE_OPTIONS = '--require="' + $guard.Replace('\', '/') + '"'
  Set-Location -LiteralPath $sandbox

  Invoke-Check 'Isolation preflight' @('server/tests/helpers/reportP0Preflight.cjs') 'p0-preflight'
  if ($results[$results.Count - 1].ExitCode -ne 0) {
    $results | ConvertTo-Json | Set-Content -LiteralPath 'p0-results.json' -Encoding UTF8
    throw "Isolation preflight failed; no further checks started. Logs: $sandbox"
  }

  # Explicit files only: never test:api/test:db/test:all or server startup.
  if (-not $PreflightOnly) {
    Invoke-Check 'P0 regressions' @('--import', 'tsx', '--test', '--test-concurrency=1', 'server/tests/reportP0.test.ts') 'p0-tests'
    Invoke-Check 'TypeScript' @('node_modules/typescript/bin/tsc', '--noEmit') 'p0-typescript'
    Invoke-Check 'Vite build' @('node_modules/vite/bin/vite.js', 'build', '--mode', 'p0-isolated') 'p0-build'
  }
  $results | ConvertTo-Json | Set-Content -LiteralPath 'p0-results.json' -Encoding UTF8
  [pscustomobject]@{ Sandbox = $sandbox; Results = $results } | ConvertTo-Json -Depth 4
} finally {
  Set-Location -LiteralPath $originalLocation.Path
  foreach ($entry in Get-ChildItem Env:) {
    if (-not $savedEnvironment.ContainsKey($entry.Name)) {
      [Environment]::SetEnvironmentVariable($entry.Name, $null, 'Process')
    }
  }
  foreach ($key in $savedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process')
  }
}
if (@($results | Where-Object ExitCode -ne 0).Count) { exit 1 }
