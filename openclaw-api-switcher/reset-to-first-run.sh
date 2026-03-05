#!/bin/bash
# 重置 OpenClaw API Switcher 为首次使用状态（保留 OpenClaw 配置用于迁移）

echo "🔄 重置程序为首次使用状态..."

# 删除 API Switcher 配置文件
if [ -f "./config/api-config.json" ]; then
    rm "./config/api-config.json"
    echo "✅ 已删除 API Switcher 配置文件"
else
    echo "ℹ️ API Switcher 配置文件不存在"
fi

# 删除日志文件
if [ -d "./config/logs" ]; then
    rm -rf "./config/logs"
    echo "✅ 已删除日志文件"
fi

# 删除临时文件
if [ -d "./config/temp" ]; then
    rm -rf "./config/temp"
    echo "✅ 已删除临时文件"
fi

echo ""
echo "🎉 重置完成！"
echo ""
echo "📋 当前状态："
echo "  - API Switcher 配置: 已清空 ✅"
echo "  - OpenClaw 配置: 保留 ✅"
echo ""
echo "下次启动程序时将显示迁移引导界面"
echo "可以从 OpenClaw 迁移配置到 API Switcher"
echo ""
echo "⚠️ 注意：此操作仅删除了 API Switcher 的配置"
echo "  OpenClaw 的配置保留，用于迁移"
