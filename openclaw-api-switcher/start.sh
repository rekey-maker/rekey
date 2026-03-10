#!/bin/bash
# OpenClaw API Switcher Launcher for Linux/macOS
# 【修复】直接启动 electron，避免 npm/node 环境冲突

# 检测终端是否支持 Unicode/Emoji
supports_unicode() {
    # 检查 LANG 或 LC_ALL 是否包含 UTF-8
    if [[ "${LANG}" == *"UTF-8"* ]] || [[ "${LANG}" == *"utf8"* ]] || [[ "${LC_ALL}" == *"UTF-8"* ]]; then
        return 0
    fi
    # 检查 TERM 是否支持颜色（通常支持颜色的终端也支持 Unicode）
    if [[ -n "$TERM" ]] && [[ "$TERM" != "dumb" ]] && [[ "$TERM" != "linux" ]]; then
        return 0
    fi
    return 1
}

# 设置图标（根据终端支持情况）
if supports_unicode; then
    ICON_ERROR="❌"
    ICON_ARROW="👉"
    ICON_PACKAGE="📦"
    ICON_ROCKET="🚀"
    ICON_CHECK="✅"
else
    ICON_ERROR="[ERROR]"
    ICON_ARROW="->"
    ICON_PACKAGE="[INSTALL]"
    ICON_ROCKET="[START]"
    ICON_CHECK="[OK]"
fi

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
    echo "${ICON_ERROR} Error: Unsupported platform: $OSTYPE"
    exit 1
fi

# 检查 electron 是否存在
if [ ! -f "$ELECTRON_PATH" ]; then
    echo "${ICON_ERROR} Error: Electron not found at $ELECTRON_PATH"
    echo "${ICON_ARROW} Please run: npm install"
    exit 1
fi

# 【修复】启动应用（后台运行并脱离终端）
echo "${ICON_ROCKET} Starting OpenClaw API Switcher..."
nohup "$ELECTRON_PATH" . > /dev/null 2>&1 &
disown

# 等待应用启动
sleep 2
echo "${ICON_CHECK} Application started"

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
