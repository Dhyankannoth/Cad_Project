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
    # 1. Initialize configuration
    Write-Host "[1/4] Initializing DocAgent environment..." -ForegroundColor Yellow
    docagent init --non-interactive --provider mock --force

    # 2. Scan repository
    Write-Host "`n[2/4] Scanning sample repository..." -ForegroundColor Yellow
    docagent scan

    # 3. Generate documentation
    Write-Host "`n[3/4] Generating grounded documentation for src/orderService.ts..." -ForegroundColor Yellow
    docagent generate src/orderService.ts -p mock

    # 4. Validate documentation
    Write-Host "`n[4/4] Validating generated documentation against codebase AST..." -ForegroundColor Yellow
    docagent validate docs/generated/orderService_ts.md

    # Display generated output
    $docPath = Join-Path $SampleDir "docs/generated/orderService_ts.md"
    if (Test-Path $docPath) {
        Write-Host "`n=== Generated Documentation Preview ===" -ForegroundColor Green
        Get-Content $docPath | Select-Object -First 30
        Write-Host "`nFull document saved to: $docPath" -ForegroundColor Cyan
    }
}
finally {
    Pop-Location
}

Write-Host "`nDemo completed successfully! Try running 'docagent init' interactively to configure your API key.`n" -ForegroundColor Green
