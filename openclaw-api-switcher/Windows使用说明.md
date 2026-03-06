# OpenClaw API Switcher - Windows 使用说明

## 系统要求

| 项目 | 最低要求 |
|------|----------|
| 操作系统 | Windows 10/11 (64位) |
| 磁盘空间 | 200MB 可用空间 |
| 内存 | 512MB RAM |
| 网络 | 首次安装需要联网 |

---

## 安装步骤

### 第一步：安装 Node.js

**为什么需要 Node.js？**
OpenClaw API Switcher 是基于 Electron 开发的桌面应用，需要 Node.js 运行环境。

**安装方法：**

1. **下载 Node.js 安装包**
   - 访问官方下载页面：https://nodejs.org/
   - 点击下载 **LTS**（长期支持）版本
   - 或者使用以下直链下载：
     - 64位系统：https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi

2. **运行安装程序**
   - 双击下载的 `node-v20.11.1-x64.msi` 文件
   - 按照安装向导点击"下一步"
   - **重要**：保持默认设置，不要修改安装路径
   - 等待安装完成

3. **验证安装**
   - 按 `Win + R`，输入 `powershell`，回车打开 PowerShell
   - 输入以下命令检查版本：
     ```powershell
     node --version
     ```
   - 如果显示版本号（如 `v20.11.1`），说明安装成功

---

### 第二步：安装程序依赖

**为什么需要安装依赖？**
程序运行需要一些第三方库（如 Electron、WebSocket 等），这些通过 npm 包管理器安装。

**安装方法：**

1. **打开 PowerShell**
   - 按 `Win + R`，输入 `powershell`，回车

2. **切换到程序目录**
   - **重要：必须切换到程序所在文件夹！**
   - 输入以下命令（根据你的实际路径修改）：
     ```powershell
     cd C:\Users\你的用户名\Desktop\rekey-main\openclaw-api-switcher
     ```
   - 例如：
     ```powershell
     cd C:\Users\83655\Desktop\rekey-main\openclaw-api-switcher
     ```
   - **验证是否切换成功**：输入 `ls` 或 `dir`，应该能看到 `package.json` 文件

3. **运行安装命令**
   ```powershell
   npm install
   ```

4. **等待安装完成**
   - 首次安装可能需要 3-10 分钟（取决于网络速度）
   - 看到 `added XXX packages` 表示安装成功
   - 可以忽略黄色警告信息（deprecated）

**⚠️ 常见问题：如果提示 "no such file or directory, open 'C:\Users\...\package.json'"**
- **原因**：你没有切换到正确的目录
- **解决**：执行 `cd` 命令切换到包含 `package.json` 的文件夹

---

### 替代方案：手动下载 Electron（如果 npm install 失败）

如果 `npm install` 一直卡住或失败，可以使用提供的脚本手动下载 Electron：

**使用方法：**

1. **双击运行 `下载-electron.bat`**
   - 脚本会自动从国内镜像下载 Electron v28.0.0
   - 自动解压到正确位置
   - 等待下载完成（约 50-100MB，取决于网络速度）

2. **手动安装其他依赖**
   - 下载完成后，仍需运行 `npm install` 安装其他依赖
   - 但此时 Electron 已经存在，安装会快很多

**注意事项：**
- 需要联网下载 Electron
- 如果下载失败，脚本会提示手动下载链接
- 此脚本仅下载 Electron，其他依赖仍需通过 `npm install` 安装

---

### 第三步：启动程序

**方法一：双击启动（推荐）**

1. 打开程序文件夹
2. 双击 `启动.bat` 文件
3. 等待片刻，程序窗口会自动打开
4. CMD 窗口会自动关闭，程序独立运行

**方法二：命令行启动**

1. 打开 PowerShell
2. 切换到程序目录（同上）
3. 运行：
   ```powershell
   npm start
   ```

---

## 常见问题

### Q1: 双击 `启动.bat` 后闪退，什么都没显示

