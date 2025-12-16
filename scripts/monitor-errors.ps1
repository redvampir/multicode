#!/usr/bin/env powershell
# Error Monitoring System for MultiCode
# Continuously monitors compilation, tests, and VS Code diagnostics

param(
    [switch]$Watch,
    [int]$Interval = 5,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"

# Color scheme
$script:Colors = @{
    Error = "Red"
    Warning = "Yellow"
    Info = "Cyan"
    Success = "Green"
    Dim = "DarkGray"
}

function Write-Monitored {
    param(
        [string]$Message,
        [string]$Type = "Info"
    )
    $color = $script:Colors[$Type]
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] " -ForegroundColor $script:Colors.Dim -NoNewline
    Write-Host $Message -ForegroundColor $color
}

function Get-BuildErrors {
    $buildLog = "build/CMakeFiles/CMakeOutput.log"
    if (Test-Path $buildLog) {
        $errors = Get-Content $buildLog | Select-String -Pattern "error|fatal" -Context 1,1
        return $errors
    }
    return @()
}

function Get-CompilerDiagnostics {
    $results = @{
        Errors = @()
        Warnings = @()
    }
    
    # Check for MSVC compile output
    $msbuildLogs = Get-ChildItem -Path "build" -Filter "*.log" -Recurse -ErrorAction SilentlyContinue
    
    foreach ($log in $msbuildLogs) {
        $content = Get-Content $log.FullName -ErrorAction SilentlyContinue
        
        # Parse MSVC errors: filename(line): error C####:
        $errors = $content | Select-String -Pattern ":\s*error\s+C\d+:" 
        if ($errors) {
            $results.Errors += $errors
        }
        
        # Parse MSVC warnings: filename(line): warning C####:
        $warnings = $content | Select-String -Pattern ":\s*warning\s+C\d+:"
        if ($warnings) {
            $results.Warnings += $warnings
        }
    }
    
    return $results
}

function Get-TestFailures {
    $testLog = "build/Testing/Temporary/LastTest.log"
    if (Test-Path $testLog) {
        $content = Get-Content $testLog
        $failures = $content | Select-String -Pattern "FAILED|REQUIRE|CHECK.*failed" -Context 2,2
        return $failures
    }
    return @()
}

function Get-CMakeWarnings {
    $cmakeCache = "build/CMakeCache.txt"
    $warnings = @()
    
    if (Test-Path $cmakeCache) {
        # Check for deprecated features
        $content = Get-Content $cmakeCache
        if ($content -match "CMAKE_BUILD_TYPE:STRING=$") {
            $warnings += "WARNING: CMAKE_BUILD_TYPE not set"
        }
    }
    
    # Check CMake output log
    $cmakeOutput = "build/CMakeFiles/CMakeOutput.log"
    if (Test-Path $cmakeOutput) {
        $cmakeWarnings = Get-Content $cmakeOutput | Select-String -Pattern "Warning|deprecated"
        $warnings += $cmakeWarnings
    }
    
    return $warnings
}

function Get-SourceFileIssues {
    $issues = @{
        MissingHeaders = @()
        TODOs = @()
        FIXMEs = @()
    }
    
    # Scan source files for common issues
    $cppFiles = Get-ChildItem -Path "src" -Filter "*.cpp" -Recurse -ErrorAction SilentlyContinue
    $hppFiles = Get-ChildItem -Path "include" -Filter "*.hpp" -Recurse -ErrorAction SilentlyContinue
    $sourceFiles = $cppFiles + $hppFiles
    
    foreach ($file in $sourceFiles) {
        $content = Get-Content $file.FullName
        
        # Check for TODO/FIXME
        $todos = $content | Select-String -Pattern "TODO|FIXME" -SimpleMatch
        if ($todos) {
            $issues.TODOs += "$($file.Name): $($todos.Count) TODOs/FIXMEs"
        }
    }
    
    return $issues
}

