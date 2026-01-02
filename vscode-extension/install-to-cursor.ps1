# Script for installing MultiCode to Cursor
# Usage: .\install-to-cursor.ps1 [path-to-cursor.exe]

param(
    [string]$CursorPath = ""
)

$vsixPath = Join-Path $PSScriptRoot "multicode-visual-programming-0.4.0.vsix"

if (-not (Test-Path $vsixPath)) {
    Write-Host "ERROR: VSIX file not found: $vsixPath" -ForegroundColor Red
    Write-Host "First build the extension: npm run compile && npx vsce package --no-dependencies" -ForegroundColor Yellow
    exit 1
}

# Search for Cursor
if ([string]::IsNullOrEmpty($CursorPath)) {
    Write-Host "Searching for Cursor..." -ForegroundColor Cyan
    
    # Standard paths
    $possiblePaths = @(
        "$env:LOCALAPPDATA\Programs\cursor\Cursor.exe",
        "$env:APPDATA\Cursor\bin\cursor.cmd",
        "$env:ProgramFiles\Cursor\Cursor.exe",
        "${env:ProgramFiles(x86)}\Cursor\Cursor.exe"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $CursorPath = $path
            Write-Host "Found Cursor: $path" -ForegroundColor Green
            break
        }
    }
    
    # Search via registry
    if ([string]::IsNullOrEmpty($CursorPath)) {
        try {
            $regPath = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\cursor.exe" -ErrorAction SilentlyContinue
            if ($regPath -and $regPath.'(default)') {
                $CursorPath = $regPath.'(default)'
                Write-Host "Found Cursor via registry: $CursorPath" -ForegroundColor Green
            }
        } catch {
            # Ignore registry errors
        }
    }
}

if ([string]::IsNullOrEmpty($CursorPath) -or -not (Test-Path $CursorPath)) {
    Write-Host "ERROR: Cursor not found automatically." -ForegroundColor Red
    Write-Host ""
    Write-Host "Try one of these methods:" -ForegroundColor Yellow
    Write-Host "1. Specify the path manually:" -ForegroundColor White
    Write-Host "   .\install-to-cursor.ps1 -CursorPath 'C:\path\to\Cursor.exe'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Install manually via UI:" -ForegroundColor White
    Write-Host "   - Open Cursor" -ForegroundColor Gray
    Write-Host "   - Press Ctrl+Shift+X" -ForegroundColor Gray
    Write-Host "   - Click ... (three dots)" -ForegroundColor Gray
    Write-Host "   - Select 'Install from VSIX...'" -ForegroundColor Gray
    Write-Host "   - Select: $vsixPath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Add Cursor to PATH and use:" -ForegroundColor White
    Write-Host "   cursor --install-extension '$vsixPath'" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "Installing extension..." -ForegroundColor Cyan
Write-Host "   VSIX: $vsixPath" -ForegroundColor Gray
Write-Host "   Cursor: $CursorPath" -ForegroundColor Gray
Write-Host ""

try {
    if ($CursorPath -like "*.cmd") {
        cmd /c "$CursorPath --install-extension `"$vsixPath`""
    } else {
        & $CursorPath --install-extension $vsixPath
    }
    
    if ($LASTEXITCODE -eq 0 -or $?) {
        Write-Host ""
        Write-Host "Extension successfully installed!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "1. Restart Cursor (if needed)" -ForegroundColor White
        Write-Host "2. Open a .cpp or .rs file" -ForegroundColor White
        Write-Host "3. Press Ctrl+Shift+V to open the editor" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "WARNING: Command executed, but return code is not 0." -ForegroundColor Yellow
        Write-Host "Check if the extension was installed in Cursor." -ForegroundColor Yellow
    }
} catch {
    Write-Host ""
    Write-Host "ERROR during installation: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Try installing manually via Cursor UI." -ForegroundColor Yellow
    exit 1
}


