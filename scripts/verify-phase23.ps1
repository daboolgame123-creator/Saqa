# Phase 23 — exact-commit local verification, intended for Windows / OpenCode.
# Run from the repository root: powershell -NoProfile -File scripts/verify-phase23.ps1
# Runs only standard read/test/build commands. No deployment, DB migration
# against institutional databases, live API calls or report route activation.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'Git is required to record the exact verification commit.'
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'npm is required to run the project verification.'
    }

    $commit = (& git rev-parse --verify HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') {
        throw 'Cannot determine an exact Git commit. No verification was performed.'
    }
    $changes = @(& git status --porcelain --untracked-files=normal)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Git working tree.' }
    if ($changes.Count -gt 0) {
        throw 'Working tree is not clean. Commit or remove local changes before producing exact-commit verification evidence.'
    }

    Write-Host ('PHASE23_VERIFY_SHA=' + $commit)
    Write-Host 'PHASE23_VERIFY_SCOPE=lint,test:server,test:db,test:api,build'
    $tasks = @('lint', 'test:server', 'test:db', 'test:api', 'build')
    foreach ($task in $tasks) {
        Write-Host ('PHASE23_CHECK_BEGIN=' + $task)
        & npm run $task
        $code = $LASTEXITCODE
        if ($code -ne 0) {
            Write-Host ('PHASE23_CHECK_FAILED=' + $task)
            Write-Host ('PHASE23_CHECK_EXIT_CODE=' + $code)
            Write-Host ('PHASE23_VERIFY_SHA=' + $commit)
            exit $code
        }
        Write-Host ('PHASE23_CHECK_PASSED=' + $task)
    }
    $endCommit = (& git rev-parse --verify HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $endCommit -ne $commit) {
        throw 'HEAD changed during verification; results are not exact-SHA evidence.'
    }
    $endChanges = @(& git status --porcelain --untracked-files=normal)
    if ($LASTEXITCODE -ne 0 -or $endChanges.Count -gt 0) {
        throw 'Working tree changed during verification; results are not clean-tree evidence.'
    }
    Write-Host ('PHASE23_VERIFY_PASS_SHA=' + $commit)
}
catch {
    Write-Error ('PHASE23_VERIFY_ERROR=' + $_.Exception.Message)
    exit 1
}
finally {
    Pop-Location
}
