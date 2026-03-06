@echo off
chcp 936 >nul
echo ========================================
echo  Downloading Electron manually
echo ========================================
echo.

cd /d "%~dp0"

REM Create electron directory
if not exist "node_modules\electron\dist" (
    mkdir "node_modules\electron\dist"
)

REM Download Electron
echo [Download] Downloading Electron v28.0.0...
echo [Download] This may take a few minutes...
echo.

powershell -Command "& {$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri 'https://npmmirror.com/mirrors/electron/v28.0.0/electron-v28.0.0-win32-x64.zip' -OutFile 'electron.zip' -TimeoutSec 300 } catch { exit 1 }}"

if not exist "electron.zip" (
    echo [Error] Download failed!
    echo.
    echo Please download manually from:
    echo https://npmmirror.com/mirrors/electron/v28.0.0/electron-v28.0.0-win32-x64.zip
    echo.
    pause
    exit /b 1
)

echo [OK] Download complete
echo.

REM Extract
echo [Extract] Extracting files...
powershell -Command "Expand-Archive -Path 'electron.zip' -DestinationPath 'node_modules\electron\dist' -Force"

if errorlevel 1 (
    echo [Error] Extraction failed!
    pause
    exit /b 1
)

echo [OK] Extraction complete
echo.

REM Clean up
del electron.zip

echo [OK] Electron installed successfully!
echo.
pause
