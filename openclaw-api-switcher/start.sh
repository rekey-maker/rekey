#!/bin/bash
# OpenClaw API Switcher Launcher for Linux/macOS

cd "$(dirname "$0")"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm not found. Please install Node.js"
    echo "👉 https://nodejs.org/"
    exit 1
fi

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# 【v2.7.5】启动应用（后台运行并脱离终端）
echo "🚀 Starting OpenClaw API Switcher..."
nohup npm start > /dev/null 2>&1 &
disown

# 等待应用启动
sleep 2
echo "✅ Application started"

# 【v2.7.5】如果是图形界面终端，尝试关闭
if [ -n "$TERM" ] && [ "$TERM" != "dumb" ]; then
    # 检查是否在图形终端中（Linux）
    if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
        echo "Closing terminal window..."
        # 尝试关闭当前终端（适用于大多数 Linux 终端模拟器）
        kill -9 $PPID 2>/dev/null || exit 0
    fi
    # 【多平台修复】macOS 检测
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "Closing terminal window..."
        # 使用 osascript 关闭当前 Terminal 窗口
        osascript -e 'tell application "Terminal" to close first window' &
    fi
fi

exit 0
