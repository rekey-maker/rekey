@echo off
chcp 65001 >nul
REM OpenClaw API Switcher Launcher for Windows

cd /d "%~dp0"

REM 检查 npm
where npm >nul 2>nul
if errorlevel 1 (
    echo ❌ 错误: 未找到 npm，请先安装 Node.js
    echo 👉 https://nodejs.org/
    pause
    exit /b 1
)

REM 检查依赖
if not exist "node_modules" (
    echo 📦 首次运行，正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
)

REM 【v2.7.5】启动应用（后台运行）
echo 🚀 启动 OpenClaw API Switcher...
start "" npm start

timeout /t 2 >nul
echo ✅ 应用已启动，窗口即将关闭...

REM 【v2.7.5】延迟后自动关闭当前窗口
timeout /t 1 >nul
exit
