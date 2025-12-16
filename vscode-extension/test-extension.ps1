# MultiCode Extension Test Script
# Автоматическая проверка расширения после установки

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  MultiCode Extension - Diagnostic Script" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# 1. Проверка установки
Write-Host "[1/5] Проверка установки расширения..." -ForegroundColor Yellow
$installed = code --list-extensions | Select-String "multicode-team.multicode-visual-programming"
if ($installed) {
    Write-Host "  ✅ Расширение установлено: $installed" -ForegroundColor Green
} else {
    Write-Host "  ❌ Расширение НЕ установлено!" -ForegroundColor Red
    exit 1
}

# 2. Проверка файлов
Write-Host "`n[2/5] Проверка собранных файлов..." -ForegroundColor Yellow
$extJs = "f:\MultiCode\МультиКод\vscode-extension\dist\extension.js"
if (Test-Path $extJs) {
    $size = (Get-Item $extJs).Length / 1KB
    Write-Host "  ✅ extension.js существует: $([math]::Round($size, 2)) KB" -ForegroundColor Green
    
    # Проверка exports
    $content = Get-Content $extJs -Raw -ErrorAction SilentlyContinue
    if ($content -match 'module\.exports') {
        Write-Host "  ✅ module.exports найден" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  module.exports НЕ найден (может быть проблема)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ❌ extension.js НЕ найден!" -ForegroundColor Red
}

# 3. Проверка package.json
Write-Host "`n[3/5] Проверка package.json..." -ForegroundColor Yellow
$packageJson = "f:\MultiCode\МультиКод\vscode-extension\package.json" | Get-Content | ConvertFrom-Json
$mainFile = $packageJson.main
Write-Host "  📄 main: $mainFile" -ForegroundColor Cyan
$commands = $packageJson.contributes.commands | Measure-Object | Select-Object -ExpandProperty Count
Write-Host "  📄 commands: $commands зарегистрировано" -ForegroundColor Cyan

# 4. Проверка .vsix
Write-Host "`n[4/5] Проверка .vsix пакета..." -ForegroundColor Yellow
$vsixPath = "f:\MultiCode\МультиКод\vscode-extension\multicode-visual-programming-0.1.0.vsix"
if (Test-Path $vsixPath) {
    $vsixSize = (Get-Item $vsixPath).Length / 1KB
    Write-Host "  ✅ .vsix существует: $([math]::Round($vsixSize, 2)) KB" -ForegroundColor Green
} else {
    Write-Host "  ❌ .vsix НЕ найден!" -ForegroundColor Red
}

# 5. Инструкции для пользователя
Write-Host "`n[5/5] Следующие шаги:" -ForegroundColor Yellow
Write-Host "  [1] Перезагрузи VS Code: Ctrl+Shift+P -> 'Developer: Reload Window'" -ForegroundColor White
Write-Host "  [2] Открой Developer Tools: Ctrl+Shift+P -> 'Developer: Toggle Developer Tools'" -ForegroundColor White
Write-Host "  [3] Проверь консоль на наличие логов:" -ForegroundColor White
Write-Host "      [MultiCode] Extension ACTIVATION started" -ForegroundColor Gray
Write-Host "  [4] Попробуй команду: Ctrl+Shift+P -> 'МультиКод: Open Visual Editor'" -ForegroundColor White
Write-Host "  [5] Проверь Output: View -> Output -> MultiCode" -ForegroundColor White

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  Если команда не работает - смотри логи в Developer Tools" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

Write-Host "📖 Подробная инструкция: test-extension.md`n" -ForegroundColor Magenta
