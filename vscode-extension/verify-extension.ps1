# MultiCode Extension Verification Script

Write-Output "`n=========================================="
Write-Output "MultiCode Extension - Diagnostic Report"
Write-Output "==========================================`n"

# 1. Extension installation check
Write-Output "[1/5] Extension Installation Status"
$ext = code --list-extensions | Select-String "multicode-team.multicode-visual-programming"
if ($ext) {
    Write-Output "  Status: INSTALLED"
    Write-Output "  ID: $ext"
} else {
    Write-Output "  Status: NOT FOUND"
    Write-Output "  Action: Run installation command"
    exit 1
}

# 2. File existence and size check
Write-Output "`n[2/5] Compiled Files Check"
$extJsPath = "dist\extension.js"
if (Test-Path $extJsPath) {
    $sizeKB = [math]::Round((Get-Item $extJsPath).Length / 1KB, 2)
    Write-Output "  File: extension.js"
    Write-Output "  Size: $sizeKB KB"
    Write-Output "  Expected: ~97 KB (with logging)"
} else {
    Write-Output "  ERROR: extension.js not found"
    exit 1
}

# 3. Package manifest validation
Write-Output "`n[3/5] Package Manifest (package.json)"
try {
    $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    Write-Output "  Main entry: $($pkg.main)"
    Write-Output "  Commands count: $($pkg.contributes.commands.Count)"
    Write-Output "  Activation events: $($pkg.activationEvents.Count)"
} catch {
    Write-Output "  ERROR: Cannot parse package.json"
}

# 4. Export structure check
Write-Output "`n[4/5] Module Export Check"
$content = Get-Content $extJsPath -Raw
if ($content -match 'module\.exports') {
    Write-Output "  module.exports: FOUND"
} else {
    Write-Output "  module.exports: NOT FOUND (potential issue)"
}

$externalsToCheck = @('@xenova/transformers', 'onnxruntime-node', 'sharp')
foreach ($dep in $externalsToCheck) {
    $pattern = "require\\(['\\\"]" + [Regex]::Escape($dep) + "['\\\"]\\)"
    if ($content -match $pattern) {
        Write-Output "  WARNING: dist/extension.js содержит require('$dep')"
        Write-Output "           Если внутри VSIX нет node_modules с этой зависимостью, активация расширения упадёт."
    }
}

# 5. Critical next steps
Write-Output "`n[5/5] CRITICAL NEXT STEPS"
Write-Output "==========================================`n"
Write-Output "YOU MUST DO THIS TO LOAD NEW EXTENSION:"
Write-Output ""
Write-Output "Step 1: RELOAD VS CODE"
Write-Output "  Ctrl+Shift+P -> 'Developer: Reload Window'"
Write-Output "  (New extension won't work until reload!)"
Write-Output ""
Write-Output "Step 2: OPEN DEVELOPER TOOLS"
Write-Output "  Ctrl+Shift+P -> 'Developer: Toggle Developer Tools'"
Write-Output "  Switch to 'Console' tab"
Write-Output ""
Write-Output "Step 3: CHECK FOR ACTIVATION LOGS"
Write-Output "  Look for these messages:"
Write-Output "  [MultiCode] Extension ACTIVATION started"
Write-Output "  [MultiCode] Registering command: multicode.openEditor"
Write-Output "  [MultiCode] All commands registered successfully!"
Write-Output ""
Write-Output "Step 4: TRY THE COMMAND"
Write-Output "  Ctrl+Shift+P -> 'MultiCode: Open Visual Editor'"
Write-Output ""
Write-Output "Step 5: IF STILL FAILS - CHECK OUTPUT PANEL"
Write-Output "  View -> Output (Ctrl+Shift+U)"
Write-Output "  Dropdown -> 'MultiCode'"
Write-Output ""
Write-Output "==========================================`n"