function Show-ErrorSummary {
    Write-Host "`n" -NoNewline
    Write-Host "=" * 80 -ForegroundColor $script:Colors.Dim
    Write-Monitored "ERROR MONITORING REPORT" -Type Info
    Write-Host "=" * 80 -ForegroundColor $script:Colors.Dim
    
    # 1. Compiler Diagnostics
    $diagnostics = Get-CompilerDiagnostics
    if ($diagnostics.Errors.Count -gt 0) {
        Write-Monitored "COMPILER ERRORS: $($diagnostics.Errors.Count)" -Type Error
        if ($Verbose) {
            $diagnostics.Errors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        }
    } else {
        Write-Monitored "Compiler Errors: 0" -Type Success
    }
    
    if ($diagnostics.Warnings.Count -gt 0) {
        Write-Monitored "COMPILER WARNINGS: $($diagnostics.Warnings.Count)" -Type Warning
        if ($Verbose) {
            $diagnostics.Warnings | Select-Object -First 10 | ForEach-Object { 
                Write-Host "  $_" -ForegroundColor Yellow 
            }
            if ($diagnostics.Warnings.Count -gt 10) {
                Write-Host "  ... and $($diagnostics.Warnings.Count - 10) more" -ForegroundColor DarkYellow
            }
        }
    } else {
        Write-Monitored "Compiler Warnings: 0" -Type Success
    }
    
    # 2. Test Failures
    $testFailures = Get-TestFailures
    if ($testFailures.Count -gt 0) {
        Write-Monitored "TEST FAILURES: $($testFailures.Count)" -Type Error
        if ($Verbose) {
            $testFailures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        }
    } else {
        Write-Monitored "Test Failures: 0" -Type Success
    }
    
    # 3. CMake Warnings
    $cmakeWarnings = Get-CMakeWarnings
    if ($cmakeWarnings.Count -gt 0) {
        Write-Monitored "CMAKE WARNINGS: $($cmakeWarnings.Count)" -Type Warning
        if ($Verbose) {
            $cmakeWarnings | Select-Object -First 5 | ForEach-Object { 
                Write-Host "  $_" -ForegroundColor Yellow 
            }
        }
    }
    
    # 4. Source Code Issues
    $sourceIssues = Get-SourceFileIssues
    if ($sourceIssues.TODOs.Count -gt 0) {
        Write-Monitored "TODOs/FIXMEs: $($sourceIssues.TODOs.Count) files" -Type Info
        if ($Verbose) {
            $sourceIssues.TODOs | ForEach-Object { Write-Host "  $_" -ForegroundColor Cyan }
        }
    }
    
    # 5. Overall Status
    Write-Host "`n" -NoNewline
    $totalIssues = $diagnostics.Errors.Count + $testFailures.Count
    if ($totalIssues -eq 0) {
        Write-Host "STATUS: " -NoNewline
        Write-Host "ALL CLEAR" -ForegroundColor Green -NoNewline
        Write-Host " - No critical issues detected" -ForegroundColor $script:Colors.Dim
    } else {
        Write-Host "STATUS: " -NoNewline
        Write-Host "ISSUES DETECTED ($totalIssues)" -ForegroundColor Red
    }
    
    Write-Host "=" * 80 -ForegroundColor $script:Colors.Dim
}

function Watch-Errors {
    Write-Monitored "Starting error monitoring (interval: ${Interval}s, Ctrl+C to stop)" -Type Info
    Write-Monitored "Monitoring: Build logs, Test results, CMake warnings" -Type Info
    
    $iteration = 0
    while ($true) {
        Clear-Host
        Write-Host "MULTICODE ERROR MONITOR - Iteration #$iteration" -ForegroundColor Cyan
        Show-ErrorSummary
        
        Write-Host "`nNext check in ${Interval} seconds... (Ctrl+C to stop)" -ForegroundColor DarkGray
        Start-Sleep -Seconds $Interval
        $iteration++
    }
}

# Main execution
if ($Watch) {
    Watch-Errors
} else {
    Show-ErrorSummary
}
