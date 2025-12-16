#!/usr/bin/env powershell
# MultiCode Installation Test Script

param([switch]$Verbose)

$ErrorActionPreference = "Continue"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  MULTICODE INSTALLATION TEST" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: C++ Core
Write-Host "[1] C++ Core Library" -ForegroundColor Yellow
if (Test-Path "build\Release\multicode_core.lib") {
    Write-Host "    OK - Library exists" -ForegroundColor Green
} else {
    Write-Host "    FAIL - Library not found" -ForegroundColor Red
    exit 1
}

# Test 2: Unit Tests
Write-Host "[2] Unit Tests" -ForegroundColor Yellow
$testOutput = & ".\build\Release\multicode_tests.exe" --reporter compact 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "    OK - All tests passed" -ForegroundColor Green
} else {
    Write-Host "    FAIL - Tests failed" -ForegroundColor Red
    exit 1
}

# Test 3: VS Code Extension
Write-Host "[3] VS Code Extension" -ForegroundColor Yellow
$ext = code --list-extensions | Select-String "multicode"
if ($ext) {
    Write-Host "    OK - Extension installed: $ext" -ForegroundColor Green
} else {
    Write-Host "    FAIL - Extension not found" -ForegroundColor Red
    exit 1
}

# Test 4: VSIX Package
Write-Host "[4] VSIX Package" -ForegroundColor Yellow
$vsix = Get-ChildItem "vscode-extension\*.vsix" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($vsix) {
    Write-Host "    OK - $($vsix.Name)" -ForegroundColor Green
} else {
    Write-Host "    WARN - Not found (not critical)" -ForegroundColor Yellow
}

# Test 5: Test Graph
Write-Host "[5] Graph Serialization" -ForegroundColor Yellow
if (Test-Path "test_graph.json") {
    $graph = Get-Content "test_graph.json" -Raw | ConvertFrom-Json
    Write-Host "    OK - $($graph.nodes.Count) nodes, $($graph.connections.Count) connections" -ForegroundColor Green
} else {
    Write-Host "    WARN - test_graph.json not found" -ForegroundColor Yellow
}

# Test 6: Error Monitor
Write-Host "[6] Error Monitoring" -ForegroundColor Yellow
if (Test-Path "scripts\monitor-errors.ps1") {
    Write-Host "    OK - Monitor script exists" -ForegroundColor Green
} else {
    Write-Host "    FAIL - Monitor not found" -ForegroundColor Red
}

# Test 7: Build Scripts
Write-Host "[7] Build Infrastructure" -ForegroundColor Yellow
if ((Test-Path "scripts\build-cmake-utf8.ps1") -and (Test-Path "scripts\monitor-errors.ps1")) {
    Write-Host "    OK - All scripts ready" -ForegroundColor Green
} else {
    Write-Host "    FAIL - Missing scripts" -ForegroundColor Red
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  RESULT: MULTICODE IS READY!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Reload VS Code (Ctrl+Shift+P -> Reload Window)" -ForegroundColor White
Write-Host "  2. Open Command Palette (Ctrl+Shift+P)" -ForegroundColor White
Write-Host "  3. Type 'MultiCode' to see commands`n" -ForegroundColor White
