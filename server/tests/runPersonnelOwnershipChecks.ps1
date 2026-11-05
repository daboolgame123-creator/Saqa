# PREPARED ONLY. Run after explicit approval; includes migrations in a NEW test cluster.
# Proven 2026-11-04: hashing the source aborts with IOException (surfaced as AggregateException)
# whenever a file inside the source tree is held open for writing - most commonly this script's
# own output redirected into the project. Always redirect run logs to a path OUTSIDE the source
# tree. CopyVerificationSha256 now names the failing file, exception type and inner message.
param([switch]$PreflightOnly)
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$tempRoot = Join-Path $env:LOCALAPPDATA 'Temp\opencode'
$sandbox = Join-Path $tempRoot ('ALSQAYA-personnel-checks-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
if (Test-Path -LiteralPath $sandbox) { throw 'Sandbox already exists' }
if ($sandbox -match '[^\x00-\x7F]') { throw 'An ASCII sandbox is required for embedded PostgreSQL' }
$files = [Collections.Generic.List[IO.FileInfo]]::new()
$stack = [Collections.Generic.Stack[string]]::new()
$stack.Push($source)
while ($stack.Count) {
  foreach ($item in Get-ChildItem -LiteralPath $stack.Pop() -Force) {
    $relative = $item.FullName.Substring($source.Length + 1)
    if ($item.Name -eq '.git' -or $relative -eq 'dist' -or $item.Name -like '.env*') { continue }
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point: $relative" }
    if ($item.PSIsContainer) { $stack.Push($item.FullName) } else { $files.Add($item) }
  }
}
# One robocopy process replaces ~65k per-file cmdlet calls (New-Item/Copy-Item/Get-FileHash).
# node_modules stays a real copy: no npm install, no symlinks, no hardlinks.
# SHA-256 verification stays exhaustive; hashing is parallel because this volume costs
# ~168 s per full serial pass over the 16k copied files.
$manifest = @{}
if ($files.Count -eq 0) { throw 'No source files found to copy' }
$robocopyExe = (Get-Command robocopy -CommandType Application -ErrorAction SilentlyContinue).Source
if (!$robocopyExe) { throw 'robocopy is required' }
if (-not ('CopyVerificationSha256' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Threading.Tasks;
public static class CopyVerificationSha256 {
  public static string[] Hash(IEnumerable<string> files) {
    string[] paths = new List<string>(files).ToArray();
    string[] hashes = new string[paths.Length];
    Parallel.For(0, paths.Length, i => {
      try {
        using (var sha = SHA256.Create())
        using (var stream = File.OpenRead(paths[i])) {
          byte[] hash = sha.ComputeHash(stream);
          var text = new System.Text.StringBuilder(hash.Length * 2);
          foreach (byte b in hash) text.Append(b.ToString("X2"));
          hashes[i] = text.ToString();
        }
      } catch (Exception ex) {
        // Diagnosis: name the failing file + exception type + message, then re-throw so no
        // mismatched copy is ever accepted (the AggregateException still aborts the run).
        Console.Error.WriteLine("SHA256_HASH_FAILED path={0} type={1} message={2}", paths[i], ex.GetType().FullName, ex.Message);
        throw;
      }
    });
    return hashes;
  }
}
'@
}
New-Item -ItemType Directory -Path $sandbox | Out-Null
$robocopyOutput = & $robocopyExe $source $sandbox /E /COPY:DAT /DCOPY:DAT /XJ /R:1 /W:1 /MT:16 `
  /NFL /NDL /NJH /NJS /NP /XD '.git' '.env*' (Join-Path $source 'dist') /XF '.git' '.env*' (Join-Path $source 'dist') 2>&1
$robocopyExitCode = $LASTEXITCODE
# Robocopy codes 0-7 are success (including "extra files"); 8+ is a real failure.
if ($robocopyExitCode -ge 8) {
  $detail = (@($robocopyOutput | Select-Object -Last 5) -join ' | ')
  throw ('robocopy failed with exit code {0}: {1}' -f $robocopyExitCode, $detail)
}

$relativePaths = [string[]]@($files | ForEach-Object { $_.FullName.Substring($source.Length + 1) })
$destinationPaths = [string[]]@($relativePaths | ForEach-Object { Join-Path $sandbox $_ })
foreach ($path in $destinationPaths) {
  if (![IO.File]::Exists($path)) { throw "Missing copy: $($path.Substring($sandbox.Length + 1))" }
}
$sourceHashes = [CopyVerificationSha256]::Hash([string[]]@($files | ForEach-Object { $_.FullName }))
$destinationHashes = [CopyVerificationSha256]::Hash($destinationPaths)
for ($i = 0; $i -lt $relativePaths.Count; $i++) {
  if ($sourceHashes[$i] -ne $destinationHashes[$i]) { throw "Copy mismatch: $($relativePaths[$i])" }
  $manifest[$relativePaths[$i]] = $sourceHashes[$i]
}
# Keep the copy exact: no extra file may exist beyond the verified manifest.
$sandboxFiles = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$stack.Clear()
$stack.Push($sandbox)
while ($stack.Count) {
  foreach ($item in Get-ChildItem -LiteralPath $stack.Pop() -Force) {
    if ($item.PSIsContainer) { $stack.Push($item.FullName) }
    else { [void]$sandboxFiles.Add($item.FullName.Substring($sandbox.Length + 1)) }
  }
}
foreach ($relative in $sandboxFiles) {
  if (!$manifest.ContainsKey($relative)) { throw "Unexpected copied file: $relative" }
}
function Get-FreePort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    if ($port -lt 49152) { throw 'Expected a dynamic high port' }
    return $port
  } finally { $listener.Stop() }
}
$dbPort = Get-FreePort
$httpPort = Get-FreePort
while ($httpPort -eq $dbPort) { $httpPort = Get-FreePort }
@{
  root = $sandbox; dbPort = $dbPort; httpPort = $httpPort
  database = 'alsqaya_personnel_test'; user = 'alsqaya_personnel_test'
  password = [Guid]::NewGuid().ToString('N')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $sandbox '.personnel-isolation.json') -Encoding UTF8

$savedEnvironment = @{}
foreach ($entry in Get-ChildItem Env:) { $savedEnvironment[$entry.Name] = $entry.Value }
$results = [Collections.Generic.List[object]]::new()
function Set-Guard([string]$name) {
  $guard = Join-Path $sandbox "server\tests\helpers\$name"
  if (!(Test-Path -LiteralPath $guard)) { throw "Missing guard: $name" }
  $env:NODE_OPTIONS = '--require="' + $guard.Replace('\', '/') + '"'
}
function Invoke-Check([string]$name, [string[]]$arguments, [string]$log) {
  $process = Start-Process -FilePath (Get-Command node -CommandType Application).Source `
    -ArgumentList $arguments -WorkingDirectory $sandbox -Wait -PassThru -NoNewWindow `
    -RedirectStandardOutput (Join-Path $sandbox "$log.log") `
    -RedirectStandardError (Join-Path $sandbox "$log.stderr.log")
  $results.Add([pscustomobject]@{ Check=$name; ExitCode=$process.ExitCode; Log="$log.log"; Stderr="$log.stderr.log" })
  if ($process.ExitCode -ne 0) { throw "Check failed: $name. Stopping; logs in $sandbox" }
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
  $env:ALSQAYA_PERSONNEL_ISOLATED = '1'
  $env:TEMP = Join-Path $sandbox '.check-tmp'
  $env:TMP = $env:TEMP
  New-Item -ItemType Directory -Path $env:TEMP | Out-Null
  Set-Guard 'personnelIsolation.cjs'
  Invoke-Check 'HTTP/SQL isolation negative preflight' @('server/tests/helpers/personnelIsolationPreflight.cjs') 'personnel-preflight'
  if (-not $PreflightOnly) {
    Set-Guard 'personnelIsolation.cjs'
    Invoke-Check 'Fail-closed units' @('--import','tsx','--test','--test-concurrency=1','server/tests/personnelOwnership.test.ts') 'unit-tests'
    Set-Guard 'personnelIsolation.cjs'
    Invoke-Check 'Personnel real HTTP + SQL integration' @('--import','tsx','--test','--test-concurrency=1','server/tests/security/personnelOwnership.integration.test.ts') 'integration-tests'
    Set-Guard 'personnelIsolation.cjs'
    Invoke-Check 'TypeScript' @('node_modules/typescript/bin/tsc','--noEmit') 'typescript'
    Invoke-Check 'Vite build' @('node_modules/vite/bin/vite.js','build','--mode','personnel-isolated') 'build'
  }
} finally {
  $results | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $sandbox 'personnel-results.json') -Encoding UTF8
  foreach ($entry in Get-ChildItem Env:) {
    if (!$savedEnvironment.ContainsKey($entry.Name)) { [Environment]::SetEnvironmentVariable($entry.Name, $null, 'Process') }
  }
  foreach ($key in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process') }
  $manifestKeys = [string[]]@($manifest.Keys)
  $currentPaths = [string[]]@($manifestKeys | ForEach-Object { Join-Path $source $_ })
  foreach ($path in $currentPaths) {
    if (![IO.File]::Exists($path)) { throw "Original source changed during checks: $($path.Substring($source.Length + 1))" }
  }
  $currentHashes = [CopyVerificationSha256]::Hash($currentPaths)
  for ($i = 0; $i -lt $manifestKeys.Count; $i++) {
    if ($currentHashes[$i] -ne $manifest[$manifestKeys[$i]]) {
      throw "Original source changed during checks: $($manifestKeys[$i])"
    }
  }
  [pscustomobject]@{ Sandbox=$sandbox; Results=$results } | ConvertTo-Json -Depth 4
}
