@echo off
chcp 936 >nul
REM OpenClaw API Switcher Launcher for Windows

cd /d "%~dp0"

REM Check dependencies
if not exist "node_modules" (
    echo ========================================
    echo  First Run - Installing dependencies
    echo ========================================
    echo.
    echo Please run: npm install
    echo.
    echo Or download the full package with node_modules included.
    echo.
    pause
    exit /b 1
)

REM Check Electron
if not exist "node_modules\electron\dist\electron.exe" (
    echo [Error] Electron not found!
    echo Please run: npm install
    pause
    exit /b 1
)

echo [OK] Electron found
echo.

REM Start application
echo [Launch] OpenClaw API Switcher...
echo.

start "" "node_modules\electron\dist\electron.exe" .

REM Exit immediately, Electron will run independently
exit
