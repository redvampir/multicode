# Test script for MultiCode extension installation
# Usage: .\test-install.ps1

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== MultiCode Installation Tests ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check VSIX file
Write-Host "[Test 1] Checking VSIX file..." -ForegroundColor Yellow
$vsixPath = Join-Path $PSScriptRoot "multicode-visual-programming-0.4.0.vsix"

if (-not (Test-Path $vsixPath)) {
    Write-Host "  FAIL: VSIX file not found: $vsixPath" -ForegroundColor Red
    exit 1
}

$vsixInfo = Get-Item $vsixPath
Write-Host "  PASS: VSIX file found" -ForegroundColor Green
Write-Host "     Size: $([math]::Round($vsixInfo.Length / 1MB, 2)) MB" -ForegroundColor Gray
Write-Host "     Date: $($vsixInfo.LastWriteTime)" -ForegroundColor Gray

# Test 2: Check VSIX structure
Write-Host ""
Write-Host "[Test 2] Checking VSIX structure..." -ForegroundColor Yellow
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($vsixPath)
    
    $requiredFiles = @("extension/package.json", "extension/extension.js")
    $foundFiles = @()
    
    foreach ($entry in $zip.Entries) {
        $foundFiles += $entry.FullName
    }
    
    $allFound = $true
    foreach ($required in $requiredFiles) {
        if ($foundFiles -contains $required) {
            Write-Host "  PASS: Found $required" -ForegroundColor Green
        } else {
            Write-Host "  FAIL: Missing $required" -ForegroundColor Red
            $allFound = $false
        }
    }
    
    if ($allFound) {
        Write-Host "  PASS: VSIX structure is valid" -ForegroundColor Green
    } else {
        Write-Host "  FAIL: VSIX structure is invalid" -ForegroundColor Red
    }
    
    $zip.Dispose()
} catch {
    Write-Host "  FAIL: Error checking VSIX: $_" -ForegroundColor Red
}

# Test 3: Find Cursor
Write-Host ""
Write-Host "[Test 3] Finding Cursor..." -ForegroundColor Yellow
$cursorPaths = @(
    "F:\cursor\Cursor.exe",
    "$env:LOCALAPPDATA\Programs\cursor\Cursor.exe",
    "$env:APPDATA\Cursor\bin\cursor.cmd",
    "$env:ProgramFiles\Cursor\Cursor.exe"
)

$cursorPath = $null
foreach ($path in $cursorPaths) {
    if (Test-Path $path) {
        $cursorPath = $path
        Write-Host "  PASS: Cursor found at $path" -ForegroundColor Green
        break
    }
}

# Find via processes
if (-not $cursorPath) {
    $runningCursor = Get-Process | Where-Object { $_.ProcessName -like "*cursor*" -or $_.ProcessName -like "*Cursor*" } | Select-Object -First 1
    if ($runningCursor) {
        $cursorPath = $runningCursor.Path
        Write-Host "  PASS: Cursor found via processes: $cursorPath" -ForegroundColor Green
    }
}

if (-not $cursorPath) {
    Write-Host "  FAIL: Cursor not found" -ForegroundColor Red
    Write-Host "     Please specify path manually" -ForegroundColor Yellow
    exit 1
}

# Test 4: Check Cursor version
Write-Host ""
Write-Host "[Test 4] Checking Cursor version..." -ForegroundColor Yellow
try {
    $version = (Get-Item $cursorPath).VersionInfo.FileVersion
    Write-Host "  PASS: Cursor version: $version" -ForegroundColor Green
} catch {
    Write-Host "  WARN: Could not get version" -ForegroundColor Yellow
}

# Test 5: Check installed extensions
Write-Host ""
Write-Host "[Test 5] Checking installed extensions..." -ForegroundColor Yellow
try {
    $extensions = & $cursorPath --list-extensions 2>&1
    if ($LASTEXITCODE -eq 0) {
        $multicodeInstalled = $extensions | Select-String "multicode"
        if ($multicodeInstalled) {
            Write-Host "  PASS: MultiCode already installed" -ForegroundColor Green
            Write-Host "     $multicodeInstalled" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: MultiCode not found in installed extensions" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  WARN: Could not get extension list" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  WARN: Error checking extensions: $_" -ForegroundColor Yellow
}

# Test 6: Attempt installation
Write-Host ""
Write-Host "[Test 6] Attempting to install extension..." -ForegroundColor Yellow
Write-Host "  Command: `"$cursorPath`" --install-extension `"$vsixPath`"" -ForegroundColor Gray

try {
    $installOutput = & $cursorPath --install-extension $vsixPath 2>&1
    $installSuccess = $LASTEXITCODE -eq 0
    
    if ($installOutput) {
        Write-Host "  Command output:" -ForegroundColor Gray
        $installOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    }
    
    if ($installSuccess) {
        Write-Host "  PASS: Installation command executed successfully" -ForegroundColor Green
    } else {
        Write-Host "  WARN: Command exited with code: $LASTEXITCODE" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  FAIL: Installation error: $_" -ForegroundColor Red
}

# Test 7: Re-check after installation
Write-Host ""
Write-Host "[Test 7] Re-checking after installation..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
try {
    $extensionsAfter = & $cursorPath --list-extensions 2>&1
    if ($LASTEXITCODE -eq 0) {
        $multicodeAfter = $extensionsAfter | Select-String "multicode"
        if ($multicodeAfter) {
            Write-Host "  PASS: MultiCode found after installation!" -ForegroundColor Green
            Write-Host "     $multicodeAfter" -ForegroundColor Gray
        } else {
            Write-Host "  WARN: MultiCode still not found" -ForegroundColor Yellow
            Write-Host "     Cursor restart may be required" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  WARN: Error re-checking: $_" -ForegroundColor Yellow
}

# Final report
Write-Host ""
Write-Host "=== Final Report ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Recommendations:" -ForegroundColor Yellow
Write-Host "1. If extension did not appear, restart Cursor" -ForegroundColor White
Write-Host "2. Check extensions panel: Ctrl+Shift+X" -ForegroundColor White
Write-Host "3. Search for 'MultiCode' or 'multicode-visual-programming'" -ForegroundColor White
Write-Host "4. If still not working, try UI installation:" -ForegroundColor White
Write-Host "   Extensions > ... > Install from VSIX" -ForegroundColor Gray
Write-Host ""



