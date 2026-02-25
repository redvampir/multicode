#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Установка и обновление MSYS2 + добавление в PATH (перед Strawberry)

.DESCRIPTION
    Скрипт:
    1. Проверяет наличие MSYS2
    2. Загружает и устанавливает MSYS2 (если нет)
    3. Обновляет MSYS2 через pacman
    4. Добавляет MSYS2 в системный PATH как первый вариант (перед Strawberry)

.PARAMETER Force
    Переустановить MSYS2, даже если уже установлена
#>

param(
    [switch]$Force,
    [string]$MsysRoot = "C:\msys64"
)

$ErrorActionPreference = "Stop"

function Write-Header {
    param([string]$Message)
    Write-Host "`n$('='*60)" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "$('='*60)" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error2 {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Step {
    param([string]$Message, [int]$Step)
    Write-Host "[Step $Step] $Message" -ForegroundColor Yellow
}

# Проверка прав администратора
function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal $currentUser
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Error2 "Этот скрипт требует прав администратора"
    Write-Host "Переустаивите PowerShell как администратор и повторите попытку" -ForegroundColor Red
    exit 1
}

Write-Header "🛠️ MSYS2 - Установка и Обновление"

# Step 1: Проверить наличие MSYS2
Write-Step "Проверка наличия MSYS2" 1

if ((Test-Path $MsysRoot) -and -not $Force) {
    Write-Success "MSYS2 обнаружена: $MsysRoot"
    $Install = $false
} else {
    Write-Host "MSYS2 не обнаружена или запрошена переустановка" -ForegroundColor Yellow
    $Install = $true
}

# Step 2: Загрузить и установить MSYS2
if ($Install) {
    Write-Step "Загрузка и установка MSYS2" 2
    
    $InstallerUrl = "https://github.com/msys2/msys2-installer/releases/download/2024-01-14/msys2-x86_64-20240114.exe"
    $InstallerPath = "$env:TEMP\msys2-installer.exe"
    
    Write-Host "Загрузка установщика: $InstallerUrl" -ForegroundColor Cyan
    $ProgressPreference = "SilentlyContinue"
    
    try {
        Invoke-WebRequest -Uri $InstallerUrl -OutFile $InstallerPath -TimeoutSec 300
        Write-Success "Загрузка завершена: $InstallerPath"
    } catch {
        Write-Error2 "Не удалось загрузить MSYS2"
        Write-Host "Ошибка: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Запуск установщика MSYS2..." -ForegroundColor Cyan
    $InstallPath = if ($MsysRoot -eq "C:\msys64") { 
        # Стандартная установка для 64-бит
        & $InstallerPath -AcceptLicense -InstallationType=System -Destination=$MsysRoot -NoStart
    } else {
        & $InstallerPath
    }
    
    # Подождать завершения
    Start-Sleep -Seconds 2
    
    if (Test-Path "$MsysRoot\msys2.exe") {
        Write-Success "MSYS2 установлена в: $MsysRoot"
    } else {
        Write-Error2 "Не удалось установить MSYS2"
        exit 1
    }
    
    # Удалить установщик
    if (Test-Path $InstallerPath) {
        Remove-Item $InstallerPath -Force
    }
}

# Step 3: Обновить MSYS2 через pacman
Write-Step "Обновление MSYS2 (первая запуск pacman -Syuu)" 3

# Скрипт обновления пакетов
$UpdateScript = @"
#!/bin/bash
# Первое обновление (обновит только базовые пакеты и pacman)
pacman -Syuu --noconfirm

# Ожидание 3 сек (для переустановки pacman)
sleep 3

# Второе обновление (обновит остальные пакеты)
pacman -Syuu --noconfirm

# Установка необходимых пакетов
pacman -Sy --noconfirm base-devel mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-gdb

echo "✓ MSYS2 обновлена успешно"
"@

$UpdateScript | Out-File -Encoding UTF8 "$MsysRoot\home\update.sh" -Force

Write-Host "Выполнение обновления..." -ForegroundColor Cyan
& "$MsysRoot\usr\bin\bash.exe" -lc "bash /home/update.sh"

Write-Success "MSYS2 обновлена"

# Step 4: Добавить в PATH
Write-Step "Добавление MSYS2 в системный PATH" 4

$MsysBinPath = "$MsysRoot\ucrt64\bin"
$CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "Machine")

if ($CurrentPath -like "*$MsysBinPath*") {
    Write-Host "MSYS2 уже есть в PATH" -ForegroundColor Yellow
} else {
    Write-Host "Добавляем путь: $MsysBinPath" -ForegroundColor Cyan
    
    # Поместить MSYS2 перед Strawberry, чтобы её g++ был первым
    $NewPath = if ($CurrentPath -like "*C:\Strawberry\c\bin*") {
        $CurrentPath -replace "C:\\Strawberry\\c\\bin", "$MsysBinPath`$0"
    } else {
        "$MsysBinPath;$CurrentPath"
    }
    
    [Environment]::SetEnvironmentVariable("PATH", $NewPath, "Machine")
    Write-Success "PATH обновлена"
}

# Step 5: Проверить установку
Write-Step "Проверка установки" 5

# Обновить переменные для текущего процесса
$env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Machine")

$g_plus_plus = (where.exe g++ 2>$null).ToString().Trim()
$gcc = (where.exe gcc 2>$null).ToString().Trim()
$gdb = (where.exe gdb 2>$null).ToString().Trim()

if ($g_plus_plus -like "*msys*" -or $g_plus_plus -like "*ucrt64*") {
    Write-Success "g++ найден: $g_plus_plus"
} else {
    Write-Host "⚠ g++ не из MSYS2: $g_plus_plus" -ForegroundColor Yellow
}

if ($gcc -like "*msys*" -or $gcc -like "*ucrt64*") {
    Write-Success "gcc найден: $gcc"
}

if ($gdb) {
    Write-Success "gdb найден: $gdb"
}

# Получить версии
Write-Host "`nВерсии компиляторов:" -ForegroundColor Cyan
& "$g_plus_plus" --version | Select-Object -First 1
& gcc --version | Select-Object -First 1

# Step 6: Создать конфиг для VS Code
Write-Step "Конфигурация для VS Code/CMake" 6

$VSCodeSettings = @{
    "cmake.configureSettings" = @{
        "CMAKE_CXX_COMPILER" = "$MsysBinPath/g++.exe"
        "CMAKE_C_COMPILER" = "$MsysBinPath/gcc.exe"
        "CMAKE_CXX_STANDARD" = "20"
    }
    "cmake.generator" = "Ninja Multi-Config"
    "cmake.preferredGenerators" = @("Ninja Multi-Config", "Unix Makefiles")
}

Write-Host "Рекомендуемая конфигурация .vscode/settings.json:" -ForegroundColor Cyan
Write-Host ($VSCodeSettings | ConvertTo-Json -Depth 2) -ForegroundColor Gray

# Step 7: Итоговая информация
Write-Header "✓ Установка завершена"

Write-Host "
📝 Что было сделано:
  ✓ Установлена MSYS2 (если её не было)
  ✓ Обновлены пакеты базовой системы
  ✓ Установлены gcc, g++, gdb
  ✓ MSYS2 добавлена в PATH (ПЕР вариант - перед Strawberry)
  ✓ Новые компиляторы будут использоваться по умолчанию

📌 Путь к MSYS2: $MsysRoot
📌 Бинарники: $MsysBinPath

⚠️ ВАЖНО: Перезагрузите:
  • VS Code (закройте и откройте заново)
  • Все терминалы PowerShell
  • CMake может потребоваться reconfigure

🎉 Готово! MSYS2 установлена и обновлена.
" -ForegroundColor Green

exit 0
