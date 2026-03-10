#!/bin/bash
# OpenClaw API Switcher Launcher
# 【修复】支持 macOS/Linux，直接启动 electron，避免 npm/node 环境冲突

cd "$(dirname "$0")"

# 【修复】直接启动 electron，而不是通过 npm
ELECTRON_PATH=""

# 检测平台
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    ELECTRON_PATH="./node_modules/.bin/electron"
elif [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
    # Linux
    ELECTRON_PATH="./node_modules/.bin/electron"
else
    echo "❌ 错误: 不支持的平台: $OSTYPE"
    exit 1
fi

# 检查 electron 是否存在
if [ ! -f "$ELECTRON_PATH" ]; then
    echo "❌ 错误: 未找到 Electron: $ELECTRON_PATH"
    echo "👉 请先运行: npm install"
    exit 1
fi

# 【修复】启动应用（后台运行并脱离终端）
echo "🚀 启动 OpenClaw API Switcher..."
nohup "$ELECTRON_PATH" . > /dev/null 2>&1 &
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
