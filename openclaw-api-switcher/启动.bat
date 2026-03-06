@echo off
REM OpenClaw API Switcher Launcher for Windows
REM 注意：CMD不支持Unicode表情符号，使用ASCII字符

cd /d "%~dp0"

REM 检查npm
where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm not found. Please install Node.js
    echo -> https://nodejs.org/
    pause
    exit /b 1
)

REM 检查依赖
if not exist "node_modules" (
    echo [INSTALL] First run, installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

REM 【v2.7.5】启动应用（后台运行）
echo [START] Starting OpenClaw API Switcher...
start "" npm start

timeout /t 2 >nul
echo [OK] Application started, window will close...

REM 【v2.7.5】延迟后自动关闭当前窗口
timeout /t 1 >nul
exit
