# OpenClaw API Switcher v2.3.0

基于 kkclaw 设计的高级 OpenClaw API 切换工具，采用琉璃风格界面。

![Version](https://img.shields.io/badge/version-2.3.0-blue)
![Electron](https://img.shields.io/badge/Electron-28+-9fe2bf)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

---

## 🚀 快速开始

**首次使用？** 请先查看 [**INSTALL.md**](../INSTALL.md) 获取详细的安装指南。

### 一键启动

```bash
# macOS
./启动.command

# Windows
启动.bat

# Linux
./start.sh
```

---

## 📑 目录

- [快速开始](#-快速开始)
- [特性](#-特性)
- [系统要求](#-系统要求)
- [依赖说明](#-依赖说明)
- [安装与启动](#-安装与启动)
- [界面布局](#-界面布局)
- [使用方法](#-使用方法)
- [支持的 Provider](#-支持的-provider)
- [配置文件](#-配置文件)
- [故障排除](#-故障排除)
- [开发指南](#-开发指南)
- [技术栈](#-技术栈)
- [更新日志](#-更新日志)

---

## ✨ 特性

### 🎨 界面
- **琉璃风格 UI** - 渐变背景、光晕效果、毛玻璃卡片
- **大窗口设计** - 1200×800 独立窗口，可滚动内容
- **顶部标签栏** - Providers | 日志 | 诊断 | 会话 | 请求追踪
- **系统托盘** - 最小化到托盘，右键菜单快速操作

### 🔄 核心功能
- **快捷模型切换** - 点击即可切换 Provider 和 Model
- **安全模型切换** - 配置变更前自动备份
- **分类管理 Provider** - 🇨🇳 国内 / 🌍 国外 / 🏠 本地 三大类别
- **统一密钥存储** - 所有密钥保存在项目目录，安全可控
- **自动同步 OpenClaw** - 保存后自动同步到 OpenClaw 配置文件
- **一键测试连接** - 实时检测 API 可用性
- **自定义模型** - 支持手动添加新模型（区分大小写提示）
- **20+ 预设 Provider** - DeepSeek、OpenAI、Claude、Kimi、硅基流动等

### 📝 日志系统
- **独立日志标签页** - 清晰展示，不再拥挤
- **600条历史记录** - 自动保存，支持清空和导出
- **实时推送** - 操作即时显示
- **JSON 导出** - 一键导出日志用于故障排查

### 🔧 诊断工具箱
- **Gateway 状态检查** - 一键查看运行状态（支持多平台检测）
- **系统检查** - 配置、权限、备份完整性
- **备份管理** - 创建/恢复备份，支持分页和批量操作
- **Gateway 控制台** - 执行命令、查看实时输出
- **OpenClaw Doctor** - 运行诊断修复
- **配置初始化** - 一键重置到初始状态（自动备份）

### 📊 会话管理
- **Token 使用监控** - 可视化圆环进度
- **上下文感知** - 接近限制时智能警告
- **会话操作** - 清理上下文、新建会话、重启应用
- **⏳ 冷启动保护** - 60s宽限期倒计时

### 📡 请求追踪
- **实时拦截** - 自动捕获所有 fetch 请求
- **详细信息** - 序列 ID、时间、耗时、状态码
- **错误诊断** - 快速定位连接问题
- **50条历史** - 自动滚动更新

---

## 💻 系统要求

### ⚠️ 重要：必须先安装 Node.js

本应用基于 **Node.js** 和 **Electron** 构建，**必须先安装 Node.js 才能运行**！

| 项目 | 要求 | 安装命令 |
|------|------|---------|
| **Node.js** | >= 18.0.0 | [下载安装](https://nodejs.org) 或 `brew install node` |
| **npm** | >= 9.0.0 | 随 Node.js 自动安装 |
| **OpenClaw** | >= 2026.2.17 | `npm install -g openclaw` |
| **磁盘空间** | >= 200MB | - |
| **内存** | >= 512MB | - |

### 快速检查

```bash
# 检查 Node.js 是否已安装
node --version  # 应显示 v18.x.x 或更高
npm --version   # 应显示 9.x.x 或更高
```

如果显示"command not found"，请先安装 Node.js！

### 支持的平台

| 平台 | 最低版本 | 启动方式 | 状态 |
|------|----------|----------|------|
| **macOS** | 10.15+ | 双击 `启动.command` 或 `start.sh` | ✅ 完全支持 |
| **Windows** | 10+ | 双击 `启动.bat` | ✅ 完全支持 |
| **Linux** | Ubuntu 20.04+ | 运行 `./start.sh` | ✅ 完全支持 |

**注意**：
- **macOS 用户如果双击 `启动.command` 无法打开**，最常见原因是**缺少 Node.js**！请先安装 Node.js：`brew install node`
- 权限问题请参考 [INSTALL.md](../INSTALL.md#macos-启动问题) 解决

---

## 📦 依赖说明

### 必需依赖

```json
{
  "electron": "^28.0.0"
}
```

### 开发依赖

```json
{
  "electron-builder": "^24.0.0"
}
```

### 系统依赖

- **OpenClaw** - 必须已安装并配置好
  ```bash
  npm install -g openclaw
  ```

- **Node.js** - 运行时环境
  - macOS: `brew install node`
  - Windows: 从 [nodejs.org](https://nodejs.org) 下载安装包
  - Linux: `sudo apt install nodejs npm`

---

## 🚀 安装与启动

### 1. 克隆或下载项目

```bash
cd ~/Desktop
git clone <repository-url> openclaw-api-switcher
# 或直接解压下载的压缩包
cd openclaw-api-switcher
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动应用

#### macOS
```bash
# 方法1：双击启动.command
# 方法2：终端启动
./启动.command
# 或
./start.sh
```

#### Windows
```batch
:: 方法1：双击 启动.bat
:: 方法2：命令行
启动.bat
:: 或
start.bat
```

#### Linux
```bash
./start.sh
```

---

## 🖼️ 界面布局

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🦞 OpenClaw API Switcher v2.2.1                   ● 在线 [检查] [配置]  │ ← 标题栏
├─────────────────────────────────────────────────────────────────────────┤
│ [🌐 Providers] [📝 日志] [🔧 诊断] [📊 会话] [📡 请求追踪]            │ ← 标签栏
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌────────────────────────────────────────────────┐  │
│  │ API Providers│  │ 🛡️ 当前使用 [已激活 ✓]                         │  │
│  │ ┌──────────┐ │  │ 🌙 Kimi K2.5                                   │  │
│  │ │+ 添加    │ │  │ Moonshot / kimi-k2.5         [测试连接]        │  │
│  │ └──────────┘ │  └────────────────────────────────────────────────┘  │
│  │ ┌──────────┐ │  ┌────────────────────────────────────────────────┐  │
│  │ │✓ Moonshot│ │  │ 自动连接状态: ● 已连接                         │  │
│  │ │  OpenAI  │ │  └────────────────────────────────────────────────┘  │
│  │ │  ...     │ │                                                      │
│  │ └──────────┘ │                                                      │
│  └──────────────┘                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📖 使用方法

### 首次配置

1. 启动应用后，点击 **[+ 添加]** 按钮
2. 从预设列表中选择 Provider（如 Moonshot、DeepSeek）
3. 输入 API Key
4. 选择要使用的模型
5. 点击 **[添加]**

### 切换模型

1. 点击左侧 **Provider** 卡片
2. 该 Provider 的第一个模型将自动设为当前使用
3. 查看顶部"当前使用"区域确认切换成功
4. 连接状态会自动检测并显示

### 管理 Provider

- **编辑**: 点击 Provider 卡片上的 ✏️ 按钮
- **删除**: 点击 Provider 卡片上的 🗑️ 按钮
- **添加**: 点击 **[+ 添加]** 按钮

### 查看日志

- 点击 **[📝 日志]** 标签
- 查看最近 600 条操作记录
- 点击 **[清空]** 清除历史
- 点击 **[导出]** 将日志保存为 JSON 文件

### 诊断检查

- 点击 **[🔧 诊断]** 标签
- **系统检查**: 查看配置、Gateway、备份、权限状态
- **Gateway 控制台**: 执行命令（status/start/stop/restart/logs）
- **备份管理**: 创建备份、恢复历史版本、删除旧备份
- **初始化配置**: 一键重置所有配置（会自动备份）

### 监控会话

- 点击 **[📊 会话]** 标签
- 查看 Token 使用情况（实时圆环）
- 查看冷启动保护倒计时
- 点击 **[清理上下文]** 或 **[新会话]**
- 点击 **[重启应用]** 重置所有状态

### 请求追踪

- 点击 **[📡 请求追踪]** 标签
- 实时查看所有 API 请求
- 点击请求行查看详细信息
- 使用搜索框筛选特定请求

### 托盘操作

- 点击窗口关闭按钮 → 最小化到托盘
- 右键托盘图标 → 快速菜单（检查/重启 Gateway、备份）
- 左键托盘图标 → 显示/隐藏窗口

---

## 🎯 支持的 Provider

### 🇨🇳 国内 API

| Provider | 图标 | 说明 | 默认模型 |
|----------|------|------|----------|
| Moonshot | 🌙 | 月之暗面 Kimi API | kimi-k2.5, moonshot-v1-128k |
| DeepSeek | 🐋 | DeepSeek 官方 API | deepseek-chat, deepseek-reasoner |
| 阿里云百炼 | ☁️ | 通义千问系列 | qwen-max, qwen-plus |
| 硅基流动 | 💧 | SiliconFlow 平台 | DeepSeek-V3, Qwen2.5 |
| 智谱 AI | 🧠 | GLM-4 系列 | glm-4, glm-4-plus |

### 🌍 国外 API

| Provider | 图标 | 说明 | 默认模型 |
|----------|------|------|----------|
| OpenAI | 🤖 | GPT API | gpt-4o, gpt-4o-mini, o1 |
| Anthropic | 🅰️ | Claude API | claude-3-5-sonnet, claude-3-opus |
| Gemini | 💎 | Google Gemini API | gemini-1.5-pro, gemini-1.5-flash |
| Groq | ⚡ | Groq 高速推理 | llama-3.3-70b, mixtral-8x7b |
| Together AI | 🤝 | Together AI 平台 | Llama-3.3, DeepSeek-V3 |
| Azure | ☁️ | Azure OpenAI Service | gpt-4o, gpt-4 |

### 🏠 本地部署

| Provider | 图标 | 说明 | 特点 |
|----------|------|------|------|
| Ollama | 🦙 | 本地 LLM 运行平台 | 无需 API Key |
| vLLM | 🔧 | 高性能推理引擎 | 支持多卡并行 |
| LM Studio | 💻 | 本地模型管理 GUI | 图形化界面 |
| 自定义 | ⚙️ | 自定义 API 地址 | 支持局域网部署 |

---

## ⚙️ 配置文件

### 主要文件

| 文件 | 路径 | 说明 |
|------|------|------|
| **API 配置** | `项目目录/config/api-config.json` | 统一管理所有 Provider 和密钥 |
| **主配置** | `~/.openclaw/openclaw.json` | OpenClaw 主配置（占位符） |
| **模型配置** | `~/.openclaw/agents/main/agent/models.json` | Gateway 读取的模型配置 |
| **认证配置** | `~/.openclaw/agents/main/agent/auth-profiles.json` | OpenClaw 使用的真实 API Key |
| **备份目录** | `~/.openclaw/backups/` | 自动备份存放位置 |
| **日志文件** | `~/.openclaw/api-switcher-logs.json` | 操作日志 |

### 双重存储机制

为了兼容 OpenClaw 的设计，我们采用双重存储机制：

```
┌─────────────────────────────────────────────────────────┐
│  API Switcher 配置 (项目目录/config/api-config.json)      │
│  - 统一管理所有 Provider                                  │
│  - 保存真实的 API Key                                     │
│  - 支持分类管理（国内/国外/本地）                          │
└─────────────────────────────────────────────────────────┘
                           ↓ syncToOpenClaw()
┌─────────────────────────────────────────────────────────┐
│  OpenClaw 配置文件                                       │
│  - openclaw.json: apiKey = "e" (占位符)                  │
│  - models.json: apiKey = "e" (占位符)                    │
│  - auth-profiles.json: key = "sk-..." (真实密钥)         │
└─────────────────────────────────────────────────────────┘
```

### API 配置结构 (api-config.json)

```json
{
  "version": 1,
  "providers": {
    "moonshot": {
      "id": "moonshot",
      "name": "Moonshot",
      "icon": "🌙",
      "baseUrl": "https://api.moonshot.cn/v1",
      "apiKey": "sk-xxxxxxxxxxxx",
      "apiType": "openai",
      "category": "domestic",
      "models": [
        { "id": "kimi-k2.5", "name": "Kimi K2.5", "contextWindow": 256000 }
      ],
      "updatedAt": 1234567890
    }
  },
  "activeProvider": "moonshot",
  "lastUpdated": 1234567890
}
```

---

## 🔧 故障排除

### 应用无法启动

**问题**: 双击启动文件无反应

**解决**:
```bash
# 检查 Node.js 是否安装
node --version
npm --version

# 重新安装依赖
cd ~/Desktop/openclaw-api-switcher
rm -rf node_modules
npm install

# macOS/Linux 添加执行权限
chmod +x 启动.command start.sh
```

### Gateway 检测失败

**问题**: 状态显示"离线"但实际在运行

**解决**:
1. 点击 **[检查 Gateway]** 按钮
2. 在 Gateway 控制台执行 `gateway status`
3. 检查端口 18789 是否被占用
4. 尝试点击 **[运行 Doctor]**

### API 切换后无法连接

**问题**: 切换模型后显示"未连接"

**解决**:
1. 点击 **[测试连接]** 按钮
2. 检查 API Key 是否正确
3. 查看日志标签页的详细错误信息
4. 尝试恢复之前的备份

### Windows PowerShell 执行策略错误

**问题**: 无法运行 npm 脚本

**解决**:
```powershell
# 以管理员身份运行 PowerShell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### macOS 权限问题

**问题**: 提示无法打开应用

**解决**:
```bash
# 添加执行权限
chmod +x 启动.command start.sh

# 或移除隔离属性
xattr -d com.apple.quarantine 启动.command
```

---

## 🛠️ 开发指南

### 项目结构

```
openclaw-api-switcher/
├── index.html              # 主界面
├── renderer.js             # 渲染进程逻辑
├── main.js                 # 主进程（Electron）
├── preload.js              # 预加载脚本
├── api-config.js           # API 配置管理模块
├── styles.css              # 样式文件
├── package.json            # 项目配置
├── config/                 # 配置文件目录
│   └── api-config.json     # 统一密钥存储
├── start.sh                # macOS/Linux 启动脚本
├── 启动.command            # macOS 双击启动
├── 启动.bat                # Windows 启动脚本
├── 任务.md                 # 活跃任务追踪
├── 任务归档.md             # 历史任务归档
├── memory.md               # 核心记忆文档
└── README.md               # 本文件
```

### 开发模式启动

```bash
# 安装依赖
npm install

# 开发模式（带调试工具）
npm start

# 或
npx electron .
```

### 打包发布

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux

# 全部平台
npm run build:all
```

### 调试技巧

1. **打开开发者工具**: `Cmd/Ctrl + Shift + I`
2. **查看主进程日志**: 终端输出
3. **查看渲染进程日志**: Console 面板
4. **检查配置文件**: `~/.openclaw/openclaw.json`

---

## 🧱 技术栈

### 核心技术

| 技术 | 版本 | 用途 |
|------|------|------|
| **Electron** | 28+ | 跨平台桌面应用框架 |
| **Node.js** | 18+ | 运行时环境 |
| **HTML5** | - | 界面结构 |
| **CSS3** | - | 样式和动画 |
| **JavaScript** | ES6+ | 业务逻辑（无前端框架） |

### 关于 Electron

本项目使用 **Electron** 构建，这是一个由 GitHub 开发的跨平台桌面应用框架。

**为什么选择 Electron？**

- ✅ **一套代码，多平台运行** - 可同时打包成 Windows (.exe)、macOS (.dmg)、Linux (.AppImage)
- ✅ **使用 Web 技术** - 用熟悉的 HTML/CSS/JavaScript 开发，无需学习原生开发
- ✅ **丰富的生态系统** - 可使用 npm 海量包资源
- ✅ **原生系统能力** - 可调用文件系统、系统通知、全局快捷键等
- ✅ **现代 UI 设计** - 完全自由的界面设计，不受系统风格限制

**Electron 应用示例**：
VS Code、Slack、Discord、网易云音乐、Notion、Figma、微信桌面版 等知名软件都使用 Electron 构建。

**本项目定位**：
OpenClaw API Switcher 是一个使用 Electron 构建的**跨平台桌面配置工具**，采用"混合应用"开发方式——用 Web 技术实现原生桌面应用体验。

**架构说明**：
```
┌─────────────────────────────────────────┐
│         OpenClaw API Switcher           │
│  ┌─────────────────────────────────┐   │
│  │     界面层 (渲染进程)            │   │
│  │   • HTML/CSS/JS 构建的 UI       │   │
│  │   • 玻璃拟态设计风格             │   │
│  └─────────────────────────────────┘   │
│                    ↓ IPC 通信           │
│  ┌─────────────────────────────────┐   │
│  │     逻辑层 (主进程)              │   │
│  │   • Node.js 运行时              │   │
│  │   • 文件系统操作                 │   │
│  │   • 系统命令执行                 │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 📝 更新日志

### v2.3.0 (2026-02-25)

#### ✨ 新功能
- **新的 API 配置系统** - 重新设计配置管理架构
  - 🇨🇳 分类管理：国内 / 国外 / 本地 三大类别
  - 🔑 统一密钥存储：所有密钥保存在项目目录 `config/api-config.json`
  - 🔄 自动同步：保存后自动同步到 OpenClaw 三个配置文件
  - 📝 明文输入：支持复制粘贴长密钥
  - ➕ 自定义模型：手动添加新模型（区分大小写提示）
  - 🔌 一键测试：实时检测 API 可用性
  - 🎨 20+ 预设 Provider：覆盖主流国内外 API

#### 🔧 改进
- 优化 Provider 切换逻辑，避免密钥丢失
- 改进连接状态检测，响应更快速
- 增强请求追踪 JSON 格式化显示
- 完善删除 Provider 时同时删除密钥

### v2.2.1 (2026-02-22)

#### 修复
- 🐛 修复 HTML 结构错误，会话和请求追踪标签页正常显示
- 🐛 修复 backupList 未声明导致的恢复备份失败
- 🐛 修复 Gateway 命令执行后状态不刷新
- 🐛 修复函数时序问题
- 🐛 修复模态框关闭时未清理状态

#### 增强
- ✨ 添加日志导出功能
- ✨ 添加保存配置时的加载状态
- ✨ 增强错误处理和用户提示
- ✨ 添加内存泄漏防护
- ✨ 完善事件绑定

### v2.2.0 (2026-02-21)

- ✨ 全新琉璃风格界面
- ✨ 添加请求追踪功能
- ✨ 添加会话管理
- ✨ 添加诊断工具箱
- ✨ 支持 10+ 预设 Provider

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT License - 详见 LICENSE 文件

---

**Made with ❤️ for OpenClaw users**
