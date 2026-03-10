@echo off
cd /d "%~dp0"

set "ELECTRON_PATH=%~dp0node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON_PATH%" (
    echo Electron not found. Please install Node.js first.
    echo Download from: https://nodejs.org/
    echo.
    echo After installing Node.js, press any key to continue installation...
    pause >nul
    call npm install
    if errorlevel 1 (
        echo.
        echo Installation failed. Please check if Node.js is installed correctly.
        pause
        exit /b 1
    )
)

start "" "%ELECTRON_PATH%" "%~dp0."
