#!/bin/bash

# OpenClaw API Switcher - 一键检查脚本
# 版本: v1.0
# 创建时间: 2026-02-24

set -e  # 遇到错误立即退出

echo "=========================================="
echo "  OpenClaw API Switcher - 代码检查"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查计数
CHECKS_PASSED=0
CHECKS_FAILED=0

# 检查函数
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((CHECKS_PASSED++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((CHECKS_FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "🔍 第一步: JavaScript 语法检查"
echo "------------------------------------------"

# 检查 main.js
if node -c main.js > /dev/null 2>&1; then
    check_pass "main.js 语法正确"
else
    check_fail "main.js 语法错误"
fi

# 检查 renderer.js
if node -c renderer.js > /dev/null 2>&1; then
    check_pass "renderer.js 语法正确"
else
    check_fail "renderer.js 语法错误"
fi

# 检查 preload.js
if node -c preload.js > /dev/null 2>&1; then
    check_pass "preload.js 语法正确"
else
    check_fail "preload.js 语法错误"
fi

echo ""
echo "🔍 第二步: HTML 标签检查"
echo "------------------------------------------"

# 检查 div 标签
DIV_OPEN=$(grep -c "<div" index.html || true)
DIV_CLOSE=$(grep -c "</div>" index.html || true)

if [ "$DIV_OPEN" -eq "$DIV_CLOSE" ]; then
    check_pass "div 标签匹配 ($DIV_OPEN 对)"
else
    check_fail "div 标签不匹配 (开启: $DIV_OPEN, 关闭: $DIV_CLOSE)"
fi

# 检查 button 标签
BTN_OPEN=$(grep -c "<button" index.html || true)
BTN_CLOSE=$(grep -c "</button>" index.html || true)

if [ "$BTN_OPEN" -eq "$BTN_CLOSE" ]; then
    check_pass "button 标签匹配 ($BTN_OPEN 对)"
else
    check_fail "button 标签不匹配 (开启: $BTN_OPEN, 关闭: $BTN_CLOSE)"
fi

# 检查 span 标签
SPAN_OPEN=$(grep -c "<span" index.html || true)
SPAN_CLOSE=$(grep -c "</span>" index.html || true)

if [ "$SPAN_OPEN" -eq "$SPAN_CLOSE" ]; then
    check_pass "span 标签匹配 ($SPAN_OPEN 对)"
else
    check_fail "span 标签不匹配 (开启: $SPAN_OPEN, 关闭: $SPAN_CLOSE)"
fi

echo ""
echo "🔍 第三步: 关键函数检查"
echo "------------------------------------------"

# 检查 IPC 处理器
IPC_HANDLERS=$(grep -c "ipcMain.handle" main.js || true)
if [ "$IPC_HANDLERS" -gt 0 ]; then
    check_pass "IPC 处理器已注册 ($IPC_HANDLERS 个)"
else
    check_warn "未找到 IPC 处理器"
fi

# 检查 preload 暴露
PRELOAD_EXPOSED=$(grep -c "exposeInMainWorld" preload.js || true)
if [ "$PRELOAD_EXPOSED" -gt 0 ]; then
    check_pass "API 已暴露 ($PRELOAD_EXPOSED 个)"
else
    check_warn "未找到 API 暴露"
fi

# 检查关键函数
if grep -q "function backupConfig" main.js; then
    check_pass "backupConfig 函数存在"
else
    check_fail "backupConfig 函数不存在"
fi

if grep -q "function initializeConfig" main.js; then
    check_pass "initializeConfig 函数存在"
else
    check_fail "initializeConfig 函数不存在"
fi

if grep -q "async function backupNow" renderer.js; then
    check_pass "backupNow 函数存在"
else
    check_fail "backupNow 函数不存在"
fi

echo ""
echo "🔍 第四步: 常见错误模式检查"
echo "------------------------------------------"

# 检查 console 重定向（应该在 require 之前）
if grep -A5 "console.log = () => {}" main.js | grep -q "require('electron')"; then
    check_warn "console 重定向可能在 require 之后"
else
    check_pass "console 重定向位置正确"
fi

# 检查 IPC 参数处理
IPC_ARROW=$(grep -c "ipcMain.handle.*=>" main.js || true)
if [ "$IPC_ARROW" -gt 0 ]; then
    check_pass "IPC 处理器使用箭头函数 ($IPC_ARROW 个)"
else
    check_warn "IPC 处理器可能未正确处理参数"
fi

# 检查 async/await 使用
ASYNC_COUNT=$(grep -c "async function" renderer.js || true)
AWAIT_COUNT=$(grep -c "await " renderer.js || true)
if [ "$ASYNC_COUNT" -gt 0 ] && [ "$AWAIT_COUNT" -gt 0 ]; then
    check_pass "async/await 使用正确 ($ASYNC_COUNT async, $AWAIT_COUNT await)"
else
    check_warn "async/await 使用可能有问题"
fi

echo ""
echo "🔍 第五步: 文件结构检查"
echo "------------------------------------------"

# 检查关键文件
if [ -f "main.js" ]; then
    check_pass "main.js 存在"
else
    check_fail "main.js 不存在"
fi

if [ -f "renderer.js" ]; then
    check_pass "renderer.js 存在"
else
    check_fail "renderer.js 不存在"
fi

if [ -f "preload.js" ]; then
    check_pass "preload.js 存在"
else
    check_fail "preload.js 不存在"
fi

if [ -f "index.html" ]; then
    check_pass "index.html 存在"
else
    check_fail "index.html 不存在"
fi

if [ -f "styles.css" ]; then
    check_pass "styles.css 存在"
else
    check_fail "styles.css 不存在"
fi

if [ -f "package.json" ]; then
    check_pass "package.json 存在"
else
    check_fail "package.json 不存在"
fi

echo ""
echo "=========================================="
echo "  检查结果"
echo "=========================================="
echo -e "${GREEN}通过: $CHECKS_PASSED${NC}"
echo -e "${RED}失败: $CHECKS_FAILED${NC}"

if [ $CHECKS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ 所有检查通过！${NC}"
    echo ""
    echo "可以安全地提交代码。"
    exit 0
else
    echo ""
    echo -e "${RED}✗ 有 $CHECKS_FAILED 项检查失败${NC}"
    echo ""
    echo "请修复上述问题后再提交。"
    exit 1
fi
