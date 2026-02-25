@echo off
REM Установка MSYS2 и добавление в PATH
REM Запустите как администратор

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║  MSYS2 - Установка и обновление                         ║
echo ║  (Запускайте как администратор)                          ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

setlocal enabledelayedexpansion

REM Проверка прав администратора
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Требуются права администратора
    echo Пожалуйста, запустите скрипт "Запуск от администратора"
    pause
    exit /b 1
)

REM Путь к MSYS2
set MSYS64=C:\msys64

echo [1] Проверка наличия MSYS2...
if exist "%MSYS64%\msys2.exe" (
    echo ✓ MSYS2 найдена: %MSYS64%
) else (
    echo ✗ MSYS2 не найдена
    echo.
    echo Загрузку и установку MSYS2 с: 
    echo https://www.msys2.org/
    echo.
    echo Инструкции:
    echo 1. Скачайте msys2-x86_64-*.exe
    echo 2. Запустите установщик (установка по умолчанию - C:\msys64)
    echo 3. После установки запустите этот скрипт снова
    echo.
    pause
    exit /b 1
)

echo.
echo [2] Проверка PATH...
echo Current PATH (Machine):
reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH | find "PATH"

echo.
echo [3] Добавление MSYS2 в PATH...

REM Получить текущий PATH
for /f "tokens=2*" %%i in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH ^| find "PATH"') do set "OLDPATH=%%j"

REM Проверить, есть ли уже MSYS2 в PATH
echo !OLDPATH! | find /i "msys64" >nul
if %errorLevel% equ 0 (
    echo ✓ MSYS2 уже в PATH
) else (
    echo Adding MSYS2\ucrt64\bin to PATH...
    set "NEWPATH=%MSYS64%\ucrt64\bin;!OLDPATH!"
    
    REM Удалить Strawberry из начала PATH, чтобы MSYS2 был первым
    set "NEWPATH=!NEWPATH:C:\Strawberry\c\bin;=!"
    set "NEWPATH=%MSYS64%\ucrt64\bin;!NEWPATH!"
    
    REM Установить новый PATH
    reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH /t REG_EXPAND_SZ /d "!NEWPATH!" /f
    
    if %errorLevel% equ 0 (
        echo ✓ PATH обновлена
    ) else (
        echo ✗ Не удалось обновить PATH
        pause
        exit /b 1
    )
)

echo.
echo [4] Обновление MSYS2 пакетов...
echo.
echo Запуск bash для обновления pacman...

REM Создать скрипт обновления
(
    echo #!/bin/bash
    echo set -e
    echo echo "Обновление базовых пакетов..."
    echo pacman -Syuu --noconfirm
    echo.
    echo echo "Ожидание 3 сек..."
    echo sleep 3
    echo.
    echo echo "Полное обновление системы..."
    echo pacman -Syuu --noconfirm
    echo.
    echo echo "Установка компиляторов..."
    echo pacman -Sy --noconfirm base-devel mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-gdb mingw-w64-ucrt-x86_64-cmake
    echo.
    echo echo "✓ MSYS2 обновлена успешно"
) > "%MSYS64%\tmp\update.sh"

"%MSYS64%\usr\bin\bash.exe" -l -c "bash /tmp/update.sh"

if %errorLevel% neq 0 (
    echo ✗ Ошибка при обновлении
    pause
    exit /b 1
)

echo.
echo ✓ Обновление завершено

echo.
echo [5] Проверка установки...
"%MSYS64%\ucrt64\bin\g++.exe" --version
echo.

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║ ✓ Установка завершена!                                   ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.
echo 📝 Что было сделано:
echo   ✓ MSYS2 проверена
echo   ✓ MSYS2 добавлена в PATH (перед Strawberry)
echo   ✓ Пакеты обновлены
echo   ✓ Установлены gcc, g++, gdb, cmake
echo.
echo ⚠️  ВАЖНО: Перезагрузите:
echo   • Все окна PowerShell / CMD
echo   • VS Code (закройте и откройте заново)
echo   • Терминалы в IDE
echo.
echo 🎉 Готово! Теперь g++ из MSYS2 будет использоваться по умолчанию
echo.
pause
