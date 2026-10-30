# ==============================================================================
# DocAgent - 1-Click Interactive Demo Script
# ==============================================================================

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SampleDir = Join-Path $ScriptDir "sample-project"

Write-Host "`n=== DocAgent Quickstart Demo ===" -ForegroundColor Cyan
Write-Host "Target project: $SampleDir`n" -ForegroundColor DarkGray

Push-Location $SampleDir

try {
    # 1. Clean previous runs
    if (Test-Path "docs") { Remove-Item -Recurse -Force "docs" }

    # 2. Initialize configuration
    Write-Host "[1/3] Initializing DocAgent environment..." -ForegroundColor Yellow
    docagent init --non-interactive --provider mock --force

    # 3. Generate comprehensive repository documentation suite
    Write-Host "`n[2/3] Generating full repository documentation suite with AST grounding..." -ForegroundColor Yellow
    docagent generate -p mock

    # 4. Display generated output
    Write-Host "`n[3/3] Documentation Suite Generated!" -ForegroundColor Green
    
    $readmePath = Join-Path $SampleDir "docs/README.md"
    $overviewPath = Join-Path $SampleDir "docs/architecture/overview.md"

    if (Test-Path $readmePath) {
        Write-Host "`n=== docs/README.md Preview ===" -ForegroundColor Cyan
        Get-Content $readmePath | Select-Object -First 25
    }

    if (Test-Path $overviewPath) {
        Write-Host "`n=== docs/architecture/overview.md (with Mermaid Topology) ===" -ForegroundColor Cyan
        Get-Content $overviewPath | Select-Object -First 25
    }

    Write-Host "`nAll 8 documentation files saved to: $(Join-Path $SampleDir 'docs')`n" -ForegroundColor Green
}
finally {
    Pop-Location
}

Write-Host "`nDemo completed successfully! Try running 'docagent init' interactively to configure your API key.`n" -ForegroundColor Green