**原因：** Node.js 未安装或未正确安装

**解决方法：**
1. 确认 Node.js 已安装（运行 `node --version` 检查）
2. 如果未安装，请重新安装 Node.js
3. 安装后**重启电脑**，再试

---

### Q2: 提示 "no such file or directory, open '...\package.json'"

**原因：** 没有切换到正确的目录就运行了 `npm install`

**解决方法：**
1. 确认你在正确的文件夹中（包含 `package.json`）
2. 使用 `cd` 命令切换到程序目录：
   ```powershell
   cd C:\Users\你的用户名\Desktop\rekey-main\openclaw-api-switcher
   ```
3. 再次运行 `npm install`

---

### Q3: 提示 "node_modules not found" 或 "Electron not found"

**原因：** 依赖未安装或安装不完整

**解决方法：**
1. 打开 PowerShell
2. 切换到程序目录
3. 运行：
   ```powershell
   npm install
   ```
4. 等待安装完成，不要中途关闭窗口

---

### Q4: `npm install` 卡住不动

**原因：** 网络问题或 npm 源访问慢

**解决方法：**

**方法A：使用国内镜像（推荐）**
```powershell
npm config set registry https://registry.npmmirror.com
npm install
```

**方法B：清理缓存后重试**
```powershell
npm cache clean --force
npm install
```

**方法C：使用 yarn 替代**
```powershell
npm install -g yarn
yarn install
```

---

### Q5: 关闭 CMD 窗口后程序也关闭了

**原因：** 这是正常现象，程序依赖 CMD 进程

**解决方法：**
- 使用最新版本的 `启动.bat`（已修复此问题）
- 或者启动后**最小化** CMD 窗口，不要关闭

---

### Q6: 提示 "Administrator privileges required"

**原因：** 某些操作需要管理员权限

**解决方法：**
1. 右键点击 `启动.bat`
2. 选择"以管理员身份运行"
3. 点击"是"允许权限

---

## 完整示例流程

以下是从零开始的完整步骤：

```powershell
# 1. 打开 PowerShell
# 按 Win + R，输入 powershell，回车

# 2. 切换到程序目录
PS C:\Users\83655> cd Desktop\rekey-main\openclaw-api-switcher

# 3. 验证目录正确（应该能看到 package.json）
PS C:\Users\83655\Desktop\rekey-main\openclaw-api-switcher> ls

# 4. 安装依赖
PS C:\Users\83655\Desktop\rekey-main\openclaw-api-switcher> npm install

# 5. 等待安装完成...
# 看到 added XXX packages 表示成功

# 6. 启动程序（可选，也可以直接双击 启动.bat）
PS C:\Users\83655\Desktop\rekey-main\openclaw-api-switcher> npm start
```

---

## 目录结构说明

```
openclaw-api-switcher/
├── 启动.bat              # Windows 启动脚本（主要入口）
├── 下载-electron.bat     # 手动下载 Electron 脚本（备用）
├── 启动-调试.bat         # 调试版本启动脚本
├── package.json          # 项目配置和依赖列表
├── main.js              # 程序主入口
├── node_modules/        # 依赖文件夹（npm install 后生成）
│   └── electron/        # Electron 框架
├── src/                 # 源代码
└── assets/              # 资源文件
```

---

## 更新程序

如果需要更新到新版：

1. **备份配置**：复制 `config` 文件夹到安全位置
2. **下载新版**：获取最新版本文件
3. **重新安装依赖**：运行 `npm install`
4. **恢复配置**：将备份的 `config` 文件夹复制回来

---

## 卸载程序

1. 关闭正在运行的程序
2. 直接删除程序文件夹
3. （可选）卸载 Node.js（如果不再需要）

---

## 技术支持

遇到问题？

1. 查看程序日志：`logs/` 文件夹
2. 运行调试版本：`启动-调试.bat`
3. 截图错误信息寻求帮助

---

**最后更新：** 2026年3月6日  
**版本：** 3.5.2
