#!/bin/bash
# OpenClaw API Switcher Launcher
# 支持 macOS/Linux

cd "$(dirname "$0")"

# 检查 npm 是否安装
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未找到 npm，请先安装 Node.js"
    echo "👉 https://nodejs.org/"
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
fi

# 启动应用（后台运行并脱离终端）
echo "🚀 启动 OpenClaw API Switcher..."
nohup npm start > /dev/null 2>&1 &
disown

# 等待应用启动
sleep 2
echo "✅ 应用已启动"

# 【v2.7.5】关闭当前终端窗口（macOS）
if [[ "$OSTYPE" == "darwin"* ]]; then
    # 使用 osascript 关闭当前 Terminal 窗口
    osascript -e 'tell application "Terminal" to close first window' &
fi

exit 0
