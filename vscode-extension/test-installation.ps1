# Тесты установки MultiCode расширения в Cursor
# Использование: .\test-installation.ps1

$ErrorActionPreference = "Stop"

Write-Host "`n=== Тесты установки MultiCode ===" -ForegroundColor Cyan
Write-Host ""

# Тест 1: Проверка VSIX файла
Write-Host "[Тест 1] Проверка VSIX файла..." -ForegroundColor Yellow
$vsixPath = Join-Path $PSScriptRoot "multicode-visual-programming-0.4.0.vsix"

if (-not (Test-Path $vsixPath)) {
    Write-Host "  ❌ VSIX файл не найден: $vsixPath" -ForegroundColor Red
    exit 1
}

$vsixInfo = Get-Item $vsixPath
Write-Host "  ✅ VSIX файл найден" -ForegroundColor Green
Write-Host "     Размер: $([math]::Round($vsixInfo.Length / 1MB, 2)) MB" -ForegroundColor Gray
Write-Host "     Дата: $($vsixInfo.LastWriteTime)" -ForegroundColor Gray

# Тест 2: Проверка структуры VSIX (это ZIP архив)
Write-Host "`n[Тест 2] Проверка структуры VSIX..." -ForegroundColor Yellow
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
            Write-Host "  ✅ Найден: $required" -ForegroundColor Green
        } else {
            Write-Host "  ❌ Отсутствует: $required" -ForegroundColor Red
            $allFound = $false
        }
    }
    
    if ($allFound) {
        Write-Host "  ✅ Структура VSIX корректна" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Структура VSIX некорректна" -ForegroundColor Red
    }
    
    $zip.Dispose()
} catch {
    Write-Host "  ❌ Ошибка при проверке VSIX: $_" -ForegroundColor Red
}

# Тест 3: Поиск Cursor
Write-Host "`n[Тест 3] Поиск Cursor..." -ForegroundColor Yellow
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
        Write-Host "  ✅ Cursor найден: $path" -ForegroundColor Green
        break
    }
}

# Поиск через процессы
if (-not $cursorPath) {
    $runningCursor = Get-Process | Where-Object { $_.ProcessName -like "*cursor*" -or $_.ProcessName -like "*Cursor*" } | Select-Object -First 1
    if ($runningCursor) {
        $cursorPath = $runningCursor.Path
        Write-Host "  ✅ Cursor найден через процессы: $cursorPath" -ForegroundColor Green
    }
}

if (-not $cursorPath) {
    Write-Host "  ❌ Cursor не найден" -ForegroundColor Red
    Write-Host "     Попробуйте указать путь вручную" -ForegroundColor Yellow
} else {
    # Тест 4: Проверка версии Cursor
    Write-Host "`n[Тест 4] Проверка версии Cursor..." -ForegroundColor Yellow
    try {
        $version = (Get-Item $cursorPath).VersionInfo.FileVersion
        Write-Host "  ✅ Версия Cursor: $version" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠️  Не удалось получить версию" -ForegroundColor Yellow
    }
    
    # Тест 5: Проверка установленных расширений
    Write-Host "`n[Тест 5] Проверка установленных расширений..." -ForegroundColor Yellow
    try {
        $extensions = & $cursorPath --list-extensions 2>&1
        if ($LASTEXITCODE -eq 0) {
            $multicodeInstalled = $extensions | Select-String "multicode"
            if ($multicodeInstalled) {
                Write-Host "  ✅ MultiCode уже установлен" -ForegroundColor Green
                Write-Host "     $multicodeInstalled" -ForegroundColor Gray
            } else {
                Write-Host "  ⚠️  MultiCode не найден в списке установленных" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  ⚠️  Не удалось получить список расширений" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  ⚠️  Ошибка при проверке расширений: $_" -ForegroundColor Yellow
    }
    
    # Тест 6: Попытка установки
    Write-Host "`n[Тест 6] Попытка установки расширения..." -ForegroundColor Yellow
    Write-Host "  Команда: `"$cursorPath`" --install-extension `"$vsixPath`"" -ForegroundColor Gray
    
    try {
        $installOutput = & $cursorPath --install-extension $vsixPath 2>&1
        $installSuccess = $LASTEXITCODE -eq 0
        
        if ($installOutput) {
            Write-Host "  Вывод команды:" -ForegroundColor Gray
            $installOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        }
        
        if ($installSuccess) {
            Write-Host "  ✅ Команда установки выполнена успешно" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  Команда выполнена с кодом: $LASTEXITCODE" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  ❌ Ошибка при установке: $_" -ForegroundColor Red
    }
    
    # Тест 7: Повторная проверка после установки
    Write-Host "`n[Тест 7] Повторная проверка после установки..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    try {
        $extensionsAfter = & $cursorPath --list-extensions 2>&1
        if ($LASTEXITCODE -eq 0) {
            $multicodeAfter = $extensionsAfter | Select-String "multicode"
            if ($multicodeAfter) {
                Write-Host "  ✅ MultiCode найден после установки!" -ForegroundColor Green
                Write-Host "     $multicodeAfter" -ForegroundColor Gray
            } else {
                Write-Host "  ⚠️  MultiCode всё ещё не найден" -ForegroundColor Yellow
                Write-Host "     Возможно, требуется перезапуск Cursor" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "  ⚠️  Ошибка при повторной проверке: $_" -ForegroundColor Yellow
    }
}

# Итоговый отчёт
Write-Host "`n=== Итоговый отчёт ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Рекомендации:" -ForegroundColor Yellow
Write-Host "1. Если расширение не появилось, перезапустите Cursor" -ForegroundColor White
Write-Host "2. Проверьте панель расширений: Ctrl+Shift+X" -ForegroundColor White
Write-Host "3. Поищите 'МультиКод' или 'multicode-visual-programming'" -ForegroundColor White
Write-Host "4. Если не помогло, попробуйте установить через UI:" -ForegroundColor White
Write-Host "   Extensions > ... > Install from VSIX" -ForegroundColor Gray
Write-Host ""



