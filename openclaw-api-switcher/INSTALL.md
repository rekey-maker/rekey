# OpenClaw API Switcher 安装指南

## 📋 目录

- [系统要求](#系统要求)
- [安装步骤](#安装步骤)
- [常见问题](#常见问题)
- [故障排除](#故障排除)

---

## 系统要求

### 必需软件

| 软件 | 版本要求 | 用途 |
|------|---------|------|
| **Node.js** | >= 18.0.0 | 运行时环境 |
| **npm** | >= 9.0.0 | 包管理器 |
| **OpenClaw** | >= 2026.2.17 | 核心依赖 |

### 支持的平台

| 平台 | 最低版本 | 状态 |
|------|----------|------|
| **macOS** | 10.15+ | ✅ 完全支持 |
| **Windows** | 10+ | ✅ 完全支持 |
| **Linux** | Ubuntu 20.04+ | ✅ 完全支持 |

---

## 安装步骤

### 第一步：安装 Node.js

#### macOS

```bash
# 使用 Homebrew 安装（推荐）
brew install node

# 验证安装
node --version  # 应显示 v18.x.x 或更高
npm --version   # 应显示 9.x.x 或更高
```

如果没有 Homebrew，从 [nodejs.org](https://nodejs.org) 下载安装包。

#### Windows

1. 访问 [nodejs.org](https://nodejs.org)
2. 下载 LTS 版本（长期支持版）
3. 运行安装程序，按提示完成安装
4. 打开命令提示符，验证：
   ```cmd
   node --version
   npm --version
   ```

#### Linux (Ubuntu/Debian)

```bash
# 使用 apt 安装
sudo apt update
sudo apt install nodejs npm

# 或使用 NodeSource 安装最新版
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node --version
npm --version
```

### 第二步：安装 OpenClaw

```bash
npm install -g openclaw

# 验证安装
openclaw --version
```

### 第三步：下载项目

#### 方法 1：使用 Git 克隆

```bash
cd ~/Desktop
git clone <repository-url> openclaw-api-switcher
cd openclaw-api-switcher
```

#### 方法 2：直接下载压缩包

1. 下载项目压缩包
2. 解压到桌面或其他位置
3. 打开终端，进入项目目录：
   ```bash
   cd ~/Desktop/openclaw-api-switcher
   ```

### 第四步：安装项目依赖

```bash
npm install
```

这一步会下载所有必需的依赖包，可能需要几分钟时间。

### 第五步：启动应用

#### macOS

```bash
# 方法 1：使用启动脚本
./启动.command

# 方法 2：使用 start.sh
./start.sh

# 方法 3：直接使用 npm
npm start
```

**注意**：如果双击 `启动.command` 提示"无法打开"，请参考下方的 [macOS 权限问题](#macos-权限问题)。

#### Windows

```batch
:: 方法 1：双击 启动.bat
:: 方法 2：命令行
启动.bat
:: 或
start.bat
:: 或
npm start
```

#### Linux

```bash
./start.sh
# 或
npm start
```

---

## 常见问题

### macOS 启动问题

#### 问题：双击 `启动.command` 无法打开或没有反应

**最常见原因：缺少 Node.js**

这是 90% 的用户遇到的问题！`.command` 文件需要调用 `npm` 命令，如果没有安装 Node.js，脚本会静默失败。

**快速检查**：
```bash
# 在终端中运行
node --version
npm --version
```

如果显示 `command not found`，说明缺少 Node.js，请先安装：
```bash
brew install node
```

**其他可能原因及解决方法**：

**原因 1：文件权限问题**

macOS 的安全机制阻止了未签名脚本的运行。

**解决方法**：

**方法 A：使用终端启动（最可靠）**
```bash
cd ~/Desktop/openclaw-api-switcher
./start.sh
```

**方法 B：修改文件权限**
```bash
cd ~/Desktop/openclaw-api-switcher
chmod +x 启动.command
chmod +x start.sh
```

**方法 C：系统偏好设置**
1. 打开"系统偏好设置" → "安全性与隐私"
2. 在"通用"标签页，点击"仍要打开"
3. 重新双击 `启动.command`

**原因 2：提示"无法验证开发者"**

**解决方法**：按住 `Control` 键，然后点击 `启动.command`，选择"打开"。

**原因 3：终端闪退**

可能是终端编码不支持。使用终端启动可以看到具体错误信息：
```bash
cd ~/Desktop/openclaw-api-switcher
./start.sh
```

---

### Node.js 版本问题

#### 问题：提示 Node.js 版本过低

**错误信息**：
```
Error: Node.js version must be >= 18.0.0
```

**解决方法**：

1. 检查当前版本：
   ```bash
   node --version
   ```

2. 如果版本低于 18，需要升级：

   **macOS**：
   ```bash
   brew upgrade node
   ```

   **Windows**：
   - 从 [nodejs.org](https://nodejs.org) 下载最新版安装包
   - 运行安装程序覆盖安装

   **Linux**：
   ```bash
   # 使用 n 模块管理 Node.js 版本
   sudo npm install -g n
   sudo n 18
   ```

---

### 依赖安装失败

#### 问题：`npm install` 失败或卡住

**解决方法**：

1. **清理 npm 缓存**：
   ```bash
   npm cache clean --force
   ```

2. **使用国内镜像（中国大陆用户）**：
   ```bash
   npm config set registry https://registry.npmmirror.com
   npm install
   ```

3. **删除 node_modules 重新安装**：
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

---

### 端口被占用

#### 问题：启动时提示端口 3000 被占用

**解决方法**：

1. **查找占用端口的进程**：
   ```bash
   # macOS/Linux
   lsof -i :3000
   
   # Windows
   netstat -ano | findstr :3000
   ```

2. **终止占用进程**：
   ```bash
   # macOS/Linux
   kill -9 <PID>
   
   # Windows
   taskkill /PID <PID> /F
   ```

3. **或修改应用端口**（编辑 `main.js` 中的端口配置）

---

## 故障排除

### 查看日志

如果应用启动失败，查看日志文件获取详细信息：

```bash
# 日志位置
cat ~/Desktop/openclaw-api-switcher/config/logs/app.log
```

### 重置配置

如果遇到无法解决的问题，可以重置配置：

```bash
cd ~/Desktop/openclaw-api-switcher
./reset-to-first-run.sh
```

**注意**：这将删除所有配置，请确保已备份！

### 完全重新安装

1. 删除项目文件夹
2. 重新下载/克隆项目
3. 重新执行安装步骤

---

## 获取帮助

如果以上方法都无法解决问题：

1. 查看 [README.md](./README.md) 获取更多信息
2. 查看 [docs/经验教训.md](./docs/经验教训.md) 了解已知问题
3. 提交 Issue 并提供详细的错误信息和日志

---

## 快速检查清单

启动前请确认：

- [ ] Node.js >= 18.0.0 (`node --version`)
- [ ] npm >= 9.0.0 (`npm --version`)
- [ ] OpenClaw 已安装 (`openclaw --version`)
- [ ] 已运行 `npm install`
- [ ] 端口 3000 未被占用
- [ ] macOS 用户已授予脚本执行权限

---

**安装完成后，请参考 [README.md](./README.md) 了解如何使用应用。**
