// 在加载任何模块之前，先禁用所有 console 输出以避免 EIO 错误
console.log = () => {};
console.warn = () => {};
console.error = () => {};
console.info = () => {};
console.debug = () => {};

// 重定向 stdout/stderr 到空设备，防止 EIO 错误
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stdout.write = () => true;
process.stderr.write = () => true;

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');

// 读取应用版本号
let APP_VERSION = '1.0.0';
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  APP_VERSION = packageJson.version || '1.0.0';
} catch (e) {
  // 如果读取失败，使用默认版本号
}

// OpenClaw 配置路径（固定为 ~/.openclaw）- 只用于 API Key 等 OpenClaw 原生配置
const OPENCLAW_CONFIG_DIR = path.join(os.homedir(), '.openclaw');
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_CONFIG_DIR, 'openclaw.json');

// API Switcher 配置路径（程序根目录）- 用于 provider 顺序、当前模型等程序相关配置
const API_SWITCHER_DIR = path.join(__dirname, 'config');
const API_CONFIG_PATH = path.join(API_SWITCHER_DIR, 'api-config.json');

// 备份目录（程序根目录）
const BACKUP_DIR = path.join(__dirname, 'backups');

// 日志目录（程序根目录，按日期分文件）
const LOGS_DIR = path.join(__dirname, 'logs');

// 获取当前日期的日志文件路径
function getLogPath() {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LOGS_DIR, `${date}.json`);
}

let mainWindow;
let tray = null;
let logs = [];
let requestHistory = [];
let lastModel = null;
let startupTime = Date.now();

// 是否暂停请求追踪（用于 Gateway 健康检测期间）
let pauseRequestTracking = false;

// 检测平台
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

// 用户自定义的 openclaw 根目录（手动设置）
let customOpenClawRoot = null;

// 设置自定义 openclaw 根目录（仅内存，不保存到文件）
function setCustomOpenClawRoot(rootPath) {
  customOpenClawRoot = rootPath;
  addLog('info', `[OpenClaw] 设置自定义根目录: ${rootPath}`, '', 'system');
}

// 扫描 OpenClaw 配置目录（多平台）
function scanOpenClawConfigDir() {
  try {
    // OpenClaw 配置目录默认在用户主目录下的 .openclaw
    const configDir = path.join(os.homedir(), '.openclaw');

    // 检查配置目录是否存在
    if (fs.existsSync(configDir)) {
      // 检查是否包含 openclaw.json 配置文件
      const configFile = path.join(configDir, 'openclaw.json');
      if (fs.existsSync(configFile)) {
        addLog('info', `[OpenClaw] 扫描到配置目录: ${configDir}`, '', 'system');
        return { type: 'default', root: configDir };
      }
    }

    // 如果默认目录不存在，尝试通过 openclaw 命令获取配置目录
    const { execSync } = require('child_process');
    try {
      // 尝试执行 openclaw 命令获取信息
      const output = execSync('openclaw config dir 2>/dev/null || echo ~/.openclaw', { encoding: 'utf8', timeout: 3000 }).trim();
      if (output && fs.existsSync(output)) {
        addLog('info', `[OpenClaw] 通过命令扫描到配置目录: ${output}`, '', 'system');
        return { type: 'detected', root: output };
      }
    } catch (e) {
      // 命令执行失败，使用默认路径
    }

    // 返回默认配置目录（即使不存在）
    addLog('info', `[OpenClaw] 使用默认配置目录: ${configDir}`, '', 'system');
    return { type: 'default', root: configDir };
  } catch (e) {
    addLog('error', `[OpenClaw] 扫描配置目录失败: ${e.message}`, '', 'system');
    return null;
  }
}

// 扫描 OpenClaw 根目录（多平台）- 保留原函数用于兼容
function scanOpenClawRoot() {
  // 现在直接返回配置目录
  return scanOpenClawConfigDir();
}

// 获取 OpenClaw 根目录
function getOpenClawRoot() {
  // 优先使用用户自定义的根目录
  if (customOpenClawRoot) {
    return { type: 'custom', root: customOpenClawRoot };
  }
  
  // 尝试扫描
  const scanned = scanOpenClawRoot();
  if (scanned) {
    // 自动保存扫描结果到配置文件
    if (!customOpenClawRoot) {
      customOpenClawRoot = scanned.root;
      saveAppConfig();
      addLog('info', `[OpenClaw] 自动保存扫描结果到配置: ${scanned.root}`, '', 'system');
    }
    return scanned;
  }
  
  // 默认目录
  return { type: 'default', root: OPENCLAW_CONFIG_DIR };
}

// 从根目录获取可执行文件路径
function getOpenClawExecutableFromRoot(rootInfo) {
  const root = rootInfo.root;
  
  if (rootInfo.type === 'wsl') {
    return { type: 'wsl', path: 'wsl openclaw' };
  }
  
  if (isWin) {
    // Windows: 尝试多种可能的路径
    const possiblePaths = [
      path.join(root, 'openclaw.exe'),
      path.join(root, 'openclaw.cmd'),
      path.join(root, 'bin', 'openclaw.exe'),
      path.join(root, 'Scripts', 'openclaw.exe'),
    ];
    
    for (const exePath of possiblePaths) {
      if (fs.existsSync(exePath)) {
        return { type: 'win32', path: exePath };
      }
    }
    
    // 如果找不到具体文件，返回命令名
    return { type: 'win32', path: 'openclaw' };
  }
  
  // macOS / Linux
  const possiblePaths = [
    path.join(root, 'bin', 'openclaw'),
    path.join(root, 'openclaw'),
    '/usr/local/bin/openclaw',
    '/opt/openclaw/bin/openclaw',
  ];
  
  for (const exePath of possiblePaths) {
    if (fs.existsSync(exePath)) {
      return { type: 'unix', path: exePath };
    }
  }
  
  return { type: 'unix', path: 'openclaw' };
}

// 获取 openclaw 命令信息（支持 WSL 和自定义路径）
function getOpenClawCommand() {
  // 优先使用用户自定义根目录
  if (customOpenClawRoot) {
    addLog('info', `[OpenClaw] 使用自定义根目录: ${customOpenClawRoot}`, '', 'system');
    const exeInfo = getOpenClawExecutableFromRoot({ type: 'custom', root: customOpenClawRoot });
    return exeInfo;
  }
  
  // 尝试扫描
  const scanned = scanOpenClawRoot();
  if (scanned) {
    addLog('info', `[OpenClaw] 使用扫描结果: ${scanned.root}`, '', 'system');
    const exeInfo = getOpenClawExecutableFromRoot(scanned);
    return exeInfo;
  }
  
  // 回退到默认命令
  addLog('info', `[OpenClaw] 使用默认命令`, '', 'system');
  if (isWin) {
    return { type: 'win32', path: 'openclaw.cmd' };
  }
  return { type: 'unix', path: 'openclaw' };
}

// 构建 spawn 参数（支持 WSL）
function buildOpenClawSpawnArgs(args) {
  const cmdInfo = getOpenClawCommand();
  if (cmdInfo.type === 'wsl') {
    return {
      command: 'wsl',
      args: ['openclaw', ...args],
      shell: false
    };
  }
  return {
    command: typeof cmdInfo.path === 'string' ? cmdInfo.path : 'openclaw',
    args: args,
    shell: isWin
  };
}

// 查找 openclaw 命令的完整路径
function findOpenClawPath() {
  try {
    const { execSync } = require('child_process');
    
    // Windows: 优先尝试 WSL 中的 openclaw
    if (isWin) {
      try {
        // 检查 WSL 是否安装且 openclaw 是否在 WSL 中可用
        execSync('wsl --version', { windowsHide: true, timeout: 3000 });
        const wslResult = execSync('wsl which openclaw', { encoding: 'utf8', timeout: 3000 }).trim();
        if (wslResult) {
          addLog('info', `[OpenClaw] 找到 WSL 中的命令: ${wslResult}`, '', 'system');
          return { type: 'wsl', path: wslResult };
        }
      } catch (e) {
        // WSL 中没有 openclaw，继续检查 Windows 本地
      }
      
      // 检查 Windows 本地的 openclaw.cmd
      try {
        const output = execSync('where openclaw', { encoding: 'utf8', timeout: 5000 });
        const lines = output.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const result = lines[0];
        if (result && typeof result === 'string') {
          addLog('info', `[OpenClaw] 找到 Windows 本地命令: ${result}`, '', 'system');
          return { type: 'win32', path: result };
        }
      } catch (e) {
        // 本地也没有
      }
      
      return { type: 'win32', path: 'openclaw.cmd' };
    }
    
    // macOS/Linux: 使用 which 查找
    const output = execSync('which openclaw', { encoding: 'utf8', timeout: 5000 });
    const result = output.trim();
    if (result && typeof result === 'string') {
      return { type: 'unix', path: result };
    }
    return { type: 'unix', path: 'openclaw' };
  } catch (e) {
    // 确保始终返回对象格式
    if (isWin) {
      return { type: 'win32', path: 'openclaw.cmd' };
    }
    return { type: 'unix', path: 'openclaw' };
  }
}

// 创建空白托盘图标（16x16 透明）
function createTrayIcon() {
  // 创建一个 16x16 的透明 PNG
  const transparentPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0xF3, 0xFF, 0x61, 0x00, 0x00, 0x00,
    0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
  return nativeImage.createFromBuffer(transparentPng);
}

// 加载日志（读取当天日志文件）
function loadLogs() {
  try {
    const logPath = getLogPath();
    if (fs.existsSync(logPath)) {
      logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } else {
      logs = [];
    }
  } catch (e) {
    logs = [];
  }
}

// 保存日志（按日期分文件）
function saveLogs() {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const logPath = getLogPath();
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
    // 清理7天前的日志
    cleanOldLogs();
  } catch (e) {
    // 静默处理，避免 EIO 错误
  }
}

// 清理7天前的日志
function cleanOldLogs() {
  try {
    if (!fs.existsSync(LOGS_DIR)) return;
    const files = fs.readdirSync(LOGS_DIR);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const dateStr = file.replace('.json', '');
      const fileDate = new Date(dateStr);
      if (fileDate < sevenDaysAgo) {
        fs.unlinkSync(path.join(LOGS_DIR, file));
      }
    }
  } catch (e) {
    // 静默处理
  }
}

// 添加日志
function addLog(level, message, details = '', logType = 'system') {
  const log = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    timestamp: new Date().toISOString(),
    level,      // success | info | warning | error
    logType,    // user | system
    message,
    details
  };
  logs.unshift(log);
  if (logs.length > 200) logs = logs.slice(0, 200);
  saveLogs();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-updated', log);
  }
  return log;
}

// ============================================================================
// 全局 API 请求追踪
// ============================================================================

/**
 * 追踪 HTTP 请求
 * @param {Object} requestData - 请求数据
 * @param {string} requestData.url - 请求 URL
 * @param {string} requestData.method - 请求方法
 * @param {number} requestData.status - 响应状态码
 * @param {number} requestData.duration - 请求耗时(ms)
 * @param {boolean} requestData.success - 是否成功
 * @param {string} requestData.error - 错误信息
 */
// 用于合并连续的健康检测请求
let healthCheckBatch = null;
let healthCheckTimer = null;

function trackRequest(requestData) {
  const url = requestData.url || 'Unknown URL';
  
  // 如果暂停了请求追踪，直接返回（用于 Gateway 健康检测期间）
  if (pauseRequestTracking) {
    return null;
  }
  
  const entry = {
    id: 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    url: url,
    method: requestData.method || 'GET',
    status: requestData.status,
    duration: requestData.duration || 0,
    success: requestData.success,
    error: requestData.error || null
  };
  
  // 添加到历史记录
  requestHistory.unshift(entry);
  if (requestHistory.length > 50) {
    requestHistory = requestHistory.slice(0, 50);
  }
  
  console.log('[Main] 请求已追踪:', entry.url, '状态:', entry.status);
  
  // 通知渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('request-tracked', entry);
  }
  
  return entry;
}

// 包装 HTTP/HTTPS 请求以追踪
function wrapHttpRequest() {
  const https = require('https');
  const http = require('http');
  
  // 保存原始请求方法
  const originalHttpsRequest = https.request;
  const originalHttpRequest = http.request;
  
  // 包装 HTTPS 请求
  https.request = function(...args) {
    const startTime = Date.now();
    const options = args[0];
    const url = typeof options === 'string' ? options : `${options.protocol || 'https:'}//${options.hostname || options.host}${options.path || options.pathname || '/'}`;
    const method = options.method || 'GET';

    const req = originalHttpsRequest.apply(this, args);

    req.on('response', (res) => {
      const duration = Date.now() - startTime;
      let responseData = '';
      let responseSize = 0;
      const maxSize = 100 * 1024; // 最大 100KB

      res.on('data', (chunk) => {
        responseSize += chunk.length;
        if (responseSize <= maxSize) {
          responseData += chunk.toString('utf8');
        }
      });

      res.on('end', () => {
        // 尝试解析 JSON，如果失败则保存原始文本
        let parsedData = null;
        if (responseData) {
          try {
            parsedData = JSON.parse(responseData);
          } catch (e) {
            // 不是 JSON，保存前 500 字符的文本
            parsedData = responseData.substring(0, 500);
            if (responseData.length > 500) {
              parsedData += '... (truncated)';
            }
          }
        }

        trackRequest({
          url: url,
          method: method,
          status: res.statusCode,
          duration: duration,
          success: res.statusCode >= 200 && res.statusCode < 300,
          error: null,
          responseData: parsedData,
          responseSize: responseSize
        });
      });
    });

    req.on('error', (error) => {
      const duration = Date.now() - startTime;
      trackRequest({
        url: url,
        method: method,
        status: 0,
        duration: duration,
        success: false,
        error: error.message
      });
    });

    return req;
  };

  // 包装 HTTP 请求
  http.request = function(...args) {
    const startTime = Date.now();
    const options = args[0];
    const url = typeof options === 'string' ? options : `${options.protocol || 'http:'}//${options.hostname || options.host}${options.path || options.pathname || '/'}`;
    const method = options.method || 'GET';

    const req = originalHttpRequest.apply(this, args);

    req.on('response', (res) => {
      const duration = Date.now() - startTime;
      let responseData = '';
      let responseSize = 0;
      const maxSize = 100 * 1024; // 最大 100KB

      res.on('data', (chunk) => {
        responseSize += chunk.length;
        if (responseSize <= maxSize) {
          responseData += chunk.toString('utf8');
        }
      });

      res.on('end', () => {
        // 尝试解析 JSON，如果失败则保存原始文本
        let parsedData = null;
        if (responseData) {
          try {
            parsedData = JSON.parse(responseData);
          } catch (e) {
            // 不是 JSON，保存前 500 字符的文本
            parsedData = responseData.substring(0, 500);
            if (responseData.length > 500) {
              parsedData += '... (truncated)';
            }
          }
        }

        trackRequest({
          url: url,
          method: method,
          status: res.statusCode,
          duration: duration,
          success: res.statusCode >= 200 && res.statusCode < 300,
          error: null,
          responseData: parsedData,
          responseSize: responseSize
        });
      });
    });

    req.on('error', (error) => {
      const duration = Date.now() - startTime;
      trackRequest({
        url: url,
        method: method,
        status: 0,
        duration: duration,
        success: false,
        error: error.message
      });
    });

    return req;
  };
  
  console.log('[Main] HTTP/HTTPS 请求追踪已启用');
}

// 加载 OpenClaw 配置（只读，用于获取 API Key 等）
function loadOpenClawConfig() {
  try {
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      let config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
      
      // 清理程序私有字段（避免污染 OpenClaw 配置）
      let needsSave = false;
      if (config.apiSwitcher || config._backup) {
        delete config.apiSwitcher;
        delete config._backup;
        addLog('info', '已清理 OpenClaw 配置中的程序私有字段', { fields: ['apiSwitcher', '_backup'] }, 'system');
        needsSave = true;
      }
      
      // 使用官方模板修复配置（补充缺失的 wizard、commands、meta 等字段）
      const apiConfig = require('./api-config');
      if (apiConfig.repairOpenClawConfigWithTemplate) {
        const repairedConfig = apiConfig.repairOpenClawConfigWithTemplate(config);
        // 检查是否有变化
        if (JSON.stringify(repairedConfig) !== JSON.stringify(config)) {
          config = repairedConfig;
          addLog('info', '已使用官方模板修复 OpenClaw 配置', {}, 'system');
          needsSave = true;
        }
      }
      
      // 保存修复后的配置（按官方顺序）
      if (needsSave) {
        try {
          const orderedConfig = {
            wizard: config.wizard,
            auth: config.auth,
            models: config.models,
            agents: config.agents,
            commands: config.commands,
            gateway: config.gateway,
            meta: config.meta
          };
          fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedConfig, null, 2), 'utf8');
          addLog('info', '已保存修复后的 OpenClaw 配置（按官方顺序）', {}, 'system');
        } catch (saveError) {
          addLog('warning', '保存修复后的配置失败', { error: saveError.message }, 'system');
        }
      }
      
      return config;
    }
  } catch (e) {
    addLog('error', '加载 OpenClaw 配置失败', { error: e.message }, 'system');
  }
  return { models: { providers: {} }, agents: { defaults: { model: {} } } };
}

// 加载 API Switcher 配置（provider 顺序、当前模型等）
function loadApiSwitcherConfig() {
  try {
    // 使用 api-config.js 中的函数（带大小写规范化）
    const apiConfig = require('./api-config');
    // 使用规范化加载，处理大小写冲突
    return apiConfig.loadApiConfigNormalized();
  } catch (e) {
    addLog('error', '加载 API Switcher 配置失败', { error: e.message }, 'system');
  }
  return { providers: {}, activeProvider: null, providerOrder: [], selectedModel: null };
}

// 保存 API Switcher 配置
function saveApiSwitcherConfig(config) {
  try {
    const apiConfig = require('./api-config');
    const currentConfig = apiConfig.loadApiConfig();
    const newConfig = {
      ...currentConfig,
      providerOrder: config.providerOrder,
      selectedModel: config.selectedModel,
      lastUpdated: Date.now()
    };
    // 使用规范化保存，处理大小写
    apiConfig.saveApiConfigNormalized(newConfig);
    return true;
  } catch (e) {
    addLog('error', '保存 API Switcher 配置失败', { error: e.message }, 'system');
    return false;
  }
}

// 加载 OpenClaw auth-profiles.json
function loadAuthProfiles() {
  try {
    const authProfilesPath = path.join(OPENCLAW_CONFIG_DIR, 'auth-profiles.json');
    if (!fs.existsSync(authProfilesPath)) {
      return null;
    }
    const content = fs.readFileSync(authProfilesPath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    addLog('error', '加载 auth-profiles.json 失败', { error: e.message }, 'system');
    return null;
  }
}

// 加载配置 - 程序配置优先，OpenClaw 配置补充 API Key
function loadConfig() {
  try {
    const openclawConfig = loadOpenClawConfig();
    const apiSwitcherConfig = loadApiSwitcherConfig();
    
    // 从程序配置加载 providers（主数据源）
    let providers = apiSwitcherConfig.providers || {};
    
    // 如果程序配置为空，尝试从 OpenClaw 迁移（兼容旧版本）
    if (Object.keys(providers).length === 0 && openclawConfig.models?.providers) {
      providers = openclawConfig.models.providers;
      // 迁移到程序配置
      apiSwitcherConfig.providers = providers;
      saveApiSwitcherConfig(apiSwitcherConfig);
      addLog('info', '已从 OpenClaw 迁移供应商配置到程序配置', {}, 'system');
    }
    
    // 新架构：API Key 直接从 api-config.json 读取（主数据源）
    // 不再需要从 auth-profiles.json 合并，因为 api-config.json 已包含真实 API Key
    // 保留此注释以说明架构变更（2026-02-28）
    
    return {
      // 不再展开 ...openclawConfig，避免混淆
      models: {
        providers: providers
      },
      providerOrder: apiSwitcherConfig.providerOrder || [],
      agents: {
        defaults: {
          model: {
            primary: apiSwitcherConfig.selectedModel || openclawConfig.agents?.defaults?.model?.primary
          }
        }
      },
      // 保留其他必要的 OpenClaw 配置
      gateway: openclawConfig.gateway,
      commands: openclawConfig.commands
    };
  } catch (error) {
    addLog('error', '加载配置失败', { error: error.message }, 'system');
    // 返回默认配置
    return {
      models: { providers: {} },
      providerOrder: [],
      agents: { defaults: { model: { primary: '' } } },
      gateway: null,
      commands: null
    };
  }
}

// 【v2.7.5 新增】按官方字段顺序保存 OpenClaw 配置
function saveOpenClawConfigOrdered(config) {
  const orderedConfig = {
    wizard: config.wizard,
    auth: config.auth,
    models: config.models,
    agents: config.agents,
    commands: config.commands,
    gateway: config.gateway,
    meta: config.meta
  };
  fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedConfig, null, 2), 'utf8');
}

// 保存配置 - 分离 OpenClaw 配置和程序配置
function saveConfig(config) {
  try {
    // 1. 保存 API Switcher 配置（providers、providerOrder、selectedModel）
    const apiSwitcherConfigToSave = {
      providers: config.models?.providers || {},  // 保存 providers 到程序配置
      providerOrder: config.providerOrder,
      selectedModel: config.agents?.defaults?.model?.primary
    };
    saveApiSwitcherConfig(apiSwitcherConfigToSave);
    
    // 2. 读取现有 OpenClaw 配置
    let existingOpenClawConfig = {};
    try {
      if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
        existingOpenClawConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
      }
    } catch (e) {
      // 静默处理
    }
    
    // 3. 不再保存 providers 到 openclaw.json，避免影响 OpenClaw
    // 只保留必要的 OpenClaw 配置（gateway、commands 等）
    const openclawConfigUpdate = {
      // 不保存 models.providers，保持 OpenClaw 配置干净
    };
    
    // 深度合并 OpenClaw 配置
    let mergedOpenClawConfig = deepMerge(existingOpenClawConfig, openclawConfigUpdate);
    
    // 确保关键字段不被覆盖为空
    if (!mergedOpenClawConfig.gateway && existingOpenClawConfig.gateway) {
      mergedOpenClawConfig.gateway = existingOpenClawConfig.gateway;
    }
    if (!mergedOpenClawConfig.auth && existingOpenClawConfig.auth) {
      mergedOpenClawConfig.auth = existingOpenClawConfig.auth;
    }
    if (!mergedOpenClawConfig.commands && existingOpenClawConfig.commands) {
      mergedOpenClawConfig.commands = existingOpenClawConfig.commands;
    }
    // 特别确保 commands.restart 字段存在
    if (!mergedOpenClawConfig.commands?.restart && existingOpenClawConfig.commands?.restart) {
      if (!mergedOpenClawConfig.commands) mergedOpenClawConfig.commands = {};
      mergedOpenClawConfig.commands.restart = existingOpenClawConfig.commands.restart;
    }
    
    fs.mkdirSync(OPENCLAW_CONFIG_DIR, { recursive: true });
    
    // 4. 先同步 auth-profiles.json（使用原始 config 中的真实 key）
    syncAuthProfiles(config);
    
    // 5. 原子写入 openclaw.json：先写临时文件再 rename（按官方顺序）
    const tmpPath = OPENCLAW_CONFIG_PATH + '.tmp';
    const backupPath = OPENCLAW_CONFIG_PATH + '.backup.' + Date.now();
    
    // 如果 openclaw.json 存在，先备份
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      try {
        fs.copyFileSync(OPENCLAW_CONFIG_PATH, backupPath);
      } catch (e) {
        // 静默处理
      }
    }
    
    // 按照官方顺序排列配置字段
    const orderedConfig = {
      wizard: mergedOpenClawConfig.wizard,
      auth: mergedOpenClawConfig.auth,
      models: mergedOpenClawConfig.models,
      agents: mergedOpenClawConfig.agents,
      commands: mergedOpenClawConfig.commands,
      gateway: mergedOpenClawConfig.gateway,
      meta: mergedOpenClawConfig.meta
    };
    
    // 写入临时文件
    fs.writeFileSync(tmpPath, JSON.stringify(orderedConfig, null, 2), 'utf8');
    
    // 重命名为正式文件
    try {
      fs.renameSync(tmpPath, OPENCLAW_CONFIG_PATH);
    } catch (e) {
      // 尝试直接写入
      fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedConfig, null, 2), 'utf8');
    }
    
    // 6. 同步 models.json（kkclaw 关键机制，使用替换后的 mergedOpenClawConfig）
    syncModelsJson(mergedOpenClawConfig);
    
    // 7. 清理 Session（kkclaw 关键机制）
    clearLarkSessions();
    
    addLog('success', '配置已保存（openclaw.json 使用占位符，真实 key 已同步到 auth-profiles.json）', '', 'system');
    
    // 8. 清理临时文件
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (e) {
      // 静默处理
    }
    
    return true;
  } catch (e) {
    addLog('error', '保存配置失败', { error: e.message }, 'system');
    return false;
  }
}

// 同步 models.json（kkclaw 机制）
// 注意：这里传入的 config 已经替换过 apiKey 为占位符 "e"
function syncModelsJson(config) {
  try {
    const modelsPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'models.json');
    const providers = config.models?.providers || {};
    
    // 验证：确保所有 apiKey 都是占位符
    for (const [name, cfg] of Object.entries(providers)) {
      if (cfg.apiKey && cfg.apiKey !== 'e' && cfg.apiKey.length > 10) {
        cfg.apiKey = 'e';
      }
    }
    
    fs.mkdirSync(path.dirname(modelsPath), { recursive: true });
    fs.writeFileSync(modelsPath, JSON.stringify({ providers }, null, 2), 'utf8');
  } catch (e) {
    // 静默处理错误
  }
}

// 同步 auth-profiles.json（关键！真正存储 API Key 的地方）
function syncAuthProfiles(config) {
  try {
    const authPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'auth-profiles.json');
    const providers = config.models?.providers || {};
    
    // 读取现有的 auth-profiles
    let authData = { version: 1, profiles: {}, lastGood: {}, usageStats: {} };
    try {
      if (fs.existsSync(authPath)) {
        authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      }
    } catch (e) {
      // 静默处理
    }
    
    // 为每个有 apiKey 的 provider 更新 auth profile
    let updatedCount = 0;
    for (const [providerName, providerConfig] of Object.entries(providers)) {
      const apiKey = providerConfig.apiKey?.trim();
      // 同步条件：有 apiKey、不是占位符 'e'、长度大于 10（防止误同步无效值）
      if (apiKey && apiKey !== 'e' && apiKey.length > 10) {
        const profileKey = `${providerName}:default`;
        authData.profiles[profileKey] = {
          type: 'api_key',
          provider: providerName,
          key: apiKey
        };
        authData.lastGood[providerName] = profileKey;
        updatedCount++;
      }
    }
    
    fs.mkdirSync(path.dirname(authPath), { recursive: true });
    fs.writeFileSync(authPath, JSON.stringify(authData, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

// 清理飞书 Session（kkclaw 机制）
function clearLarkSessions() {
  try {
    const sessionDir = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'sessions');
    const sessionFile = path.join(sessionDir, 'sessions.json');
    
    if (!fs.existsSync(sessionFile)) {
      return { success: true, deletedCount: 0, message: '没有活动会话' };
    }
    
    const sessionsData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    let deletedCount = 0;
    const updatedSessions = { ...sessionsData };
    
    for (const [key, value] of Object.entries(sessionsData)) {
      if (key.includes('lark:') && value.sessionId) {
        const sessionPath = path.join(sessionDir, `${value.sessionId}.jsonl`);
        const lockPath = sessionPath + '.lock';
        
        // 检查锁文件
        if (fs.existsSync(lockPath)) {
          addLog('warn', `Session ${value.sessionId} 被锁定，跳过删除`, '', 'system');
          continue;
        }
        
        // 删除 session 文件
        if (fs.existsSync(sessionPath)) {
          try {
            fs.unlinkSync(sessionPath);
            deletedCount++;
            delete updatedSessions[key];
            addLog('info', `已删除会话: ${value.sessionId}`, '', 'system');
          } catch (err) {
            addLog('error', `删除 session 失败: ${err.message}`, '', 'system');
          }
        }
      }
    }
    
    // 更新 sessions.json 索引
    if (deletedCount > 0) {
      fs.writeFileSync(sessionFile, JSON.stringify(updatedSessions, null, 2), 'utf8');
      addLog('info', `已清理 ${deletedCount} 个飞书会话，索引已更新`, '', 'system');
    }
    
    return { 
      success: true, 
      deletedCount, 
      message: deletedCount > 0 ? `已清理 ${deletedCount} 个会话` : '没有需要清理的会话' 
    };
  } catch (e) {
    addLog('error', '清理飞书会话失败', e.message, 'system');
    return { success: false, deletedCount: 0, message: `清理失败: ${e.message}`, error: e.message };
  }
}

// 【v2.7.3 新增】检查 Gateway 状态（带重试）
async function checkGatewayStatusWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const status = await checkGatewayWebSocket();
    if (status.running) {
      return status;
    }
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return { running: false };
}

// 【v2.7.4 新增】修复 Gateway 服务（安装并启动）
async function repairGatewayService() {
  return new Promise((resolve) => {
    addLog('info', '[Gateway修复] 开始安装 Gateway 服务...', {}, 'system');

    // 先执行 install
    const installSpawnInfo = buildOpenClawSpawnArgs(['gateway', 'install']);
    const installOptions = {
      shell: installSpawnInfo.shell !== false
    };
    // Windows 特有选项
    if (isWin) {
      installOptions.windowsHide = true;
    }
    const installProcess = spawn(installSpawnInfo.command, installSpawnInfo.args, installOptions);

    let installOutput = '';
    let installError = '';

    installProcess.stdout.on('data', (data) => {
      installOutput += data.toString();
    });

    installProcess.stderr.on('data', (data) => {
      installError += data.toString();
    });

    installProcess.on('close', (installCode) => {
      addLog('info', `[Gateway修复] install 命令退出码: ${installCode}`, {}, 'system');

      // 无论 install 是否成功，都尝试启动
      addLog('info', '[Gateway修复] 尝试启动 Gateway 服务...', {}, 'system');

      const startSpawnInfo = buildOpenClawSpawnArgs(['gateway', 'start']);
      const startOptions = {
        shell: startSpawnInfo.shell !== false
      };
      // Windows 特有选项
      if (isWin) {
        startOptions.windowsHide = true;
      }
      const startProcess = spawn(startSpawnInfo.command, startSpawnInfo.args, startOptions);

      let startOutput = '';
      let startError = '';

      startProcess.stdout.on('data', (data) => {
        startOutput += data.toString();
      });

      startProcess.stderr.on('data', (data) => {
        startError += data.toString();
      });

      startProcess.on('close', (startCode) => {
        addLog('info', `[Gateway修复] start 命令退出码: ${startCode}`, {}, 'system');

        // 等待几秒让服务启动
        setTimeout(async () => {
          // 验证服务是否真正启动
          const verifyStatus = await checkGatewayStatusWithRetry(3);

          if (verifyStatus.running) {
            addLog('success', '[Gateway修复] 服务已成功启动', {}, 'system');
            resolve({ success: true });
          } else {
            addLog('error', '[Gateway修复] 服务启动后验证失败', {}, 'system');
            resolve({
              success: false,
              error: '服务启动失败，请手动执行: openclaw gateway install && openclaw gateway start'
            });
          }
        }, 3000);
      });

      startProcess.on('error', (err) => {
        addLog('error', `[Gateway修复] 启动进程错误: ${err.message}`, {}, 'system');
        resolve({ success: false, error: err.message });
      });
    });

    installProcess.on('error', (err) => {
      addLog('error', `[Gateway修复] 安装进程错误: ${err.message}`, {}, 'system');
      // 即使 install 失败也尝试启动，不要在这里 resolve
      addLog('info', '[Gateway修复] install 出错，但仍尝试启动...', {}, 'system');

      // 继续尝试启动流程
      const startSpawnInfo = buildOpenClawSpawnArgs(['gateway', 'start']);
      const startOptions = {
        shell: startSpawnInfo.shell !== false
      };
      if (isWin) {
        startOptions.windowsHide = true;
      }
      const startProcess = spawn(startSpawnInfo.command, startSpawnInfo.args, startOptions);

      let startOutput = '';
      let startError = '';

      startProcess.stdout.on('data', (data) => {
        startOutput += data.toString();
      });

      startProcess.stderr.on('data', (data) => {
        startError += data.toString();
      });

      startProcess.on('close', () => {
        setTimeout(async () => {
          const verifyStatus = await checkGatewayStatusWithRetry(3);
          if (verifyStatus.running) {
            addLog('success', '[Gateway修复] 服务已成功启动', {}, 'system');
            resolve({ success: true });
          } else {
            resolve({ success: false, error: '服务启动失败' });
          }
        }, 3000);
      });
    });
  });
}

// 检查 Gateway WebSocket 连接（最准确的检测方式）
async function checkGatewayWebSocket() {
  return new Promise((resolve) => {
    try {
      const WebSocket = require('ws');
      // 尝试连接 Gateway 的 WebSocket，不指定子协议
      const ws = new WebSocket('ws://127.0.0.1:18789', {
        handshakeTimeout: 2000,
        rejectUnauthorized: false,
        followRedirects: true
      });
      
      let resolved = false;
      
      ws.on('open', () => {
        if (resolved) return;
        resolved = true;
        ws.close();
        resolve({ running: true, health: 'healthy' });
      });
      
      ws.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        resolve({ running: false, error: err.message });
      });
      
      ws.on('close', () => {
        if (!resolved) {
          resolved = true;
          resolve({ running: false });
        }
      });
      
      // 超时处理 - 1秒超时，快速检测
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.terminate();
          resolve({ running: false, error: 'timeout' });
        }
      }, 1000);
      
    } catch (e) {
      resolve({ running: false, error: e.message });
    }
  });
}

// 深度合并对象
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// 获取 Gateway 状态 - 简化版（用于重启过程，静默检测不输出日志）
async function getGatewayStatusSimple() {
  // 只使用 WebSocket 检测，静默模式（不输出日志）
  const wsCheck = await checkGatewayWebSocket();
  return {
    running: wsCheck.running,
    output: wsCheck.running ? 'WebSocket 连接成功' : 'WebSocket 连接失败',
    method: 'websocket',
    code: wsCheck.running ? 0 : 1
  };
}

// 获取 Gateway 状态 - 改进版（支持 WebSocket 连接检测）
async function getGatewayStatus() {
  // 首先尝试 WebSocket 连接检测（最准确）
  addLog('info', '[Gateway] 开始 WebSocket 检测...', '', 'system');
  const wsCheck = await checkGatewayWebSocket();
  addLog('info', `[Gateway] WebSocket 检测结果: ${JSON.stringify(wsCheck)}`, '', 'system');
  if (wsCheck.running) {
    return {
      running: true,
      output: 'Gateway 运行正常（WebSocket 连接成功）',
      method: 'websocket',
      health: wsCheck.health
    };
  }
  
  return new Promise((resolve) => {
    const spawnInfo = buildOpenClawSpawnArgs(['gateway', 'status']);
    let output = '';
    let hasResolved = false;
    
    // 主要检测方式：直接调用 openclaw gateway status
    const proc = spawn(spawnInfo.command, spawnInfo.args, {
      windowsHide: true,
      timeout: 8000,
      shell: spawnInfo.shell
    });
    
    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', (code) => {
      if (hasResolved) return;
      hasResolved = true;
      
      // 检查输出中是否包含明确的运行中标志
      // 必须同时满足：退出码为0，且包含明确的运行状态关键词
      const outputLower = output.toLowerCase();
      const hasRunningFlag = outputLower.includes('status: running') || 
                             outputLower.includes('state: running') ||
                             outputLower.includes('gateway is running') ||
                             outputLower.includes('running on') ||
                             outputLower.includes('listening on');
      
      // 排除错误提示中的关键词
      const hasErrorFlag = outputLower.includes('not running') ||
                          outputLower.includes('not reachable') ||
                          outputLower.includes('gateway not') ||
                          outputLower.includes('failed to') ||
                          outputLower.includes('error:');
      
      const isRunning = code === 0 && hasRunningFlag && !hasErrorFlag;
      
      resolve({
        running: isRunning,
        output: output || 'Gateway 状态检查完成',
        method: 'openclaw gateway status',
        code: code
      });
    });

    proc.on('error', (err) => {
      if (hasResolved) return;
      hasResolved = true;
      resolve({
        running: false,
        output: `检测错误: ${err.message}`,
        error: err.message
      });
    });
    
    // 超时处理
    setTimeout(() => {
      if (hasResolved) return;
      hasResolved = true;
      proc.kill();
      
      // 超时后备选：检查端口和进程
      const checkPort = () => {
        const netCmd = isWin
          ? 'netstat -an | findstr "18789"'
          : 'netstat -tlnp 2>/dev/null | grep "18789" || lsof -i :18789';
        
        return new Promise((resolvePort) => {
          exec(netCmd, { windowsHide: true }, (error, stdout) => {
            resolvePort(!error && stdout.length > 0);
          });
        });
      };
      
      const checkProcess = () => {
        const psCmd = isWin
          ? 'tasklist | findstr "openclaw"'
          : 'ps aux | grep -v grep | grep "openclaw gateway"';
        
        return new Promise((resolveProc) => {
          exec(psCmd, { windowsHide: true }, (error, stdout) => {
            resolveProc(!error && stdout.length > 0);
          });
        });
      };
      
      Promise.all([checkPort(), checkProcess()]).then(([portListening, processRunning]) => {
        const isRunning = portListening || processRunning;
        resolve({
          running: isRunning,
          output: isRunning ? 'Gateway 正在运行（前台模式）' : 'Gateway 未运行',
          method: 'port/process check (timeout fallback)',
          details: { portListening, processRunning }
        });
      });
    }, 8000);
  });
}

// 执行命令并等待完成
async function execOpenClawCommand(args, timeout = 60000) {
  return new Promise((resolve) => {
    const spawnInfo = buildOpenClawSpawnArgs(args);
    let output = '';
    let hasResolved = false;

    const proc = spawn(spawnInfo.command, spawnInfo.args, {
      windowsHide: true,
      shell: true,
      timeout: timeout
    });

    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (hasResolved) return;
      hasResolved = true;
      resolve({ success: code === 0, code, output });
    });

    proc.on('error', (err) => {
      if (hasResolved) return;
      hasResolved = true;
      resolve({ success: false, code: -1, output: '', error: err.message });
    });

    setTimeout(() => {
      if (hasResolved) return;
      hasResolved = true;
      proc.kill();
      resolve({ success: false, code: -2, output, error: 'timeout' });
    }, timeout);
  });
}

// 检测 Gateway 是否真正就绪（使用 WebSocket，和 OpenClaw 官方一样）
async function isGatewayReady() {
  return new Promise((resolve) => {
    const WebSocket = require('ws');
    const ws = new WebSocket('ws://127.0.0.1:18789');
    let settled = false;
    
    const settle = (result) => {
      if (settled) return;
      settled = true;
      ws.terminate();
      resolve(result);
    };
    
    ws.on('open', () => {
      // 连接成功，发送 probe 请求
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 'probe',
        method: 'health',
        params: {}
      }));
    });
    
    ws.on('message', () => {
      // 收到响应，说明 Gateway 真正就绪
      settle(true);
    });
    
    ws.on('error', () => {
      settle(false);
    });
    
    ws.on('close', () => {
      settle(false);
    });
    
    // 2秒超时
    setTimeout(() => {
      settle(false);
    }, 2000);
  });
}

// 停止 Gateway
async function stopGateway() {
  return new Promise((resolve) => {
    addLog('info', '正在停止 Gateway 服务...', '', 'system');
    sendGlobalStatus('正在停止 Gateway 服务...', 'info');

    // 执行 stop 命令
    const stopSpawnInfo = buildOpenClawSpawnArgs(['gateway', 'stop']);
    const stopProcess = spawn(stopSpawnInfo.command, stopSpawnInfo.args, {
      windowsHide: true,
      shell: true
    });

    let stdout = '';
    let stderr = '';

    stopProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    stopProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    stopProcess.on('close', (code) => {
      if (code === 0) {
        addLog('success', 'Gateway 服务已停止', '', 'system');
        sendGlobalStatus('Gateway 服务已停止', 'success');
        resolve({ success: true });
      } else {
        addLog('warning', `Gateway 停止命令返回非零状态: ${code}`, { stderr }, 'system');
        // 即使返回非零，也可能已经停止，继续执行
        resolve({ success: true, warning: `退出码: ${code}` });
      }
    });

    // 10秒超时
    setTimeout(() => {
      stopProcess.kill();
      addLog('warning', 'Gateway 停止命令超时，强制继续', '', 'system');
      resolve({ success: true, warning: '命令超时' });
    }, 10000);
  });
}

// 重启 Gateway - 并行计时和检测版本
async function restartGateway() {
  return new Promise((resolve) => {
    let elapsed = 0;
    let isSuccess = false;
    let timer = null;
    let checkInterval = null;
    let timeoutTimer = null;
    
    // 清理函数
    const cleanup = () => {
      if (timer) clearInterval(timer);
      if (checkInterval) clearInterval(checkInterval);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      // 恢复请求追踪
      pauseRequestTracking = false;
    };
    
    // 暂停请求追踪，避免 Gateway 检测期间的请求刷屏
    pauseRequestTracking = true;
    
    // 1. 立即显示开始状态
    addLog('info', 'Gateway 重启开始，预计需要 1 分钟左右...', '', 'system');
    sendGlobalStatus('Gateway 重启中，预计需要 1 分钟左右...', 'info');
    
    // 2. 启动计时器（每秒更新状态栏）
    timer = setInterval(() => {
      elapsed++;
      if (isSuccess) return;
      
      // 根据时间显示不同的友好提示
      if (elapsed <= 30) {
        sendGlobalStatus(`Gateway 重启中... 已等待 ${elapsed} 秒`, 'info');
      } else if (elapsed <= 60) {
        sendGlobalStatus(`Gateway 重启中，请耐心等待... 已等待 ${elapsed} 秒`, 'info');
      } else if (elapsed <= 90) {
        sendGlobalStatus(`Gateway 重启中，即将完成... 已等待 ${elapsed} 秒`, 'info');
      } else {
        sendGlobalStatus(`Gateway 重启中，请稍候... 已等待 ${elapsed} 秒`, 'warning');
      }
    }, 1000);
    
    // 3. 执行 restart 命令（不等待完成）
    const restartSpawnInfo = buildOpenClawSpawnArgs(['gateway', 'restart']);
    spawn(restartSpawnInfo.command, restartSpawnInfo.args, {
      windowsHide: true,
      shell: true
    });
    
    // 4. 并行检测（每 3 秒检测一次）
    checkInterval = setInterval(async () => {
      if (isSuccess) return;
      
      try {
        const ready = await isGatewayReady();
        if (ready) {
          isSuccess = true;
          cleanup();
          addLog('success', `Gateway 重启成功！实际用时 ${elapsed} 秒`, '', 'system');
          sendGlobalStatus(`Gateway 重启成功！用时 ${elapsed} 秒`, 'success');
          resolve({ success: true });
        }
      } catch (e) {
        // 检测失败，继续等待
      }
    }, 3000);
    
    // 5. 120秒超时（2分钟）
    timeoutTimer = setTimeout(() => {
      if (!isSuccess) {
        cleanup();
        addLog('error', 'Gateway 重启超时，请检查服务状态或尝试重新安装', '', 'system');
        sendGlobalStatus('Gateway 重启超时，请检查服务状态', 'error');
        resolve({ success: false, error: '启动超时' });
      }
    }, 120000);
  });
}

// 运行 Doctor
async function runDoctor() {
  return new Promise((resolve) => {
    const spawnInfo = buildOpenClawSpawnArgs(['doctor']);
    
    const doctor = spawn(spawnInfo.command, spawnInfo.args, {
      windowsHide: true,
      shell: spawnInfo.shell,
      timeout: 30000
    });
    
    let output = '';
    
    doctor.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    doctor.stderr?.on('data', (data) => {
      output += data.toString();
    });
    
    doctor.on('close', (code) => {
      addLog('info', 'Doctor 检查完成', '', 'system');
      resolve({ success: code === 0, output });
    });
    
    doctor.on('error', (err) => {
      resolve({ success: false, output: '', error: err.message });
    });
  });
}

// 获取会话信息（改进版：读取真实会话文件）
function getSessionInfo() {
  try {
    const sessionDir = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'sessions');
    const sessionFile = path.join(sessionDir, 'sessions.json');
    
    let activeSessions = 0;
    let estimatedTokens = 0;
    const sessions = [];
    
    // 如果会话目录或文件不存在，返回默认值
    if (!fs.existsSync(sessionDir) || !fs.existsSync(sessionFile)) {
      return {
        startupTime,
        uptime: Date.now() - startupTime,
        activeSessions: 0,
        estimatedTokens: 0,
        contextLimit: 128000,
        usage: '0.0',
        sessions: []
      };
    }
    
    // 读取会话索引，添加错误处理
    let sessionsData;
    try {
      sessionsData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    } catch (parseErr) {
      addLog('warn', 'sessions.json 解析失败，可能已损坏', parseErr.message, 'system');
      sessionsData = {};
    }
    
    for (const [key, value] of Object.entries(sessionsData)) {
      if (key.includes('lark:') && value.sessionId) {
        const sessionPath = path.join(sessionDir, `${value.sessionId}.jsonl`);
        
        if (fs.existsSync(sessionPath)) {
          try {
            const stats = fs.statSync(sessionPath);
            
            // 对于大文件（>1MB），使用文件大小估算而不是读取全部内容
            let sessionTokens;
            let messageCount;
            
            if (stats.size > 1024 * 1024) {
              // 大文件：按每行平均 200 字节估算
              messageCount = Math.ceil(stats.size / 200);
              sessionTokens = messageCount * 150;
              addLog('info', `大文件会话使用估算: ${value.sessionId} (${Math.round(stats.size/1024)}KB)`, '', 'system');
            } else {
              // 小文件：读取内容精确计算
              const content = fs.readFileSync(sessionPath, 'utf8');
              const lines = content.trim().split('\n').filter(l => l.length > 0);
              messageCount = lines.length;
              sessionTokens = lines.length * 150;
            }
            
            estimatedTokens += sessionTokens;
            activeSessions++;
            
            sessions.push({
              key,
              sessionId: value.sessionId,
              messageCount,
              estimatedTokens: sessionTokens,
              sizeKB: Math.round(stats.size / 1024),
              lastModified: stats.mtime
            });
          } catch (readErr) {
            addLog('warn', `读取会话文件失败: ${value.sessionId}`, readErr.message, 'system');
          }
        }
      }
    }
    
    // 上下文限制：使用 128K（大多数模型的标准限制）
    const contextLimit = 128000;
    const usage = Math.min((estimatedTokens / contextLimit) * 100, 100).toFixed(1);
    
    return {
      startupTime,
      uptime: Date.now() - startupTime,
      activeSessions,
      estimatedTokens,
      contextLimit,
      usage,
      sessions
    };
  } catch (error) {
    addLog('error', '获取会话信息失败', error.message, 'system');
    // 出错时返回默认值
    return {
      startupTime,
      uptime: Date.now() - startupTime,
      activeSessions: 0,
      estimatedTokens: 0,
      contextLimit: 128000,
      usage: '0.0',
      sessions: [],
      error: error.message
    };
  }
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 15, y: 15 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    backgroundColor: '#0a0a14',
    icon: createTrayIcon()
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // 添加启动通知
    if (Notification.isSupported()) {
      new Notification({
        title: 'OpenClaw API Switcher',
        body: '应用已启动，60秒冷启动保护已激活'
      }).show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('minimize', (event) => {
    // 最小化到托盘
    event.preventDefault();
    mainWindow.hide();
  });

  // 创建托盘
  createTray();
}

// 创建托盘
function createTray() {
  try {
    let trayIcon;
    
    // 尝试从 build 文件夹加载图标
    const icon16Path = path.join(__dirname, 'build', 'tray-icon-16.png');
    const icon32Path = path.join(__dirname, 'build', 'tray-icon-32.png');
    
    if (fs.existsSync(icon16Path)) {
      // 使用生成的青柠绿圆点图标
      trayIcon = nativeImage.createFromPath(icon16Path);
      console.log('[Tray] Loaded icon from build/tray-icon-16.png');
    } else if (fs.existsSync(icon32Path)) {
      trayIcon = nativeImage.createFromPath(icon32Path);
      console.log('[Tray] Loaded icon from build/tray-icon-32.png');
    } else {
      // 备选方案：使用 icon.png 或系统默认图标
      const iconPath = path.join(__dirname, 'icon.png');
      if (fs.existsSync(iconPath)) {
        trayIcon = nativeImage.createFromPath(iconPath);
        console.log('[Tray] Loaded icon from icon.png');
      } else {
        trayIcon = nativeImage.createFromNamedImage('NSStatusItemPriorityRegular', [16, 16]);
        console.log('[Tray] Using system default icon');
      }
    }
    
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
    
    const contextMenu = Menu.buildFromTemplate([
      { label: 'OpenClaw API Switcher v3.5.2', enabled: false },
      { type: 'separator' },
      { 
        label: '显示窗口', 
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { 
        label: '隐藏窗口', 
        click: () => {
          if (mainWindow) {
            mainWindow.hide();
          }
        }
      },
      { type: 'separator' },
      {
        label: '快速操作',
        submenu: [
          { 
            label: '检查 Gateway', 
            click: async () => {
              const status = await getGatewayStatus();
              if (Notification.isSupported()) {
                new Notification({
                  title: 'Gateway 状态',
                  body: status.running ? '✅ Gateway 运行正常' : '❌ Gateway 未运行'
                }).show();
              }
            }
          },
          { 
            label: '重启 Gateway', 
            click: async () => {
              const result = await restartGateway();
              if (Notification.isSupported()) {
                new Notification({
                  title: 'Gateway 重启',
                  body: result.success ? '✅ 重启成功' : '❌ 重启失败'
                }).show();
              }
            }
          },
          { type: 'separator' },
          { 
            label: '备份配置', 
            click: async () => {
              const result = await backupConfig();
              if (Notification.isSupported()) {
                new Notification({
                  title: '配置备份',
                  body: result.success ? '✅ 备份成功' : '❌ 备份失败'
                }).show();
              }
            }
          }
        ]
      },
      { type: 'separator' },
      { 
        label: '退出', 
        click: () => {
          app.quit();
        }
      }
    ]);
    
    tray.setToolTip('OpenClaw API Switcher');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
    
    tray.on('right-click', () => {
      tray.popUpContextMenu();
    });
    
  } catch (e) {
    // 静默处理，避免 EIO 错误
  }
}

// 定义三个关键文件路径
const MODELS_JSON_PATH = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'models.json');
const AUTH_PROFILES_PATH = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'auth-profiles.json');

// 获取当前日期字符串 (YYYY-MM-DD)
function getDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 获取完整时间字符串 (YYYY-MM-DD_HH-MM-SS)
function getTimestampString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
}

// 备份配置 - 新架构版本（备份程序配置 api-config.json）
async function backupConfig(isInitBackup = false) {
  try {
    // 构建备份目录：按日期分文件夹
    const dateStr = getDateString();
    const backupSubDir = isInitBackup 
      ? path.join(BACKUP_DIR, 'init-backups')           // 初始化备份单独存放
      : path.join(BACKUP_DIR, 'archives', dateStr);     // 普通备份按日期存放到 archives 子目录
    
    fs.mkdirSync(backupSubDir, { recursive: true });
    
    const timestamp = getTimestampString();
    
    // 读取程序配置（api-config.json）- 新架构：程序配置是主数据源
    const apiSwitcherConfig = loadApiSwitcherConfig();
    
    // 加密 API Key（批量加密所有供应商的 API Key）
    const apiConfig = require('./api-config');
    const encryptedConfig = apiConfig.encryptConfig(apiSwitcherConfig);
    
    // 获取当前使用的API名称和模型名称
    let currentModel = apiSwitcherConfig.selectedModel || '';
    
    // 如果没有选择模型，尝试从配置中推断
    if (!currentModel) {
      const providers = Object.keys(apiSwitcherConfig.providers || {});
      if (providers.length > 0) {
        const firstProvider = providers[0];
        const providerModels = apiSwitcherConfig.providers[firstProvider].models || [];
        if (providerModels.length > 0) {
          currentModel = firstProvider + '/' + providerModels[0].id;
        } else {
          currentModel = firstProvider + '/default';
        }
      }
    }
    
    // 获取所有供应商和模型信息
    const providers = Object.keys(apiSwitcherConfig.providers || {});
    const allModels = [];
    
    providers.forEach(provider => {
      const providerConfig = apiSwitcherConfig.providers[provider];
      if (providerConfig.models && providerConfig.models.length > 0) {
        // 取每个供应商的第一个模型名
        allModels.push(providerConfig.models[0].id);
      }
    });
    
    // 获取当前供应商名（用于日志和备份数据）
    const providerName = currentModel.split('/')[0] || 'unknown';
    const modelName = currentModel.split('/')[1] || 'unknown';
    
    // 清理文件名中的非法字符（如 / \ : * ? " < > |）
    const sanitizeFileName = (name) => {
      return name.replace(/[\\/:*?"<>|]/g, '-');
    };
    
    // 构建备份文件名：多供应商备份使用所有模型名组合
    let backupFileName;
    if (providers.length > 1) {
      // 多供应商：model1-model2-model3.日期.json
      const modelPart = allModels.slice(0, 3).map(sanitizeFileName).join('-'); // 最多取3个模型名，清理非法字符
      const extraCount = allModels.length > 3 ? `+${allModels.length - 3}` : '';
      backupFileName = `${modelPart}${extraCount}.${timestamp}.json`;
    } else {
      // 单供应商：保持原有格式 provider.model.日期.json
      const safeProviderName = sanitizeFileName(providerName);
      const safeModelName = sanitizeFileName(modelName);
      backupFileName = `${safeProviderName}.${safeModelName}.${timestamp}.json`;
    }
    const backupPath = path.join(backupSubDir, backupFileName);
    const relativePath = path.relative(OPENCLAW_CONFIG_DIR, backupPath);
    
    // 发送状态到全局状态栏
    sendGlobalStatus(`正在备份配置 [${providerName}]...`, 'info');
    
    // 使用 addLog 替代 console.log 避免 EIO 错误
    addLog('info', `[Backup] 开始备份到: ${backupPath}`, '', 'system');
    addLog('info', `[Backup] 当前模型: ${currentModel}, Provider: ${providerName}`, '', 'system');
    
    // 新架构：备份程序配置（api-config.json）
    addLog('info', `[Backup] 读取程序配置: ${API_CONFIG_PATH}`, '', 'system');
    
    // 统计文件大小
    const configSize = fs.existsSync(API_CONFIG_PATH) ? fs.statSync(API_CONFIG_PATH).size : 0;
    
    // 新架构备份数据：只备份程序配置（已加密）
    const backupData = {
      apiSwitcher: encryptedConfig,  // 程序配置（主数据源，已加密）
      _backup: {
        timestamp: new Date().toISOString(),
        type: 'full',  // 完整备份
        provider: providerName,
        model: currentModel,
        version: '3.5.2',  // 新架构版本号
        files: ['api-config.json'],
        fileSizes: {
          'api-config.json': configSize,
          total: configSize
        },
        backupType: isInitBackup ? 'initialization' : 'manual',
        sourceFiles: {
          'api-config.json': API_CONFIG_PATH
        },
        architecture: 'new'  // 标记为新架构备份
      }
    };
    
    // 使用 fsync 确保数据写入磁盘，避免文件系统缓存导致列表刷新不及时
    const fd = fs.openSync(backupPath, 'w');
    const buffer = Buffer.from(JSON.stringify(backupData, null, 2), 'utf8');
    fs.writeSync(fd, buffer);
    fs.fsyncSync(fd); // 强制同步到磁盘
    fs.closeSync(fd);
    
    const backupSize = fs.statSync(backupPath).size;
    
    // 详细日志
    const logMessage = isInitBackup 
      ? `配置已备份(初始化) [${providerName}] (大小: ${(backupSize/1024).toFixed(1)}KB)`
      : `配置已备份 [${providerName}] (大小: ${(backupSize/1024).toFixed(1)}KB)`;
    
    addLog('success', logMessage, { 
      backupPath: backupPath,
      relativePath: relativePath,
      provider: providerName,
      model: currentModel,
      files: ['api-config.json'],
      fileSizes: {
        config: `${(configSize/1024).toFixed(1)}KB`,
        backup: `${(backupSize/1024).toFixed(1)}KB`
      },
      backupType: isInitBackup ? 'initialization' : 'manual',
      timestamp: timestamp,
      backupDir: backupSubDir,
      architecture: 'new'
    }, 'user');
    
    // 发送成功状态到全局状态栏
    const sizeStr = (backupSize / 1024).toFixed(1);
    sendGlobalStatus(`备份完成 [${providerName}] (${sizeStr}KB)`, 'success');
    
    return {
      success: true,
      path: backupPath,
      relativePath: relativePath,
      fileName: backupFileName,
      provider: providerName,
      timestamp: timestamp,
      files: ['api-config.json'],
      backupDir: backupSubDir,
      isInitBackup: isInitBackup,
      size: backupSize,
      fileCount: 1,
      backupType: isInitBackup ? 'initialization' : 'manual',
      folder: isInitBackup ? 'init-backups' : dateStr,
      architecture: 'new',
      type: 'full'  // 添加 type 字段用于分类
    };
  } catch (e) {
    addLog('error', '[Backup] 备份失败: ' + e.message, { 
      stack: e.stack,
      backupDir: BACKUP_DIR
    });
    // 发送失败状态到全局状态栏
    sendGlobalStatus(`备份失败: ${e.message.substring(0, 50)}`, 'error');
    return { success: false, error: e.message };
  }
}

// 备份单个供应商配置
async function backupSingleProvider(providerId, providerConfig) {
  try {
    const dateStr = getDateString();
    const backupSubDir = path.join(BACKUP_DIR, 'archives', dateStr);
    fs.mkdirSync(backupSubDir, { recursive: true });
    
    const timestamp = getTimestampString();
    const backupFileName = `${providerId}.single.${timestamp}.json`;
    const backupPath = path.join(backupSubDir, backupFileName);
    
    sendGlobalStatus(`正在备份供应商 [${providerId}]...`, 'info');
    
    // 加密 API Key
    const apiConfig = require('./api-config');
    const encryptedApiKey = apiConfig.encryptApiKey(providerConfig.apiKey);
    
    const backupData = {
      _backup: {
        timestamp: new Date().toISOString(),
        type: 'single',
        provider: providerId,
        version: '3.5.2',
        architecture: 'new'
      },
      provider: {
        id: providerId,
        name: providerConfig.name || providerId,
        icon: providerConfig.icon,
        color: providerConfig.color,
        baseUrl: providerConfig.baseUrl,
        apiKey: encryptedApiKey,  // 使用加密后的 API Key
        models: providerConfig.models || []
      }
    };
    
    const fd = fs.openSync(backupPath, 'w');
    const buffer = Buffer.from(JSON.stringify(backupData, null, 2), 'utf8');
    fs.writeSync(fd, buffer);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    
    const backupSize = fs.statSync(backupPath).size;
    
    addLog('success', `供应商配置已备份 [${providerId}]`, {
      backupPath: backupPath,
      provider: providerId,
      modelCount: providerConfig.models?.length || 0
    }, 'user');
    
    sendGlobalStatus(`备份完成 [${providerId}] (${(backupSize/1024).toFixed(1)}KB)`, 'success');
    
    return {
      success: true,
      path: backupPath,
      provider: providerId,
      timestamp: timestamp,
      type: 'single',
      size: backupSize
    };
  } catch (e) {
    addLog('error', '[Backup] 单供应商备份失败: ' + e.message, { provider: providerId });
    sendGlobalStatus(`备份失败: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
}

// 初始化配置 - 从 init-backups 恢复初始文件
async function initializeConfig() {
  try {
    // 发送状态到全局状态栏
    sendGlobalStatus('正在初始化配置...', 'info');
    
    addLog('info', '[恢复初始化] 开始从 init-backups 恢复初始配置...', '', 'system');
    
    // 查找 init-backups 目录下的最新备份
    const initBackupsDir = path.join(BACKUP_DIR, 'init-backups');
    
    if (!fs.existsSync(initBackupsDir)) {
      addLog('error', '[恢复初始化] init-backups 目录不存在', '', 'system');
      return { success: false, error: 'init-backups 目录不存在，请先创建初始备份' };
    }
    
    const files = fs.readdirSync(initBackupsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(initBackupsDir, f),
        time: fs.statSync(path.join(initBackupsDir, f)).mtime
      }))
      .sort((a, b) => b.time - a.time); // 最新的在前
    
    if (files.length === 0) {
      addLog('error', '[恢复初始化] init-backups 目录中没有备份文件', '', 'system');
      return { success: false, error: 'init-backups 目录中没有备份文件' };
    }
    
    // 使用最新的 init 备份
    const latestInitBackup = files[0];
    addLog('info', `[恢复初始化] 找到初始备份: ${latestInitBackup.name}`, '', 'system');
    sendGlobalStatus(`找到初始备份: ${latestInitBackup.name}`, 'info');
    
    // 从 init-backups 恢复
    addLog('info', `[恢复初始化] 开始从 ${latestInitBackup.path} 恢复...`, '', 'system');
    sendGlobalStatus('开始恢复初始配置...', 'info');
    const backupContent = JSON.parse(fs.readFileSync(latestInitBackup.path, 'utf8'));
    
    // 恢复三个配置文件
    if (backupContent.openclaw && backupContent.modelsJson && backupContent.authProfiles) {
      // 新版备份格式（包含三个文件）
      addLog('info', '[恢复初始化] 检测到新版备份格式，恢复三个文件...', '', 'system');
      sendGlobalStatus('检测到新版备份格式，开始恢复...', 'info');
      
      // 按照官方顺序排列 openclaw 配置
      const orderedOpenclaw = {
        wizard: backupContent.openclaw.wizard,
        auth: backupContent.openclaw.auth,
        models: backupContent.openclaw.models,
        agents: backupContent.openclaw.agents,
        commands: backupContent.openclaw.commands,
        gateway: backupContent.openclaw.gateway,
        meta: backupContent.openclaw.meta
      };
      fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedOpenclaw, null, 2), 'utf8');
      fs.writeFileSync(MODELS_JSON_PATH, JSON.stringify(backupContent.modelsJson, null, 2), 'utf8');
      fs.writeFileSync(AUTH_PROFILES_PATH, JSON.stringify(backupContent.authProfiles, null, 2), 'utf8');
      
      addLog('success', '配置已恢复初始化', { files: [OPENCLAW_CONFIG_PATH, MODELS_JSON_PATH, AUTH_PROFILES_PATH] }, 'user');
      
      // 发送成功状态到全局状态栏
      sendGlobalStatus('初始化完成', 'success');
    } else if (backupContent.openclaw) {
      // 旧版备份格式（只包含 openclaw 字段）
      const configData = backupContent.openclaw;
      
      // 1. 恢复 openclaw.json（按官方顺序）
      const orderedConfig = {
        wizard: configData.wizard,
        auth: configData.auth,
        models: configData.models,
        agents: configData.agents,
        commands: configData.commands,
        gateway: configData.gateway,
        meta: configData.meta
      };
      fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedConfig, null, 2), 'utf8');
      
      // 2. 从 openclaw 中提取并恢复 models.json
      const modelsData = { version: 1, providers: configData.models?.providers || {} };
      fs.mkdirSync(path.dirname(MODELS_JSON_PATH), { recursive: true });
      fs.writeFileSync(MODELS_JSON_PATH, JSON.stringify(modelsData, null, 2), 'utf8');
      
      // 3. 从 openclaw 中提取并恢复 auth-profiles.json
      const authData = { version: 1, profiles: {}, lastGood: {}, usageStats: {} };
      if (configData.auth?.profiles) {
        for (const [key, profile] of Object.entries(configData.auth.profiles)) {
          authData.profiles[key] = { provider: profile.provider, key: 'e', mode: profile.mode || 'api_key' };
        }
      }
      if (configData.models?.providers) {
        for (const [providerName, providerConfig] of Object.entries(configData.models.providers)) {
          const profileKey = `${providerName}:default`;
          if (!authData.profiles[profileKey]) {
            authData.profiles[profileKey] = { provider: providerName, key: providerConfig.apiKey || 'e', mode: 'api_key' };
          } else {
            authData.profiles[profileKey].key = providerConfig.apiKey || 'e';
          }
        }
      }
      fs.mkdirSync(path.dirname(AUTH_PROFILES_PATH), { recursive: true });
      fs.writeFileSync(AUTH_PROFILES_PATH, JSON.stringify(authData, null, 2), 'utf8');
      
      addLog('success', '[恢复初始化] 配置已恢复(旧版备份)', {
        from: latestInitBackup.path,
        to: `openclaw.json→${OPENCLAW_CONFIG_PATH}, models.json→${MODELS_JSON_PATH}, auth-profiles.json→${AUTH_PROFILES_PATH}`
      });
    } else {
      // 最旧版备份格式（直接是 openclaw.json 内容）
      const { _backup, ...configData } = backupContent;
      saveConfig(configData);
      
      addLog('success', '[恢复初始化] 配置已恢复(最旧版备份)', {
        from: latestInitBackup.path,
        to: `openclaw.json→${OPENCLAW_CONFIG_PATH}, models.json→${MODELS_JSON_PATH}, auth-profiles.json→${AUTH_PROFILES_PATH}`
      });
    }
    
    // 清理会话
    clearLarkSessions();

    return {
      success: true,
      message: '配置已从 init-backups 恢复',
      files: ['openclaw.json', 'models.json', 'auth-profiles.json'],
      initBackupPath: latestInitBackup.path
    };
  } catch (e) {
    addLog('error', '[恢复初始化] 恢复失败: ' + e.message, { 
      stack: e.stack 
    });
    // 发送失败状态到全局状态栏
    sendGlobalStatus('初始化失败', 'error');
    return { success: false, error: e.message };
  }
}

/**
 * 初始化 OpenClaw 配置 - 强制融合模板字段
 * 重建完整的配置结构，保留现有配置
 */
async function initializeOpenClawConfig() {
  try {
    sendGlobalStatus('正在初始化 OpenClaw 配置...', 'info');
    addLog('info', '[初始化配置] 开始初始化配置...', {}, 'system');
    
    // 1. 读取现有配置（保留关键参数）
    let currentConfig = {};
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      currentConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    }
    
    // 2. 加载模板
    const apiConfigModule = require('./api-config');
    const template = apiConfigModule.loadOpenClawDefaultTemplate();
    if (!template) {
      addLog('error', '[初始化配置] 模板加载失败', {}, 'system');
      return { success: false, error: '模板加载失败' };
    }
    
    // 3. 创建新配置：模板为基础 + 保留关键参数
    const newConfig = JSON.parse(JSON.stringify(template));
    
    // 保留 OpenClaw 关键参数（如果存在）
    if (currentConfig.gateway) {
      newConfig.gateway = { ...newConfig.gateway, ...currentConfig.gateway };
    }
    if (currentConfig.wizard) {
      newConfig.wizard = currentConfig.wizard;
    }
    if (currentConfig.commands) {
      newConfig.commands = { ...newConfig.commands, ...currentConfig.commands };
    }
    if (currentConfig.meta) {
      newConfig.meta = { ...newConfig.meta, ...currentConfig.meta };
    }
    
    // 4. 清空供应商相关字段（models.providers, auth.profiles, agents.defaults.model.primary）
    newConfig.models = { providers: {} };
    newConfig.auth = { profiles: {} };
    newConfig.agents = { defaults: { model: { primary: '' } } };
    
    // 5. 【修改】Gateway Token 管理
    // 使用 ensureGatewayToken 确保 token 存在且一致
    const { ensureGatewayToken, saveGatewayTokenToAppConfig } = require('./api-config');
    const tokenResult = ensureGatewayToken(newConfig, {
      generateIfMissing: false  // 初始化时不生成新 token，优先保留现有的
    });
    
    newConfig = tokenResult.config;
    
    // 根据 token 状态记录日志
    if (tokenResult.status === 'missing') {
      // 没有现有 token，生成新的
      const { generateGatewayToken } = require('./api-config');
      const newToken = generateGatewayToken();
      if (!newConfig.gateway) newConfig.gateway = {};
      if (!newConfig.gateway.auth) newConfig.gateway.auth = {};
      if (!newConfig.gateway.remote) newConfig.gateway.remote = {};
      newConfig.gateway.auth.token = newToken;
      newConfig.gateway.auth.mode = 'token';
      newConfig.gateway.remote.token = newToken;
      
      addLog('warning', '[初始化配置] Gateway Token 不存在，已生成新 Token（需要重新安装 Gateway）', {}, 'system');
      sendGlobalStatus('Gateway Token 已更新，需要重新安装 Gateway 服务', 'warning');
    } else if (tokenResult.needsReinstall) {
      addLog('warning', `[初始化配置] ${tokenResult.message}`, {}, 'system');
      sendGlobalStatus('Gateway Token 已更新，建议重新安装 Gateway', 'warning');
    } else {
      addLog('info', `[初始化配置] ${tokenResult.message}`, {}, 'system');
    }
    
    // 保存 token 到程序配置（用于备份）
    saveGatewayTokenToAppConfig(newConfig.gateway.auth.token);
    
    // 6. 更新 meta 信息
    if (!newConfig.meta) newConfig.meta = {};
    newConfig.meta.lastTouchedAt = new Date().toISOString();
    newConfig.meta.lastTouchedVersion = '2026.2.26';
    
    // 7. 按照官方顺序重新排列配置字段
    const orderedConfig = {
      wizard: newConfig.wizard,
      auth: newConfig.auth,
      models: newConfig.models,
      agents: newConfig.agents,
      commands: newConfig.commands,
      gateway: newConfig.gateway,
      meta: newConfig.meta
    };
    
    // 8. 保存 openclaw.json（按官方顺序）
    fs.mkdirSync(path.dirname(OPENCLAW_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedConfig, null, 2), 'utf8');
    
    // 9. 【修复】清空 models.json（供应商配置）
    const emptyModelsJson = { providers: {} };
    fs.mkdirSync(path.dirname(MODELS_JSON_PATH), { recursive: true });
    fs.writeFileSync(MODELS_JSON_PATH, JSON.stringify(emptyModelsJson, null, 2), 'utf8');
    addLog('info', '[初始化配置] 已清空 models.json', {}, 'system');
    
    // 10. 【修复】清空 auth-profiles.json（API Key 存储）
    const emptyAuthProfiles = { version: 1, profiles: {}, lastGood: {}, usageStats: {} };
    fs.mkdirSync(path.dirname(AUTH_PROFILES_PATH), { recursive: true });
    fs.writeFileSync(AUTH_PROFILES_PATH, JSON.stringify(emptyAuthProfiles, null, 2), 'utf8');
    addLog('info', '[初始化配置] 已清空 auth-profiles.json', {}, 'system');
    
    addLog('success', '[初始化配置] 配置初始化成功', { 
      files: [OPENCLAW_CONFIG_PATH, MODELS_JSON_PATH, AUTH_PROFILES_PATH]
    }, 'system');
    
    sendGlobalStatus('OpenClaw 配置初始化成功', 'success');
    
    return {
      success: true,
      message: '配置初始化成功',
      files: [OPENCLAW_CONFIG_PATH, MODELS_JSON_PATH, AUTH_PROFILES_PATH]
    };
    
  } catch (error) {
    addLog('error', '[初始化配置] 初始化失败: ' + error.message, { 
      stack: error.stack 
    }, 'system');
    sendGlobalStatus('配置初始化失败', 'error');
    return { success: false, error: error.message };
  }
}

// 生成随机 token
function generateRandomToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 40; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// IPC 处理
ipcMain.handle('load-config', () => loadConfig());

ipcMain.handle('save-config', (event, configData) => {
  // 保存前一个模型用于回滚
  const current = loadConfig();
  lastModel = current.agents?.defaults?.model?.primary;
  
  const saved = saveConfig(configData);
  return { success: saved };
});

ipcMain.handle('get-logs', () => logs);

ipcMain.handle('add-log', (event, level, message, details, logType) => {
  addLog(level, message, details, logType);
  return true;
});

ipcMain.handle('clear-logs', () => {
  logs = [];
  saveLogs();
  return true;
});

ipcMain.handle('open-logs-directory', async () => {
  try {
    const { shell } = require('electron');
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const result = await shell.openPath(logDir);
    // shell.openPath 返回空字符串表示成功，否则返回错误信息
    if (result === '') {
      return { success: true };
    } else {
      return { success: false, message: result };
    }
  } catch (error) {
    console.error('[Main] 打开日志目录失败:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-request-history', () => requestHistory);

ipcMain.handle('clear-requests', () => {
  requestHistory = [];
  return true;
});

ipcMain.handle('backup-config', (event, isInitBackup = false) => backupConfig(isInitBackup));

ipcMain.handle('backup-single-provider', (event, providerId, providerConfig) => backupSingleProvider(providerId, providerConfig));

ipcMain.handle('list-backups', () => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      addLog('info', '[list-backups] 备份目录不存在', { path: BACKUP_DIR }, 'system');
      return [];
    }
    
    const backups = [];
    
    // ========== 扫描 archives 目录（按日期组织的备份）==========
    const archivesDir = path.join(BACKUP_DIR, 'archives');
    
    if (fs.existsSync(archivesDir)) {
      addLog('info', '[list-backups] 开始扫描 archives 目录', { archivesDir }, 'system');
      
      const dateDirs = fs.readdirSync(archivesDir);
      addLog('info', '[list-backups] 发现日期目录', { count: dateDirs.length, dirs: dateDirs }, 'system');
      
      for (const dateDir of dateDirs) {
        // 跳过隐藏文件和.DS_Store
        if (dateDir.startsWith('.') || dateDir === '.DS_Store') continue;
        
        const dateDirPath = path.join(archivesDir, dateDir);
        
        try {
          const stat = fs.statSync(dateDirPath);
          
          if (stat.isDirectory()) {
            // 扫描日期目录中的备份文件
            const files = fs.readdirSync(dateDirPath);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            addLog('info', `[list-backups] 扫描目录 ${dateDir}`, { totalFiles: files.length, jsonFiles: jsonFiles.length }, 'system');
            
            for (const file of jsonFiles) {
              const fullPath = path.join(dateDirPath, file);
              
              try {
                const fileStat = fs.statSync(fullPath);
                
                // 解析备份文件获取信息
                let provider = 'unknown';
                let fileCount = 1;
                let backupVersion = 'legacy';
                let backupType = 'manual';
                let backupDataType = 'full';
                let providers = [];
                let modelName = '';
                
                try {
                  const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                  provider = content._backup?.provider || file.split('.')[0] || 'unknown';
                  modelName = content._backup?.model?.split('/')[1] || '';
                  fileCount = content._backup?.files?.length || 1;
                  backupVersion = content._backup?.version || 'legacy';
                  backupType = content._backup?.backupType || 'manual';
                  backupDataType = content._backup?.type || (file.includes('.single.') ? 'single' : 'full');
                  
                  // 提取 providers 数据（完整备份）
                  if (content.apiSwitcher?.providers) {
                    providers = Object.entries(content.apiSwitcher.providers).map(([name, config]) => ({
                      provider: name,
                      models: config.models || []
                    }));
                  }
                } catch (e) {}
                
                backups.push({
                  name: file,
                  path: fullPath,
                  relativePath: path.join('archives', dateDir, file),
                  folder: dateDir,
                  time: fileStat.mtime,
                  size: fileStat.size,
                  provider: provider,
                  modelName: modelName,
                  fileCount: fileCount,
                  backupVersion: backupVersion,
                  backupType: backupType,
                  dataType: backupDataType,
                  providers: providers,
                  providerCount: providers.length
                });
              } catch (fileError) {
                addLog('warning', `[list-backups] 读取文件失败 ${file}`, { error: fileError.message }, 'system');
              }
            }
          }
        } catch (dirError) {
          addLog('warning', `[list-backups] 读取目录失败 ${dateDir}`, { error: dirError.message }, 'system');
        }
      }
    } else {
      addLog('info', '[list-backups] archives 目录不存在', { path: archivesDir }, 'system');
    }
    
    // ========== 扫描 init-backups 目录（多供应商完整备份）==========
    const initBackupsDir = path.join(BACKUP_DIR, 'init-backups');
    
    if (fs.existsSync(initBackupsDir)) {
      addLog('info', '[list-backups] 开始扫描 init-backups 目录', { initBackupsDir }, 'system');
      
      const files = fs.readdirSync(initBackupsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      addLog('info', `[list-backups] init-backups 目录扫描完成`, { totalFiles: files.length, jsonFiles: jsonFiles.length }, 'system');
      
      for (const file of jsonFiles) {
        const fullPath = path.join(initBackupsDir, file);
        
        try {
          const fileStat = fs.statSync(fullPath);
          
          // 解析备份文件获取信息
          let provider = 'multi';
          let fileCount = 1;
          let backupVersion = 'legacy';
          let backupType = 'manual';
          let backupDataType = 'full';
          let providers = [];
          let modelName = '';
          
          try {
            const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            provider = content._backup?.provider || 'multi';
            modelName = content._backup?.model || '';
            fileCount = content._backup?.files?.length || 1;
            backupVersion = content._backup?.version || 'legacy';
            backupType = content._backup?.backupType || 'manual';
            backupDataType = content._backup?.type || 'full';
            
            // 提取 providers 数据（完整备份）
            if (content.apiSwitcher?.providers) {
              providers = Object.entries(content.apiSwitcher.providers).map(([name, config]) => ({
                provider: name,
                models: config.models || []
              }));
            }
          } catch (e) {}
          
          backups.push({
            name: file,
            path: fullPath,
            relativePath: path.join('init-backups', file),
            folder: 'init-backups',
            time: fileStat.mtime,
            size: fileStat.size,
            provider: provider,
            modelName: modelName,
            fileCount: fileCount,
            backupVersion: backupVersion,
            backupType: backupType,
            dataType: backupDataType,
            providers: providers,
            providerCount: providers.length
          });
        } catch (fileError) {
          addLog('warning', `[list-backups] 读取 init-backups 文件失败 ${file}`, { error: fileError.message }, 'system');
        }
      }
    } else {
      addLog('info', '[list-backups] init-backups 目录不存在', { path: initBackupsDir }, 'system');
    }
    
    addLog('info', '[list-backups] 扫描完成', { totalBackups: backups.length }, 'system');
    
    // 按时间倒序排列
    return backups.sort((a, b) => b.time - a.time);
  } catch (e) {
    addLog('error', '[list-backups] 扫描备份失败', { error: e.message, stack: e.stack }, 'system');
    return [];
  }
});

ipcMain.handle('restore-backup', async (event, backupPath) => {
  try {
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    const provider = backup._backup?.provider || 'unknown';
    const backupTime = backup._backup?.timestamp || new Date().toISOString();
    const backupVersion = backup._backup?.version || 'legacy';
    const architecture = backup._backup?.architecture || 'old';
    const backupType = backup._backup?.type || 'full';
    
    // 发送状态到全局状态栏
    sendGlobalStatus(`正在恢复配置 [${provider}]...`, 'info');
    
    addLog('info', '[restore-backup] 开始恢复备份', { backupPath }, 'system');
    addLog('info', '[restore-backup] 备份文件信息', { provider, backupTime, backupVersion, architecture, backupType }, 'system');
    
    // ===== 单供应商备份恢复 =====
    if (backupType === 'single' && backup.provider) {
      addLog('info', '[restore-backup] 检测到单供应商备份格式，开始恢复...', '', 'system');
      
      const providerData = backup.provider;
      const providerId = providerData.id || provider;
      
      // 1. 读取当前配置
      const currentConfig = loadApiSwitcherConfig();
      if (!currentConfig.providers) {
        currentConfig.providers = {};
      }
      if (!currentConfig.providerOrder) {
        currentConfig.providerOrder = [];
      }
      
      // 2. 更新或添加供应商
      const isNewProvider = !currentConfig.providers[providerId];
      
      // 解密 API Key（如果是密文格式）
      let apiKey = providerData.apiKey || '';
      if (apiKey && typeof apiKey === 'string' && apiKey.startsWith('enc:')) {
        const apiConfig = require('./api-config');
        apiKey = apiConfig.decryptApiKey(apiKey) || apiKey;
        addLog('info', `[restore-backup] 已解密 API Key`, '', 'system');
      }
      
      currentConfig.providers[providerId] = {
        name: providerData.name || providerId,
        baseUrl: providerData.baseUrl || '',
        apiKey: apiKey,  // 使用解密后的 API Key
        icon: providerData.icon || '⚙️',
        color: providerData.color || '#666',
        models: providerData.models || []
      };
      
      // 3. 如果是新供应商，添加到 providerOrder 末尾
      if (isNewProvider) {
        currentConfig.providerOrder.push(providerId);
        addLog('info', `[restore-backup] 新供应商添加到列表末尾: ${providerId}`, '', 'system');
      } else {
        addLog('info', `[restore-backup] 更新现有供应商: ${providerId}`, '', 'system');
      }
      
      // 4. 强制设置该供应商为当前选中
      const firstModel = providerData.models?.[0]?.id || 'default';
      currentConfig.selectedModel = `${providerId}/${firstModel}`;
      currentConfig.activeProvider = providerId;
      addLog('info', `[restore-backup] 设置为当前选中: ${currentConfig.selectedModel}`, '', 'system');
      
      // 5. 保存到 api-config.json
      fs.mkdirSync(path.dirname(API_CONFIG_PATH), { recursive: true });
      fs.writeFileSync(API_CONFIG_PATH, JSON.stringify(currentConfig, null, 2), 'utf8');
      const configSize = fs.statSync(API_CONFIG_PATH).size;
      addLog('info', `[restore-backup] 程序配置已保存，大小: ${(configSize/1024).toFixed(1)}KB`, '', 'system');
      
      // 6. 同步到 OpenClaw
      addLog('info', `[restore-backup] 同步到 OpenClaw: ${providerId}`, '', 'system');
      const apiConfigModule = require('./api-config');
      const syncResult = await apiConfigModule.syncToOpenClaw(providerId, currentConfig.providers[providerId]);
      if (syncResult.success) {
        addLog('info', '[restore-backup] OpenClaw 同步成功', '', 'system');
      } else {
        addLog('warning', `[restore-backup] OpenClaw 同步跳过: ${syncResult.message || '配置未变化'}`, '', 'system');
      }
      
      // 清理会话
      clearLarkSessions();
      
      addLog('success', `供应商配置已恢复并设为当前选中 [${providerId}]`, {
        provider: providerId,
        isNew: isNewProvider,
        selectedModel: currentConfig.selectedModel
      }, 'user');
      
      sendGlobalStatus(`已恢复 [${providerId}] 并设为当前选中`, 'success');
      
      return {
        success: true,
        provider: providerId,
        timestamp: backupTime,
        type: 'single',
        isNewProvider: isNewProvider,
        selectedModel: currentConfig.selectedModel
      };
    }
    
    // ===== 新架构备份格式（完整备份 api-config.json）=====
    if (architecture === 'new' && backup.apiSwitcher) {
      addLog('info', '[restore-backup] 检测到新架构备份格式，开始恢复...', '', 'system');
      
      // 1. 解密备份中的 API Key
      const apiConfig = require('./api-config');
      const decryptedConfig = apiConfig.decryptConfig(backup.apiSwitcher);
      addLog('info', '[restore-backup] 已解密备份中的 API Key', '', 'system');
      
      // 2. 恢复程序配置（api-config.json）
      addLog('info', `[restore-backup] 恢复程序配置到: ${API_CONFIG_PATH}`, '', 'system');
      fs.mkdirSync(path.dirname(API_CONFIG_PATH), { recursive: true });
      fs.writeFileSync(API_CONFIG_PATH, JSON.stringify(decryptedConfig, null, 2), 'utf8');
      const configSize = fs.statSync(API_CONFIG_PATH).size;
      addLog('info', `[restore-backup] 程序配置已恢复，大小: ${(configSize/1024).toFixed(1)}KB`, '', 'system');
      
      // 3. 同步到 OpenClaw（根据当前选中的 provider）
      const apiSwitcherConfig = decryptedConfig;  // 使用解密后的配置
      const selectedModel = apiSwitcherConfig.selectedModel || '';
      const selectedProvider = selectedModel.split('/')[0] || '';
      
      if (selectedProvider && apiSwitcherConfig.providers?.[selectedProvider]) {
        addLog('info', `[restore-backup] 同步到 OpenClaw: ${selectedProvider}`, '', 'system');
        const providerConfig = apiSwitcherConfig.providers[selectedProvider];
        const apiConfigModule = require('./api-config');
        const syncResult = await apiConfigModule.syncToOpenClaw(selectedProvider, providerConfig);
        if (syncResult.success) {
          addLog('info', `[restore-backup] OpenClaw 同步成功`, '', 'system');
        } else {
          addLog('warning', `[restore-backup] OpenClaw 同步跳过: ${syncResult.message || '配置未变化'}`, '', 'system');
        }
      } else {
        addLog('warning', '[restore-backup] 未找到选中的 provider，跳过 OpenClaw 同步', '', 'system');
      }
      
      // 清理会话
      clearLarkSessions();
      
      addLog('success', `配置已恢复 [${provider}] (新架构)`, { 
        file: API_CONFIG_PATH,
        size: `${(configSize/1024).toFixed(1)}KB`
      }, 'user');
      
      // 发送成功状态到全局状态栏
      sendGlobalStatus(`配置恢复完成 [${provider}]`, 'success');
      
      return { 
        success: true,
        provider: provider,
        timestamp: backupTime,
        files: ['api-config.json'],
        architecture: 'new',
        selectedProvider: selectedProvider
      };
    }
    
    // ===== 旧架构备份格式（OpenClaw 配置）=====
    // 检查备份格式（新版还是旧版）
    if (backup.openclaw && backup.modelsJson && backup.authProfiles) {
      // 新版备份格式（包含三个文件）
      addLog('info', '[restore-backup] 检测到旧架构备份格式，开始恢复...', '', 'system');
      
      // 1. 恢复 openclaw.json（按官方顺序）
      addLog('info', `[restore-backup] 恢复 openclaw.json 到: ${OPENCLAW_CONFIG_PATH}`, '', 'system');
      const orderedOpenclaw = {
        wizard: backup.openclaw.wizard,
        auth: backup.openclaw.auth,
        models: backup.openclaw.models,
        agents: backup.openclaw.agents,
        commands: backup.openclaw.commands,
        gateway: backup.openclaw.gateway,
        meta: backup.openclaw.meta
      };
      fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedOpenclaw, null, 2), 'utf8');
      addLog('info', `[restore-backup] openclaw.json 已恢复，大小: ${(fs.statSync(OPENCLAW_CONFIG_PATH).size/1024).toFixed(1)}KB`, '', 'system');
      
      // 2. 恢复 models.json
      addLog('info', `[restore-backup] 恢复 models.json 到: ${MODELS_JSON_PATH}`, '', 'system');
      fs.mkdirSync(path.dirname(MODELS_JSON_PATH), { recursive: true });
      fs.writeFileSync(MODELS_JSON_PATH, JSON.stringify(backup.modelsJson, null, 2), 'utf8');
      addLog('info', `[restore-backup] models.json 已恢复，大小: ${(fs.statSync(MODELS_JSON_PATH).size/1024).toFixed(1)}KB`, '', 'system');
      
      // 3. 恢复 auth-profiles.json
      addLog('info', `[restore-backup] 恢复 auth-profiles.json 到: ${AUTH_PROFILES_PATH}`, '', 'system');
      fs.mkdirSync(path.dirname(AUTH_PROFILES_PATH), { recursive: true });
      fs.writeFileSync(AUTH_PROFILES_PATH, JSON.stringify(backup.authProfiles, null, 2), 'utf8');
      addLog('info', `[restore-backup] auth-profiles.json 已恢复，大小: ${(fs.statSync(AUTH_PROFILES_PATH).size/1024).toFixed(1)}KB`, '', 'system');
      
      // 清理会话
      clearLarkSessions();
      
      addLog('success', `配置已恢复 [${provider}]`, { files: [OPENCLAW_CONFIG_PATH, MODELS_JSON_PATH, AUTH_PROFILES_PATH] }, 'user');
      
      // 发送成功状态到全局状态栏
      sendGlobalStatus(`配置恢复完成 [${provider}]`, 'success');
      
      return { 
        success: true,
        provider: provider,
        timestamp: backupTime,
        files: ['openclaw.json', 'models.json', 'auth-profiles.json']
      };
    } else if (backup.openclaw) {
      // 旧版备份格式（只包含 openclaw 字段）
      addLog('info', '[restore-backup] 检测到旧版备份格式（含openclaw），直接恢复三个文件...', '', 'system');
      
      // 直接使用 backup.openclaw 恢复三个文件
      const configData = backup.openclaw;
      
      // 1. 恢复 openclaw.json（按官方顺序）
      addLog('info', '[restore-backup] 恢复 openclaw.json', '', 'system');
      const orderedConfig = {
        wizard: configData.wizard,
        auth: configData.auth,
        models: configData.models,
        agents: configData.agents,
        commands: configData.commands,
        gateway: configData.gateway,
        meta: configData.meta
      };
      fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedConfig, null, 2), 'utf8');
      
      // 2. 从 openclaw 中提取并恢复 models.json
      addLog('info', '[restore-backup] 从 openclaw 提取 models.json', '', 'system');
      const modelsData = {
        version: 1,
        providers: configData.models?.providers || {}
      };
      fs.mkdirSync(path.dirname(MODELS_JSON_PATH), { recursive: true });
      fs.writeFileSync(MODELS_JSON_PATH, JSON.stringify(modelsData, null, 2), 'utf8');
      
      // 3. 从 openclaw 中提取并恢复 auth-profiles.json
      addLog('info', '[restore-backup] 从 openclaw 提取 auth-profiles.json', '', 'system');
      const authData = {
        version: 1,
        profiles: {},
        lastGood: {},
        usageStats: {}
      };
      // 从 openclaw.auth.profiles 提取认证信息
      if (configData.auth?.profiles) {
        for (const [key, profile] of Object.entries(configData.auth.profiles)) {
          authData.profiles[key] = {
            provider: profile.provider,
            key: 'e', // 旧版备份中 apiKey 在 models.providers 中
            mode: profile.mode || 'api_key'
          };
        }
      }
      // 从 models.providers 提取 apiKey
      if (configData.models?.providers) {
        for (const [providerName, providerConfig] of Object.entries(configData.models.providers)) {
          const profileKey = `${providerName}:default`;
          if (!authData.profiles[profileKey]) {
            authData.profiles[profileKey] = {
              provider: providerName,
              key: providerConfig.apiKey || 'e',
              mode: 'api_key'
            };
          } else {
            authData.profiles[profileKey].key = providerConfig.apiKey || 'e';
          }
        }
      }
      fs.mkdirSync(path.dirname(AUTH_PROFILES_PATH), { recursive: true });
      fs.writeFileSync(AUTH_PROFILES_PATH, JSON.stringify(authData, null, 2), 'utf8');
      
      // 清理会话
      clearLarkSessions();
      
      addLog('success', `配置已恢复 [${provider}] (旧版备份)`, {
        from: backupPath,
        to: [
          `openclaw.json → ${OPENCLAW_CONFIG_PATH}`,
          `models.json → ${MODELS_JSON_PATH}`,
          `auth-profiles.json → ${AUTH_PROFILES_PATH}`
        ]
      });
      
      return { 
        success: true,
        provider: provider,
        timestamp: backupTime,
        files: ['openclaw.json', 'models.json', 'auth-profiles.json'],
        note: '旧版备份已恢复并同步'
      };
    } else {
      // 最旧版备份格式（直接是 openclaw.json 内容）
      addLog('info', '[restore-backup] 检测到最旧版备份格式，直接恢复...', '', 'system');
      
      // 移除备份元数据
      const { _backup, ...configData } = backup;
      
      // 使用 saveConfig 恢复（会自动同步三个文件）
      saveConfig(configData);
      
      addLog('success', `配置已恢复 [${provider}] (最旧版备份)`, {
        from: backupPath,
        to: [
          `openclaw.json → ${OPENCLAW_CONFIG_PATH}`,
          `models.json → ${MODELS_JSON_PATH}`,
          `auth-profiles.json → ${AUTH_PROFILES_PATH}`
        ]
      });
      
      return { 
        success: true,
        provider: provider,
        timestamp: backupTime,
        note: '最旧版备份已恢复并同步'
      };
    }
  } catch (e) {
    addLog('error', '恢复失败', { error: e.message, path: backupPath }, 'system');
    // 发送失败状态到全局状态栏
    sendGlobalStatus('配置恢复失败', 'error');
    return { success: false, error: e.message };
  }
});

ipcMain.handle('initialize-config', initializeConfig);
ipcMain.handle('initialize-openclaw-config', initializeOpenClawConfig);

ipcMain.handle('delete-backup', async (event, backupPath) => {
  try {
    // 从路径中提取备份文件名
    const backupName = path.basename(backupPath);
    // 获取备份文件所在目录
    const backupDir = path.dirname(backupPath);
    
    // 发送状态到全局状态栏
    sendGlobalStatus(`正在删除备份 [${backupName}]...`, 'info');
    
    // 删除备份文件
    fs.unlinkSync(backupPath);
    addLog('info', '备份已删除', { path: backupPath }, 'user');
    
    // 检查并删除空文件夹
    try {
      // 判断是否为 init-backups 根目录（多供应商备份目录），根目录不能删除
      const isInitBackupsRoot = backupDir === path.join(BACKUP_DIR, 'init-backups');
      
      if (isInitBackupsRoot) {
        // init-backups 是根目录，只清理 .DS_Store 等系统文件，保留目录
        const remainingFiles = fs.readdirSync(backupDir);
        for (const file of remainingFiles) {
          if (file === '.DS_Store' || file.startsWith('.')) {
            try {
              fs.unlinkSync(path.join(backupDir, file));
              addLog('info', '清理系统文件', { file }, 'system');
            } catch (e) {
              // 忽略清理系统文件的错误
            }
          }
        }
        addLog('info', 'init-backups 根目录保留', { dir: backupDir }, 'system');
      } else {
        // 日期子目录可以删除
        const remainingFiles = fs.readdirSync(backupDir);
        // 只保留有效的备份文件（排除 .DS_Store 等系统文件）
        const validFiles = remainingFiles.filter(f => {
          // 排除 macOS .DS_Store 和其他隐藏文件
          if (f === '.DS_Store' || f.startsWith('.')) return false;
          // 只保留 .json 备份文件
          return f.endsWith('.json');
        });
        
        // 如果没有有效备份文件了，删除整个日期文件夹（包括 .DS_Store）
        if (validFiles.length === 0) {
          // 使用 rimraf 方式删除非空目录
          const fsExtra = require('fs-extra');
          fsExtra.removeSync(backupDir);
          addLog('info', '空备份目录已删除', { dir: backupDir }, 'user');
        }
      }
    } catch (dirError) {
      // 删除目录失败不影响主流程，只记录日志
      addLog('warning', '清理空备份目录失败', { error: dirError.message, dir: backupDir }, 'system');
    }
    
    // 发送成功状态到全局状态栏
    sendGlobalStatus(`备份已删除 [${backupName}]`, 'success');
    
    return { success: true };
  } catch (e) {
    addLog('error', '删除备份失败', { error: e.message, path: backupPath }, 'user');
    // 发送失败状态到全局状态栏
    sendGlobalStatus(`删除备份失败: ${e.message.substring(0, 30)}`, 'error');
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-backup-directory', async (event, backupPath) => {
  try {
    // 打开备份文件所在目录并选中文件
    shell.showItemInFolder(backupPath);
    addLog('info', '打开备份目录', { path: backupPath }, 'user');
    return { success: true };
  } catch (e) {
    addLog('error', '打开备份目录失败', { error: e.message, path: backupPath }, 'user');
    return { success: false, error: e.message };
  }
});

// 清空全部备份
ipcMain.handle('clear-all-backups', async () => {
  try {
    sendGlobalStatus('正在清空全部备份...', 'info');
    addLog('info', '开始清空全部备份', {}, 'user');
    
    let deletedCount = 0;
    let deletedDirs = 0;
    
    // ========== 1. 清理 archives 目录（按日期组织的备份）==========
    const archivesDir = path.join(BACKUP_DIR, 'archives');
    
    if (fs.existsSync(archivesDir)) {
      addLog('info', '清理 archives 目录', {}, 'system');
      
      // 读取所有日期目录
      const dateDirs = fs.readdirSync(archivesDir);
      
      for (const dateDir of dateDirs) {
        if (dateDir.startsWith('.') || dateDir === '.DS_Store') continue;
        
        const dateDirPath = path.join(archivesDir, dateDir);
        
        try {
          const stat = fs.statSync(dateDirPath);
          
          if (stat.isDirectory()) {
            // 读取目录中的所有文件
            const files = fs.readdirSync(dateDirPath);
            
            // 删除所有JSON备份文件
            for (const file of files) {
              if (file.endsWith('.json')) {
                const filePath = path.join(dateDirPath, file);
                fs.unlinkSync(filePath);
                deletedCount++;
              }
            }
            
            // 检查目录是否为空（或只剩下非JSON文件）
            const remainingFiles = fs.readdirSync(dateDirPath);
            const hasJsonFiles = remainingFiles.some(f => f.endsWith('.json'));
            
            // 如果没有JSON文件了，删除整个日期目录
            if (!hasJsonFiles) {
              // 先删除剩余的非JSON文件
              for (const file of remainingFiles) {
                const filePath = path.join(dateDirPath, file);
                fs.unlinkSync(filePath);
              }
              fs.rmdirSync(dateDirPath);
              deletedDirs++;
            }
          }
        } catch (dirError) {
          addLog('warning', `清理备份目录失败: ${dateDir}`, { error: dirError.message }, 'system');
        }
      }
    } else {
      addLog('info', 'archives 目录不存在，跳过', {}, 'system');
    }
    
    // ========== 2. 清理 init-backups 目录（多供应商完整备份）==========
    const initBackupsDir = path.join(BACKUP_DIR, 'init-backups');
    
    if (fs.existsSync(initBackupsDir)) {
      addLog('info', '清理 init-backups 目录（保留目录本身）', {}, 'system');
      
      const files = fs.readdirSync(initBackupsDir);
      
      for (const file of files) {
        // 只删除 JSON 备份文件，保留目录和其他文件
        if (file.endsWith('.json')) {
          const filePath = path.join(initBackupsDir, file);
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
          } catch (fileError) {
            addLog('warning', `删除 init-backups 文件失败: ${file}`, { error: fileError.message }, 'system');
          }
        }
      }
      
      // 清理系统文件（如 .DS_Store），但保留 init-backups 目录本身
      const remainingFiles = fs.readdirSync(initBackupsDir);
      for (const file of remainingFiles) {
        if (file === '.DS_Store' || file.startsWith('.')) {
          try {
            fs.unlinkSync(path.join(initBackupsDir, file));
            addLog('info', '清理系统文件', { file, dir: 'init-backups' }, 'system');
          } catch (e) {
            // 忽略清理系统文件的错误
          }
        }
      }
      
      addLog('info', 'init-backups 目录保留（根目录不删除）', {}, 'system');
    } else {
      addLog('info', 'init-backups 目录不存在，跳过', {}, 'system');
    }
    
    addLog('info', '清空全部备份完成', { deletedCount, deletedDirs }, 'user');
    sendGlobalStatus(`已清空 ${deletedCount} 个备份`, 'success');
    
    return { 
      success: true, 
      deletedCount, 
      deletedDirs,
      message: `已删除 ${deletedCount} 个备份文件和 ${deletedDirs} 个空目录` 
    };
  } catch (e) {
    addLog('error', '清空全部备份失败', { error: e.message }, 'user');
    sendGlobalStatus('清空备份失败', 'error');
    return { success: false, error: e.message };
  }
});

ipcMain.handle('update-backup-note', async (event, backupPath, note) => {
  try {
    // 读取备份文件
    const backupContent = fs.readFileSync(backupPath, 'utf8');
    const backupData = JSON.parse(backupContent);
    
    // 更新备注（保存在 _backup 元数据中）
    if (!backupData._backup) {
      backupData._backup = {};
    }
    backupData._backup.note = note;
    
    // 写回文件
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
    
    addLog('info', '备份备注已更新', { path: backupPath, note }, 'user');
    return { success: true };
  } catch (e) {
    addLog('error', '更新备份备注失败', { error: e.message, path: backupPath }, 'user');
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-openclaw-config-dir', () => {
  // 打开 OpenClaw 配置目录
  shell.openPath(OPENCLAW_CONFIG_DIR);
});

ipcMain.handle('open-path', (event, filePath) => {
  // 打开文件所在目录并选中文件
  shell.showItemInFolder(filePath);
});

ipcMain.handle('open-external', (event, url) => {
  // 在外部浏览器中打开链接
  shell.openExternal(url);
});

ipcMain.handle('get-app-path', () => {
  // 返回应用程序根目录
  return __dirname;
});

ipcMain.handle('open-devtools', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.openDevTools();
  }
});

// 版本号更新
ipcMain.handle('update-version', async (event, newVersion) => {
  try {
    // 使用 __dirname 获取当前文件所在目录，更可靠
    const basePath = path.dirname(__filename);
    console.log('[Version Update] Base path:', basePath);
    
    const filesToUpdate = [
      path.join(basePath, 'index.html'),
      path.join(basePath, 'main.js'),
      path.join(basePath, 'package.json')
    ];

    // 去掉 v 前缀用于 package.json
    const versionNumber = newVersion.replace(/^v/, '');
    console.log('[Version Update] New version:', newVersion, 'Number:', versionNumber);

    for (const filePath of filesToUpdate) {
      console.log('[Version Update] Checking file:', filePath);
      
      if (!fs.existsSync(filePath)) {
        console.warn(`[Version Update] File not found: ${filePath}`);
        continue;
      }

      let content = fs.readFileSync(filePath, 'utf-8');
      const originalContent = content;

      if (filePath.endsWith('index.html')) {
        // 更新 index.html 中的版本号
        // 匹配 <span class="version" ...>v2.2.1</span> (支持带属性的span)
        content = content.replace(/<span class="version"[^>]*>v[\d.]+<\/span>/, `<span class="version" onclick="if(event.shiftKey&&(event.ctrlKey||event.metaKey))openVersionModal()" style="cursor:default;">${newVersion}</span>`);
        // 更新 current-version-display
        content = content.replace(/id="current-version-display"[^>]*>v[\d.]+</, `id="current-version-display" style="font-size: 14px; color: #84cc16; font-weight: 600;">${newVersion}<`);
      } else if (filePath.endsWith('main.js')) {
        // 更新 main.js 中的版本号
        // 匹配 menu 中的版本号
        content = content.replace(/OpenClaw API Switcher v[\d.]+/g, `OpenClaw API Switcher ${newVersion}`);
        // 匹配 version: '3.5.2'
        content = content.replace(/version: '[\d.]+'/g, `version: '${versionNumber}'`);
      } else if (filePath.endsWith('package.json')) {
        // 更新 package.json 中的版本号
        const packageJson = JSON.parse(content);
        packageJson.version = versionNumber;
        content = JSON.stringify(packageJson, null, 2);
      }

      if (content !== originalContent) {
        try {
          fs.writeFileSync(filePath, content, 'utf-8');
          console.log(`[Version Update] Updated: ${filePath}`);
        } catch (writeError) {
          console.error(`[Version Update] Failed to write ${filePath}:`, writeError.message);
          return { success: false, error: `无法写入文件: ${path.basename(filePath)} - ${writeError.message}` };
        }
      } else {
        console.log(`[Version Update] No changes needed for: ${filePath}`);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[Version Update] Error:', error);
    return { success: false, error: error.message };
  }
});

// 发送全局状态栏更新到 renderer
function sendGlobalStatus(message, type = 'info') {
  console.log(`[sendGlobalStatus] 发送状态: ${message}, 类型: ${type}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('global-status', message, type);
  } else {
    console.log('[sendGlobalStatus] 主窗口不可用');
  }
}

ipcMain.handle('get-gateway-status', getGatewayStatus);

ipcMain.handle('restart-gateway', restartGateway);

ipcMain.handle('get-session-info', () => getSessionInfo());

ipcMain.handle('clear-lark-sessions', async () => {
  try {
    const result = clearLarkSessions();
    return result;
  } catch (error) {
    addLog('error', 'IPC 清理飞书会话异常', error.message, 'system');
    return { success: false, deletedCount: 0, message: `清理失败: ${error.message}`, error: error.message };
  }
});

ipcMain.handle('check-updates', async () => {
  addLog('info', '检查更新...', '', 'system');
  // 这里可以实现实际的更新检查逻辑
  // 从 package.json 读取当前版本号
  return { available: false, currentVersion: APP_VERSION, latestVersion: APP_VERSION };
});

// 获取应用版本号
ipcMain.handle('get-app-version', () => {
  return { version: APP_VERSION };
});

ipcMain.handle('run-doctor', runDoctor);

// 清理 OpenClaw 冗余配置
ipcMain.handle('cleanup-openclaw-providers', async () => {
  try {
    const os = require('os');
    const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const BACKUP_DIR = path.join(os.homedir(), '.openclaw', 'backups');
    
    addLog('info', '[cleanup] 开始清理 OpenClaw 冗余配置', { path: OPENCLAW_CONFIG_PATH }, 'system');
    
    // 检查文件是否存在
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      addLog('info', '[cleanup] OpenClaw 配置文件不存在，无需清理', {}, 'system');
      return { success: true, message: 'OpenClaw 配置文件不存在，无需清理', cleaned: false };
    }
    
    // 读取配置
    let config;
    try {
      config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    } catch (e) {
      addLog('error', '[cleanup] 读取配置文件失败', { error: e.message }, 'system');
      return { success: false, message: '读取配置文件失败: ' + e.message, cleaned: false };
    }
    
    // 检查是否有 providers
    if (!config.models?.providers) {
      addLog('info', '[cleanup] 没有需要清理的 providers', {}, 'system');
      return { success: true, message: '没有需要清理的 providers', cleaned: false };
    }
    
    const providerNames = Object.keys(config.models.providers);
    addLog('info', `[cleanup] 发现 ${providerNames.length} 个需要清理的 providers`, { providers: providerNames }, 'system');
    
    // 创建备份
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const backupPath = path.join(BACKUP_DIR, `openclaw.json.backup.${Date.now()}`);
    fs.copyFileSync(OPENCLAW_CONFIG_PATH, backupPath);
    addLog('info', `[cleanup] 已创建备份: ${backupPath}`, {}, 'system');
    
    // 删除 providers
    delete config.models.providers;
    
    // 如果 models 为空对象，保留 mode 字段
    if (config.models && Object.keys(config.models).length === 0) {
      config.models = { mode: 'merge' };
    }
    
    // 保存修改后的配置（按官方顺序）
    try {
      const orderedConfig = {
        wizard: config.wizard,
        auth: config.auth,
        models: config.models,
        agents: config.agents,
        commands: config.commands,
        gateway: config.gateway,
        meta: config.meta
      };
      fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedConfig, null, 2), 'utf8');
      addLog('info', '[cleanup] 清理完成', { cleanedProviders: providerNames }, 'system');
      return { 
        success: true, 
        message: `成功清理 ${providerNames.length} 个冗余 provider 配置`, 
        cleaned: true,
        providers: providerNames,
        backupPath: backupPath
      };
    } catch (e) {
      addLog('error', '[cleanup] 保存配置文件失败', { error: e.message }, 'system');
      return { success: false, message: '保存配置文件失败: ' + e.message, cleaned: false };
    }
  } catch (error) {
    addLog('error', '[cleanup] 清理过程发生错误', { error: error.message }, 'system');
    return { success: false, message: '清理过程发生错误: ' + error.message, cleaned: false };
  }
});

// 检查 Open Claw 配置（只检查不清理）
// 参数: options.silent - 如果为 true，则不记录日志（用于定时检查）
// 参数: options.source - 检测来源，用于日志区分
ipcMain.handle('check-openclaw-config', async (event, options = {}) => {
  try {
    const os = require('os');
    const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const { silent = false, source = 'manual' } = options;
    
    const sourceLabels = {
      'init': '程序启动',
      'delete': '删除Provider',
      'add': '添加Provider',
      'edit': '编辑Provider',
      'backup': '备份操作',
      'restore': '恢复操作',
      'health-check': '健康检查',
      'manual': '手动触发'
    };
    const sourceLabel = sourceLabels[source] || source;

    // 检查文件是否存在
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      return {
        success: true,
        exists: false,
        message: 'OpenClaw 配置文件不存在',
        providers: [],
        totalProviders: 0
      };
    }

    // 读取配置
    let config;
    try {
      config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    } catch (e) {
      if (!silent) {
        addLog('error', '[check] 读取 OpenClaw 配置文件失败', { error: e.message }, 'system');
      }
      return {
        success: false,
        exists: true,
        message: '读取配置文件失败: ' + e.message,
        providers: [],
        totalProviders: 0
      };
    }

    // 检查是否有 providers
    const providers = config.models?.providers || {};
    const providerList = Object.entries(providers).map(([id, data]) => ({
      id,
      name: data.name || id,
      apiKey: data.apiKey ? '已配置' : '未配置',
      models: data.models ? data.models.length : 0
    }));

    // 只在非静默模式且发现 providers 时记录日志
    if (!silent && providerList.length > 0) {
      const providerNames = providerList.map(p => p.name).join(', ');
      addLog('info', `[${sourceLabel}] OpenClaw 有 ${providerList.length} 个冗余配置: ${providerNames}`, { 
        providers: providerList.map(p => p.id)
      }, 'system');
    }

    return {
      success: true,
      exists: true,
      message: providerList.length > 0 ? `发现 ${providerList.length} 个冗余配置` : '无冗余配置',
      providers: providerList,
      totalProviders: providerList.length,
      configPath: OPENCLAW_CONFIG_PATH
    };
  } catch (error) {
    if (!silent) {
      addLog('error', '[check] 检查 OpenClaw 配置失败', { error: error.message }, 'system');
    }
    return {
      success: false,
      exists: false,
      message: '检查过程发生错误: ' + error.message,
      providers: [],
      totalProviders: 0
    };
  }
});

// 检查 OpenClaw 配置文件完整性
ipcMain.handle('check-openclaw-integrity', async () => {
  try {
    const os = require('os');
    const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
    const files = {
      'openclaw.json': path.join(OPENCLAW_DIR, 'openclaw.json'),
      '.env': path.join(OPENCLAW_DIR, '.env'),
      'config.yaml': path.join(OPENCLAW_DIR, 'config.yaml'),
      'auth-profiles.json': path.join(OPENCLAW_DIR, 'agents', 'main', 'agent', 'auth-profiles.json')
    };

    const result = {
      success: true,
      files: {},
      missingFields: [],
      emptyFields: [],  // 初始化空字段数组
      totalFields: 0,
      validFields: 0
    };

    // 检查每个文件
    for (const [name, filePath] of Object.entries(files)) {
      const fileInfo = {
        exists: fs.existsSync(filePath),
        path: filePath,
        isEmpty: false,
        isValidJson: true
      };

      if (fileInfo.exists) {
        const stats = fs.statSync(filePath);
        fileInfo.isEmpty = stats.size === 0;

        // 如果是 JSON 文件，检查格式
        if (name.endsWith('.json') && !fileInfo.isEmpty) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const config = JSON.parse(content);

            // 【v2.7.5】保存解析后的内容供前端使用
            fileInfo.content = config;

            // 【修复】只对 openclaw.json 检查 models 和 models.providers 字段
            if (name === 'openclaw.json') {
              // 检查必要字段
              const requiredFields = ['models', 'models.providers'];
              for (const field of requiredFields) {
                const parts = field.split('.');
                let current = config;
                for (const part of parts) {
                  if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                  } else {
                    result.missingFields.push(field);
                    break;
                  }
                }
              }

              // 检查空字段（字段存在但内容为空）
              if (config.models && typeof config.models === 'object') {
                // 检查 models.providers 是否为空对象
                if (config.models.providers && typeof config.models.providers === 'object') {
                  const providerKeys = Object.keys(config.models.providers);
                  console.log('[check-openclaw-integrity] providers 字段:', providerKeys);
                  if (providerKeys.length === 0) {
                    result.emptyFields.push('models.providers (空对象)');
                    console.log('[check-openclaw-integrity] 检测到空字段: models.providers');
                  }
                } else if (config.models.providers !== undefined) {
                  // providers 存在但不是对象
                  result.emptyFields.push('models.providers (无效类型)');
                  console.log('[check-openclaw-integrity] 检测到无效字段: models.providers');
                }
                // 检查其他可能的空字段
                if (config.models.temperature === '' || config.models.temperature === null) {
                  result.emptyFields.push('models.temperature (空值)');
                }
              }
            }

            // 【修复】只对 openclaw.json 统计字段数
            if (name === 'openclaw.json') {
              // 统计字段数（只统计非空字段）
              result.totalFields = Object.keys(config).length;
              result.validFields = 0;
              if (config.models) {
                const modelKeys = Object.keys(config.models);
                result.totalFields += modelKeys.length;
                // 统计有效的 providers
                if (config.models.providers && typeof config.models.providers === 'object') {
                  const providerCount = Object.keys(config.models.providers).length;
                  result.validFields = providerCount;
                }
              }
            }
          } catch (e) {
            fileInfo.isValidJson = false;
          }
        }
      }

      result.files[name] = fileInfo;
    }

    console.log('[check-openclaw-integrity] 检查结果:', {
      emptyFields: result.emptyFields,
      validFields: result.validFields,
      totalFields: result.totalFields,
      missingFields: result.missingFields
    });

    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// 检查 Gateway Token 状态
ipcMain.handle('check-gateway-token-status', async () => {
  try {
    const { checkGatewayTokenStatus } = require('./api-config');
    const result = checkGatewayTokenStatus();
    return result;
  } catch (error) {
    console.error('[check-gateway-token-status] 检查失败:', error);
    return {
      exists: false,
      valid: false,
      status: 'error',
      message: `检查失败: ${error.message}`,
      needsReinstall: false
    };
  }
});

// 检查 OpenClaw API 密钥有效性
ipcMain.handle('check-openclaw-apikeys', async () => {
  try {
    const os = require('os');
    const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const AUTH_PROFILES_PATH = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
    
    const result = {
      success: true,
      providers: [],
      summary: {
        total: 0,
        valid: 0,
        placeholder: 0,
        missing: 0
      }
    };
    
    // 读取 openclaw.json 获取供应商列表
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      return { success: false, error: 'openclaw.json 不存在' };
    }
    
    let openclawConfig;
    try {
      openclawConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    } catch (e) {
      return { success: false, error: 'openclaw.json 格式错误: ' + e.message };
    }
    
    // 安全获取 providers，处理各种缺失情况
    let providers = {};
    if (openclawConfig && typeof openclawConfig === 'object') {
      if (openclawConfig.models && typeof openclawConfig.models === 'object') {
        providers = openclawConfig.models.providers || {};
      }
    }
    
    // 读取 auth-profiles.json 获取真实 API Key
    let authProfiles = {};
    console.log('[check-openclaw-apikeys] 检查 auth-profiles.json:', AUTH_PROFILES_PATH);
    console.log('[check-openclaw-apikeys] 文件是否存在:', fs.existsSync(AUTH_PROFILES_PATH));
    if (fs.existsSync(AUTH_PROFILES_PATH)) {
      try {
        const authData = JSON.parse(fs.readFileSync(AUTH_PROFILES_PATH, 'utf8'));
        authProfiles = authData.profiles || {};
        console.log('[check-openclaw-apikeys] 读取到的 profiles:', Object.keys(authProfiles));
      } catch (e) {
        console.warn('[check-openclaw-apikeys] 读取 auth-profiles.json 失败:', e.message);
      }
    }
    
    // 检查每个供应商的 API Key 状态
    for (const [providerId, providerConfig] of Object.entries(providers)) {
      // 安全获取 provider 名称
      let providerName = providerId;
      if (providerConfig && typeof providerConfig === 'object') {
        providerName = providerConfig.name || providerId;
      }
      
      const profileKey = `${providerId}:default`;
      const authProfile = authProfiles[profileKey];
      
      // 【调试日志】
      console.log(`[check-openclaw-apikeys] 检查供应商 ${providerId}:`, {
        profileKey,
        authProfileExists: !!authProfile,
        authProfileKeys: authProfile ? Object.keys(authProfile) : null,
        hasKey: authProfile ? !!authProfile.key : false,
        keyValue: authProfile?.key ? authProfile.key.substring(0, 10) + '...' : null
      });
      
      let status = 'missing';
      let apiKey = null;
      
      if (authProfile && authProfile.key) {
        apiKey = authProfile.key;
        // 【修复】处理加密的密钥（enc: 前缀）
        if (apiKey.startsWith('enc:')) {
          // 加密的密钥视为有效（需要解密后才能验证真实内容）
          status = 'valid';
        } else if (apiKey === 'e' || apiKey.length < 10) {
          status = 'placeholder';
        } else {
          status = 'valid';
        }
      }
      
      console.log(`[check-openclaw-apikeys] 供应商 ${providerId} 状态:`, status);
      
      result.providers.push({
        id: providerId,
        name: providerName,
        status: status,
        apiKey: apiKey ? (apiKey.substring(0, 10) + '...') : null
      });
      
      result.summary.total++;
      if (status === 'valid') result.summary.valid++;
      else if (status === 'placeholder') result.summary.placeholder++;
      else result.summary.missing++;
    }
    
    return result;
  } catch (error) {
    console.error('[check-openclaw-apikeys] 检查失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 清理指定的 OpenClaw providers
ipcMain.handle('cleanup-openclaw-providers-selective', async (event, providerIds) => {
  try {
    const os = require('os');
    const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const BACKUP_DIR = path.join(os.homedir(), '.openclaw', 'backups');
    
    addLog('info', '[cleanup-selective] 开始选择性清理', { providerIds }, 'system');
    
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      return { success: false, message: 'OpenClaw 配置文件不存在', cleaned: false };
    }
    
    // 读取配置
    let config;
    try {
      config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    } catch (e) {
      return { success: false, message: '读取配置文件失败: ' + e.message, cleaned: false };
    }
    
    if (!config.models?.providers) {
      return { success: true, message: '没有需要清理的 providers', cleaned: false };
    }
    
    // 创建备份
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const backupPath = path.join(BACKUP_DIR, `openclaw.json.backup.${Date.now()}`);
    fs.copyFileSync(OPENCLAW_CONFIG_PATH, backupPath);
    addLog('info', `[cleanup-selective] 已创建备份: ${backupPath}`, {}, 'system');
    
    // 删除指定的 providers
    const deletedProviders = [];
    for (const providerId of providerIds) {
      if (config.models.providers[providerId]) {
        deletedProviders.push(providerId);
        delete config.models.providers[providerId];
        addLog('info', `[cleanup-selective] 已删除 provider: ${providerId}`, {}, 'system');
      }
    }
    
    // 如果 models 为空对象，保留 mode 字段
    if (config.models && Object.keys(config.models.providers || {}).length === 0) {
      delete config.models.providers;
      if (Object.keys(config.models).length === 0) {
        config.models = { mode: 'merge' };
      }
    }
    
    // 保存修改后的配置（按官方顺序）
    try {
      const orderedConfig = {
        wizard: config.wizard,
        auth: config.auth,
        models: config.models,
        agents: config.agents,
        commands: config.commands,
        gateway: config.gateway,
        meta: config.meta
      };
      fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedConfig, null, 2), 'utf8');
      addLog('info', '[cleanup-selective] 清理完成', { deletedProviders }, 'system');
      return { 
        success: true, 
        message: `成功清理 ${deletedProviders.length} 个 provider 配置`, 
        cleaned: true,
        providers: deletedProviders,
        backupPath: backupPath
      };
    } catch (e) {
      addLog('error', '[cleanup-selective] 保存配置文件失败', { error: e.message }, 'system');
      return { success: false, message: '保存配置文件失败: ' + e.message, cleaned: false };
    }
  } catch (error) {
    addLog('error', '[cleanup-selective] 清理过程发生错误', { error: error.message }, 'system');
    return { success: false, message: '清理过程发生错误: ' + error.message, cleaned: false };
  }
});

// 迁移 OpenClaw 配置到程序配置
ipcMain.handle('migrate-openclaw-config', async () => {
  try {
    const os = require('os');
    const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const MODELS_JSON_PATH = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'models.json');
    const AUTH_PROFILES_PATH = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
    
    addLog('info', '[migrate] 开始迁移 OpenClaw 配置', { 
      openclaw: OPENCLAW_CONFIG_PATH,
      models: MODELS_JSON_PATH,
      auth: AUTH_PROFILES_PATH
    }, 'system');
    
    // 检查主配置文件是否存在
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      return { success: false, message: 'OpenClaw 配置文件不存在', migrated: false };
    }
    
    // 读取 OpenClaw 主配置 (openclaw.json)
    let openclawConfig;
    try {
      openclawConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    } catch (e) {
      addLog('error', '[migrate] 读取 openclaw.json 失败', { error: e.message }, 'system');
      return { success: false, message: '读取配置文件失败: ' + e.message, migrated: false };
    }
    
    // 读取 models.json（补充模型配置）
    let modelsConfig = {};
    if (fs.existsSync(MODELS_JSON_PATH)) {
      try {
        modelsConfig = JSON.parse(fs.readFileSync(MODELS_JSON_PATH, 'utf8'));
        addLog('info', '[migrate] 成功读取 models.json', {}, 'system');
      } catch (e) {
        addLog('warn', '[migrate] 读取 models.json 失败，将使用 openclaw.json 中的模型配置', { error: e.message }, 'system');
      }
    }
    
    // 读取 auth-profiles.json（获取真实 API Key）
    let authProfiles = {};
    if (fs.existsSync(AUTH_PROFILES_PATH)) {
      try {
        authProfiles = JSON.parse(fs.readFileSync(AUTH_PROFILES_PATH, 'utf8'));
        addLog('info', '[migrate] 成功读取 auth-profiles.json', {}, 'system');
      } catch (e) {
        addLog('warn', '[migrate] 读取 auth-profiles.json 失败，将使用 openclaw.json 中的 API Key', { error: e.message }, 'system');
      }
    }
    
    // 检查是否有 providers
    if (!openclawConfig.models?.providers || Object.keys(openclawConfig.models.providers).length === 0) {
      return { success: true, message: '没有可迁移的配置', migrated: false };
    }
    
    // 加载当前程序配置
    const apiConfig = require('./api-config');
    const currentConfig = apiConfig.loadApiConfig();
    
    // 确保配置结构完整
    if (!currentConfig.providers) currentConfig.providers = {};
    if (!currentConfig.providerOrder) currentConfig.providerOrder = [];  // ◄── 新增：确保 providerOrder 存在
    
    const migratedProviders = [];
    const skippedProviders = [];
    
    // 遍历 OpenClaw 中的 providers
    for (const [providerId, providerData] of Object.entries(openclawConfig.models.providers)) {
      // 检查是否已存在于程序配置中
      if (currentConfig.providers[providerId]) {
        skippedProviders.push(providerId);
        addLog('info', `[migrate] 跳过已存在的 provider: ${providerId}`, {}, 'system');
        continue;
      }
      
      // 从 auth-profiles.json 获取真实 API Key
      let realApiKey = providerData.apiKey || '';
      if (authProfiles[providerId]?.apiKey && authProfiles[providerId].apiKey !== 'e') {
        realApiKey = authProfiles[providerId].apiKey;
        addLog('info', `[migrate] 从 auth-profiles.json 获取 ${providerId} 的真实 API Key`, {}, 'system');
      }
      
      // 从 models.json 获取完整的模型配置
      let mergedModels = providerData.models || [];
      if (modelsConfig[providerId]?.models && modelsConfig[providerId].models.length > 0) {
        // 合并模型配置，优先使用 models.json 的数据
        const modelsFromJson = modelsConfig[providerId].models;
        mergedModels = modelsFromJson.map(m => ({
          id: m.id,
          name: m.name || m.id,
          contextWindow: m.contextWindow || 32000
        }));
        addLog('info', `[migrate] 从 models.json 获取 ${providerId} 的模型配置 (${mergedModels.length} 个模型)`, {}, 'system');
      }
      
      // 查找预定义供应商
      const predefined = apiConfig.findPredefinedProviderCaseInsensitive(providerId);
      
      if (predefined) {
        // 使用预定义配置 + OpenClaw 数据
        currentConfig.providers[predefined.id] = {
          ...predefined.config,
          id: predefined.id,
          apiKey: realApiKey,
          models: mergedModels.length > 0 ? mergedModels : predefined.config.models
        };
        migratedProviders.push(predefined.id);
        addLog('info', `[migrate] 已迁移预定义 provider: ${predefined.id}`, {}, 'system');
      } else {
        // 自定义供应商
        currentConfig.providers[providerId] = {
          id: providerId,
          name: providerData.name || providerId,
          baseUrl: providerData.baseUrl || '',
          apiKey: realApiKey,
          apiType: 'openai',
          models: mergedModels
        };
        migratedProviders.push(providerId);
        addLog('info', `[migrate] 已迁移自定义 provider: ${providerId}`, {}, 'system');
      }
    }
    
    // 更新 providerOrder - 将新迁移的供应商添加到顺序列表
    for (const providerId of migratedProviders) {
      if (!currentConfig.providerOrder.includes(providerId)) {
        currentConfig.providerOrder.push(providerId);
        addLog('info', `[migrate] 添加供应商到顺序列表: ${providerId}`, {}, 'system');
      }
    }
    
    // 设置 selectedModel - 默认选中第一个迁移的供应商的第一个模型
    if (migratedProviders.length > 0 && !currentConfig.selectedModel) {
      const firstProviderId = migratedProviders[0];
      const firstProvider = currentConfig.providers[firstProviderId];
      if (firstProvider && firstProvider.models && firstProvider.models.length > 0) {
        currentConfig.selectedModel = `${firstProviderId}/${firstProvider.models[0].id}`;
        addLog('info', `[migrate] 设置默认选中模型: ${currentConfig.selectedModel}`, {}, 'system');
      }
    }
    
    // 更新最后修改时间
    currentConfig.lastUpdated = Date.now();
    
    // 保存配置
    apiConfig.saveApiConfig(currentConfig);
    
    addLog('info', `[migrate] 迁移完成`, { migrated: migratedProviders, skipped: skippedProviders }, 'system');
    
    return {
      success: true,
      message: `成功迁移 ${migratedProviders.length} 个配置${skippedProviders.length > 0 ? `，跳过 ${skippedProviders.length} 个已存在配置` : ''}`,
      migrated: true,
      providers: migratedProviders,
      skipped: skippedProviders,
      selectedModel: currentConfig.selectedModel
    };
  } catch (error) {
    addLog('error', '[migrate] 迁移过程发生错误', { error: error.message }, 'system');
    return { success: false, message: '迁移过程发生错误: ' + error.message, migrated: false };
  }
});

// 扫描 OpenClaw 配置用于迁移向导
ipcMain.handle('scan-openclaw-for-migration', async () => {
  try {
    const os = require('os');
    const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const MODELS_JSON_PATH = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'models.json');
    const AUTH_PROFILES_PATH = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
    
    addLog('info', '[scan-migration] 开始扫描 OpenClaw 配置', {}, 'system');
    
    // 检查主配置文件
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      return { success: false, message: 'OpenClaw 配置文件不存在', providers: [] };
    }
    
    // 读取 openclaw.json
    let openclawConfig;
    try {
      openclawConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    } catch (e) {
      return { success: false, message: '读取配置文件失败: ' + e.message, providers: [] };
    }
    
    // 读取 models.json
    let modelsConfig = {};
    if (fs.existsSync(MODELS_JSON_PATH)) {
      try {
        modelsConfig = JSON.parse(fs.readFileSync(MODELS_JSON_PATH, 'utf8'));
      } catch (e) {
        addLog('warn', '[scan-migration] 读取 models.json 失败', { error: e.message }, 'system');
      }
    }
    
    // 读取 auth-profiles.json
    let authProfiles = {};
    if (fs.existsSync(AUTH_PROFILES_PATH)) {
      try {
        authProfiles = JSON.parse(fs.readFileSync(AUTH_PROFILES_PATH, 'utf8'));
      } catch (e) {
        addLog('warn', '[scan-migration] 读取 auth-profiles.json 失败', { error: e.message }, 'system');
      }
    }
    
    // 检查 providers
    const providers = openclawConfig.models?.providers || {};
    if (Object.keys(providers).length === 0) {
      return { success: true, message: '没有可迁移的配置', providers: [] };
    }
    
    // 加载 api-config 模块获取预定义供应商
    const apiConfig = require('./api-config');
    
    // 构建供应商列表
    const providerList = [];
    const providerConfigs = {};
    
    for (const [providerId, providerData] of Object.entries(providers)) {
      // 获取真实 API Key
      let apiKey = '';
      
      // 从 auth-profiles.json 中读取真实 API Key
      // auth-profiles 结构: { version: 1, profiles: { "provider:default": { key: "xxx" } }, lastGood: {} }
      const profileKey = `${providerId}:default`;
      const authProfile = authProfiles?.profiles?.[profileKey];
      
      addLog('debug', `[scan-migration] 检查 ${providerId} 的 auth profile:`, { 
        profileKey, 
        hasProfile: !!authProfile,
        profileKeys: authProfile ? Object.keys(authProfile) : null,
        authProfilesKeys: authProfiles?.profiles ? Object.keys(authProfiles.profiles) : null
      }, 'system');
      
      if (authProfile?.key && authProfile.key !== 'e') {
        apiKey = authProfile.key;
        addLog('info', `[scan-migration] 从 auth-profiles 读取到 ${providerId} 的 API Key`, {}, 'system');
      } else if (authProfile?.key === 'e') {
        addLog('warn', `[scan-migration] ${providerId} 的 API Key 在 auth-profiles 中是占位符 'e'`, {}, 'system');
      } else if (!authProfile) {
        addLog('warn', `[scan-migration] ${providerId} 在 auth-profiles 中找不到 profile: ${profileKey}`, {}, 'system');
      } else {
        addLog('warn', `[scan-migration] ${providerId} 的 auth profile 没有 key 字段`, { authProfile }, 'system');
      }
      
      // 如果 auth-profiles 中没有，尝试从 openclaw.json 的 providerData 中读取
      if (!apiKey || apiKey === 'e') {
        // 尝试从 providerData 中读取（可能是旧格式）
        if (providerData.apiKey && providerData.apiKey !== 'e') {
          apiKey = providerData.apiKey;
          addLog('info', `[scan-migration] 从 openclaw.json 读取到 ${providerId} 的 API Key`, {}, 'system');
        } else if (providerData.apiKey === 'e') {
          addLog('warn', `[scan-migration] ${providerId} 在 openclaw.json 中的 API Key 是占位符 'e'`, {}, 'system');
        }
      }
      
      // 获取模型配置
      let models = providerData.models || [];
      if (modelsConfig[providerId]?.models && modelsConfig[providerId].models.length > 0) {
        models = modelsConfig[providerId].models.map(m => ({
          id: m.id,
          name: m.name || m.id,
          contextWindow: m.contextWindow || 32000
        }));
      }
      
      // 查找预定义供应商信息
      const predefined = apiConfig.findPredefinedProviderCaseInsensitive(providerId);
      
      providerList.push(providerId);
      providerConfigs[providerId] = {
        id: providerId,
        name: predefined?.config?.name || providerData.name || providerId,
        icon: predefined?.config?.icon || '📦',
        baseUrl: predefined?.config?.baseUrl || providerData.baseUrl || '',
        apiKey: apiKey,
        apiType: predefined?.config?.apiType || 'openai',
        models: models
      };
    }
    
    addLog('info', `[scan-migration] 扫描完成，发现 ${providerList.length} 个供应商`, {}, 'system');
    
    return {
      success: true,
      message: `发现 ${providerList.length} 个可迁移的供应商`,
      providers: providerList,
      configs: providerConfigs
    };
  } catch (error) {
    addLog('error', '[scan-migration] 扫描失败', { error: error.message }, 'system');
    return { success: false, message: '扫描失败: ' + error.message, providers: [] };
  }
});

// 保存迁移的配置
ipcMain.handle('save-migrated-config', async (event, data) => {
  try {
    const { providers, providerOrder, selectedModel } = data;
    
    addLog('info', '[save-migration] 开始保存迁移的配置', { 
      providerCount: Object.keys(providers).length,
      selectedModel 
    }, 'system');
    
    // 加载当前配置
    const apiConfig = require('./api-config');
    const currentConfig = apiConfig.loadApiConfig();
    
    // 确保配置结构完整
    if (!currentConfig.providers) currentConfig.providers = {};
    if (!currentConfig.providerOrder) currentConfig.providerOrder = [];  // ◄── 新增：确保 providerOrder 存在
    
    // 合并 providers（加密 API Key）
    for (const [providerId, providerData] of Object.entries(providers)) {
      // 加密 API Key（如果不是密文格式）
      if (providerData.apiKey && typeof providerData.apiKey === 'string' && !providerData.apiKey.startsWith('enc:')) {
        providerData.apiKey = apiConfig.encryptApiKey(providerData.apiKey);
      }
      currentConfig.providers[providerId] = providerData;
    }
    
    // 更新 providerOrder
    for (const providerId of providerOrder) {
      if (!currentConfig.providerOrder.includes(providerId)) {
        currentConfig.providerOrder.push(providerId);
      }
    }
    
    // 设置 selectedModel
    if (selectedModel) {
      currentConfig.selectedModel = selectedModel;
    }
    
    // 更新时间戳
    currentConfig.lastUpdated = Date.now();
    
    // 保存配置
    apiConfig.saveApiConfig(currentConfig);
    
    addLog('info', '[save-migration] 配置保存成功', {}, 'system');
    
    return {
      success: true,
      message: '配置保存成功',
      savedProviders: Object.keys(providers)
    };
  } catch (error) {
    addLog('error', '[save-migration] 保存失败', { error: error.message }, 'system');
    return { success: false, message: '保存失败: ' + error.message };
  }
});

// 测试供应商连接
ipcMain.handle('test-provider-connection', async (event, data) => {
  try {
    const { providerId, baseUrl, apiKey, model } = data;
    
    addLog('info', `[test-connection] 测试 ${providerId} 连接`, {}, 'system');
    
    if (!apiKey || apiKey === 'e') {
      return { success: false, error: 'API Key 未配置' };
    }
    
    // 简单的连接测试 - 发送一个最小的请求
    const https = require('https');
    const http = require('http');
    const url = new URL(baseUrl + '/chat/completions');
    
    const postData = JSON.stringify({
      model: model || 'default',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 1
    });
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    };
    
    return new Promise((resolve) => {
      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ success: true });
          } else if (res.statusCode === 401) {
            resolve({ success: false, error: 'API Key 无效' });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}` });
          }
        });
      });
      
      req.on('error', (error) => {
        resolve({ success: false, error: '连接失败: ' + error.message });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: '连接超时' });
      });
      
      req.write(postData);
      req.end();
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('run-gateway-command', async (event, cmd) => {
  return new Promise((resolve) => {
    // 解析用户输入的命令
    const parts = cmd.split(' ').filter(arg => arg.trim() !== '');
    let openclawCmd = 'openclaw';
    let args = parts;
    
    // 如果用户输入了 openclaw 前缀，提取实际的 openclaw 命令和参数
    if (parts[0] && parts[0].toLowerCase() === 'openclaw') {
      openclawCmd = parts[0];
      args = parts.slice(1);
    }
    
    const cmdInfo = getOpenClawCommand();
    let command;
    let spawnArgs;
    let useShell = isWin;
    
    if (cmdInfo.type === 'wsl') {
      // WSL 模式: wsl openclaw <args>
      command = 'wsl';
      spawnArgs = [openclawCmd, ...args];
      useShell = false;
      addLog('info', `[Debug] 执行 WSL 命令: wsl ${openclawCmd} ${args.join(' ')}`, '', 'system');
    } else {
      // Windows 本地或 Unix
      command = typeof cmdInfo.path === 'string' ? cmdInfo.path : openclawCmd;
      spawnArgs = args;
      addLog('info', `[Debug] 执行命令: ${command} ${args.join(' ')}`, '', 'system');
    }

    const proc = spawn(command, spawnArgs, {
      windowsHide: true,
      shell: useShell,
      timeout: 30000,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
    });

    let output = '';
    let errorOutput = '';
    let timeoutId;

    // 设置超时
    timeoutId = setTimeout(() => {
      // 【多平台修复】Windows 不支持 SIGTERM，使用 kill()
      if (isWin) {
        proc.kill();
      } else {
        proc.kill('SIGTERM');
      }
      resolve({ success: false, error: '命令执行超时（30秒）\n可能原因：\n1. Gateway 未启动\n2. 命令需要交互式输入\n3. 网络连接问题' });
    }, 30000);

    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const fullOutput = output + (errorOutput ? '\n[stderr] ' + errorOutput : '');
      resolve({ success: code === 0, output: fullOutput || '命令执行完成（无输出）' });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({ success: false, error: `执行失败: ${err.message}` });
    });
  });
});

// 执行系统命令（如 npm）
ipcMain.handle('run-system-command', async (event, cmd) => {
  return new Promise((resolve) => {
    const args = cmd.split(' ').filter(arg => arg.trim() !== '');
    const command = args.shift(); // 第一个参数是命令

    addLog('info', `[Debug] 执行系统命令: ${command} ${args.join(' ')}`, '', 'system');

    const proc = spawn(command, args, {
      windowsHide: true,
      shell: true, // 使用 shell 执行 npm 等系统命令
      timeout: 300000, // npm 安装可能需要较长时间
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
    });

    let output = '';
    let errorOutput = '';
    let timeoutId;

    // 设置超时（5分钟）
    timeoutId = setTimeout(() => {
      // 【多平台修复】Windows 不支持 SIGTERM，使用 kill()
      if (isWin) {
        proc.kill();
      } else {
        proc.kill('SIGTERM');
      }
      resolve({ success: false, error: '命令执行超时（5分钟）\n可能原因：\n1. 网络连接问题\n2. npm 安装卡住' });
    }, 300000);

    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const fullOutput = output + (errorOutput ? '\n[stderr] ' + errorOutput : '');
      resolve({ success: code === 0, output: fullOutput || '命令执行完成（无输出）' });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({ success: false, error: `执行失败: ${err.message}` });
    });
  });
});

// 使用脚本一键启动 Gateway（跨平台）
ipcMain.handle('start-gateway-script', async () => {
  try {
    addLog('info', '[Gateway] 使用脚本一键启动 Gateway...', '', 'system');
    
    const path = require('path');
    const scriptPath = path.join(__dirname, 'scripts', 'start-gateway.js');
    
    // 使用 Node.js 执行脚本
    const proc = spawn('node', [scriptPath], {
      windowsHide: false,
      shell: false,
      detached: true,
      stdio: 'ignore'
    });
    
    proc.on('error', (err) => {
      addLog('error', `[Gateway] 脚本启动失败: ${err.message}`, '', 'system');
    });
    
    // 立即返回成功（脚本会打开终端）
    addLog('success', '[Gateway] 脚本已执行，正在打开终端...', '', 'system');
    return { 
      success: true, 
      message: '终端已打开，Gateway 正在启动中...' 
    };
    
  } catch (e) {
    addLog('error', `[Gateway] 脚本执行异常: ${e.message}`, '', 'system');
    return { 
      success: false, 
      error: e.message 
    };
  }
});

ipcMain.handle('get-last-model', () => lastModel);

// API 配置管理
const apiConfig = require('./api-config');

ipcMain.handle('get-predefined-providers', () => {
  return apiConfig.getPredefinedProviders();
});

ipcMain.handle('load-api-config', () => {
  return apiConfig.loadApiConfig();
});

// 【v2.7.5】加载 auth-profiles.json 供配置检查使用
ipcMain.handle('load-auth-profiles', () => {
  return loadAuthProfiles();
});

ipcMain.handle('save-api-config', (event, config) => {
  return apiConfig.saveApiConfig(config);
});

ipcMain.handle('update-provider-config', (event, providerId, config) => {
  return apiConfig.updateProviderConfig(providerId, config);
});

ipcMain.handle('remove-provider-config', (event, providerId) => {
  console.log('[IPC] remove-provider-config called with:', providerId);
  const result = apiConfig.removeProviderConfig(providerId);
  console.log('[IPC] remove-provider-config result:', result);
  return result;
});

ipcMain.handle('set-active-provider', (event, providerId) => {
  return apiConfig.setActiveProvider(providerId);
});

ipcMain.handle('get-active-provider', () => {
  return apiConfig.getActiveProvider();
});

ipcMain.handle('sync-to-openclaw', async (event, providerId, config, force) => {
  return await apiConfig.syncToOpenClaw(providerId, config, force);
});

ipcMain.handle('test-api-connection', async (event, providerId, config) => {
  const result = await apiConfig.testApiConnection(providerId, config);

  // 追踪请求
  if (result.requestInfo) {
    // 解析响应数据
    let parsedResponseData = null;
    if (result.requestInfo.responseData) {
      try {
        parsedResponseData = JSON.parse(result.requestInfo.responseData);
      } catch (e) {
        // 不是 JSON，保存原始文本（限制长度）
        parsedResponseData = result.requestInfo.responseData.substring(0, 1000);
        if (result.requestInfo.responseData.length > 1000) {
          parsedResponseData += '... (truncated)';
        }
      }
    }

    // 如果暂停了请求追踪，直接返回（用于 Gateway 健康检测期间）
    if (pauseRequestTracking) {
      return result;
    }

    const entry = {
      id: 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      url: result.requestInfo.url,
      method: result.requestInfo.method,
      duration: result.requestInfo.latency,
      status: result.requestInfo.statusCode,
      success: result.success,
      error: result.requestInfo.error || null,
      responseData: parsedResponseData,
      responseSize: result.requestInfo.responseSize
    };
    requestHistory.unshift(entry);
    if (requestHistory.length > 50) requestHistory = requestHistory.slice(0, 50);

    console.log('[Main] 请求已追踪:', entry.url, '状态:', entry.status, '数据大小:', entry.responseSize);

    // 通知渲染进程
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('request-tracked', entry);
    }
  }

  return result;
});

// 自动检测本地模型列表
ipcMain.handle('detect-local-models', async (event, baseUrl, apiKey) => {
  return await apiConfig.detectLocalModels(baseUrl, apiKey);
});

// 启动系统终端 - 简化版，仅打开新窗口
ipcMain.handle('open-system-terminal', async () => {
  try {
    addLog('info', `[Terminal] 正在启动系统终端 [${process.platform}]`, '', 'system');
    
    if (isWin) {
      // Windows: 优先使用 WSL（OpenClaw 推荐），其次 PowerShell，最后 CMD
      const { execSync, exec } = require('child_process');
      
      // 检查 WSL 是否可用
      try {
        execSync('wsl --version', { windowsHide: true, timeout: 3000 });
        exec('start wsl', { windowsHide: false });
        addLog('success', '[Terminal] 已启动 WSL (推荐用于 OpenClaw)', '', 'system');
        return { success: true, terminal: 'WSL', command: 'start wsl' };
      } catch (e) {
        // WSL 不可用，尝试 PowerShell
        try {
          exec('start powershell', { windowsHide: false });
          addLog('success', '[Terminal] 已启动 PowerShell', '', 'system');
          return { success: true, terminal: 'PowerShell', command: 'start powershell' };
        } catch (e2) {
          // 使用 CMD
          exec('start cmd', { windowsHide: false });
          addLog('success', '[Terminal] 已启动 CMD', '', 'system');
          return { success: true, terminal: 'CMD', command: 'start cmd' };
        }
      }
    } else if (isMac) {
      // macOS: 使用 osascript 在当前 Terminal 窗口打开新标签页，避免创建 Dock 图标
      const { exec } = require('child_process');
      try {
        // 尝试在当前 Terminal 窗口打开新标签页
        exec(`osascript -e 'tell application "Terminal" to activate' -e 'tell application "System Events" to keystroke "t" using command down'`, { timeout: 5000 });
        addLog('success', '[Terminal] 已在 Terminal 中打开新标签页', '', 'system');
        return { success: true, terminal: 'Terminal', command: 'osascript (new tab)' };
      } catch (e) {
        // 如果失败，使用传统方式打开
        exec('open -na Terminal', { timeout: 5000 });
        addLog('success', '[Terminal] 已启动 Terminal', '', 'system');
        return { success: true, terminal: 'Terminal', command: 'open -na Terminal' };
      }
    } else {
      // Linux: 尝试常见终端
      const { exec } = require('child_process');
      const terminals = [
        'gnome-terminal',
        'konsole',
        'xfce4-terminal',
        'lxterminal',
        'mate-terminal',
        'terminator',
        'alacritty',
        'kitty',
        'xterm'
      ];
      
      for (const term of terminals) {
        try {
          exec(`which ${term} && ${term}`, { timeout: 3000 });
          addLog('success', `[Terminal] 已启动 ${term}`, '', 'system');
          return { success: true, terminal: term, command: term };
        } catch (e) {
          continue;
        }
      }
      
      return { success: false, error: '未找到可用的终端模拟器' };
    }
  } catch (e) {
    addLog('error', `[Terminal] 启动异常: ${e.message}`, '', 'system');
    return { success: false, error: e.message };
  }
});

// 在系统终端中启动并运行指定命令（用于交互式命令）
ipcMain.handle('open-system-terminal-with-command', async (event, command) => {
  try {
    addLog('info', `[Terminal] 正在启动终端并运行命令: ${command} [${process.platform}]`, '', 'system');
    const { exec, execSync } = require('child_process');

    if (isWin) {
      // Windows: 使用 PowerShell 或 CMD 运行命令
      // 【v2.7.5】转义命令中的双引号，防止破坏命令结构
      const escapedCommand = command.replace(/"/g, '\"');
      try {
        // 尝试使用 PowerShell
        const psCommand = `start powershell -NoExit -Command "${escapedCommand}; Write-Host '命令执行完成，按 Enter 键继续...'; Read-Host"`;
        exec(psCommand, { windowsHide: false });
        addLog('success', `[Terminal] 已在 PowerShell 中启动命令: ${command}`, '', 'system');
        return { success: true, terminal: 'PowerShell', command: psCommand };
      } catch (e) {
        // 使用 CMD
        const cmdCommand = `start cmd /k "${escapedCommand} && echo 命令执行完成，按任意键继续... && pause"`;
        exec(cmdCommand, { windowsHide: false });
        addLog('success', `[Terminal] 已在 CMD 中启动命令: ${command}`, '', 'system');
        return { success: true, terminal: 'CMD', command: cmdCommand };
      }
    } else if (isMac) {
      // macOS: 使用 osascript 在 Terminal 中运行命令
      // 【v2.7.5】修复引号转义问题，使用双引号包裹整个脚本
      const escapedCommand = command.replace(/"/g, '\\"');
      const script = `tell application "Terminal" to do script "${escapedCommand}"`;
      exec(`osascript -e "${script}"`, { timeout: 5000 });
      // 激活 Terminal
      exec(`osascript -e 'tell application "Terminal" to activate'`, { timeout: 2000 });
      addLog('success', `[Terminal] 已在 Terminal 中启动命令: ${command}`, '', 'system');
      return { success: true, terminal: 'Terminal', command: script };
    } else {
      // Linux: 尝试在常见终端中运行命令
      // 【v2.7.5】转义命令中的单引号，防止破坏 bash -c 结构
      const escapedCommand = command.replace(/'/g, "'\"'\"'");
      const terminals = [
        { cmd: 'gnome-terminal', args: `-- bash -c '${escapedCommand}; echo "命令执行完成，按 Enter 键继续..."; read'` },
        { cmd: 'konsole', args: `-e bash -c '${escapedCommand}; echo "命令执行完成，按 Enter 键继续..."; read'` },
        { cmd: 'xfce4-terminal', args: `-e "bash -c '${escapedCommand}; echo 命令执行完成，按 Enter 键继续...; read'"` },
        { cmd: 'xterm', args: `-e bash -c '${escapedCommand}; echo "命令执行完成，按 Enter 键继续..."; read'` }
      ];

      for (const term of terminals) {
        try {
          execSync(`which ${term.cmd}`, { timeout: 2000 });
          exec(`${term.cmd} ${term.args}`, { timeout: 3000 });
          addLog('success', `[Terminal] 已在 ${term.cmd} 中启动命令: ${command}`, '', 'system');
          return { success: true, terminal: term.cmd, command: `${term.cmd} ${term.args}` };
        } catch (e) {
          continue;
        }
      }

      return { success: false, error: '未找到可用的终端模拟器' };
    }
  } catch (e) {
    addLog('error', `[Terminal] 启动命令异常: ${e.message}`, '', 'system');
    return { success: false, error: e.message };
  }
});

// 实时日志推送
ipcMain.on('track-request', (event, data) => {
  // 如果暂停了请求追踪，直接返回（用于 Gateway 健康检测期间）
  if (pauseRequestTracking) {
    return;
  }
  
  const entry = {
    id: data.id || 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    url: data.url || 'Unknown URL',
    method: data.method || 'GET',
    duration: data.duration || 0,
    status: data.status,
    success: data.success,
    error: data.error
  };
  requestHistory.unshift(entry);
  if (requestHistory.length > 50) requestHistory = requestHistory.slice(0, 50);
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('request-tracked', entry);
  }
});

// 检查 openclaw 是否安装
async function checkOpenClawInstalled() {
  try {
    // 如果已有配置，直接验证配置是否有效
    if (customOpenClawRoot) {
      addLog('info', `[OpenClaw] 使用已配置的根目录: ${customOpenClawRoot}`, '', 'system');
      // 验证配置的路径是否仍然有效
      const exeInfo = getOpenClawExecutableFromRoot({ type: 'custom', root: customOpenClawRoot });
      if (exeInfo.path !== 'openclaw' && exeInfo.path !== 'openclaw.cmd') {
        // 有可执行文件路径，认为配置有效
        return true;
      }
      // 配置可能失效，继续扫描
      addLog('warning', `[OpenClaw] 配置的路径可能已失效，尝试重新扫描`, '', 'system');
    }
    
    // 尝试扫描
    const scanned = scanOpenClawRoot();
    if (scanned) {
      addLog('info', `[OpenClaw] 检测到已安装: ${scanned.root}`, '', 'system');
      // 使用扫描结果（仅当没有配置时）
      if (!customOpenClawRoot) {
        customOpenClawRoot = scanned.root;
      }
      return true;
    }
    
    // 尝试执行命令验证
    const cmdInfo = getOpenClawCommand();
    const { execSync } = require('child_process');
    
    if (cmdInfo.type === 'wsl') {
      execSync('wsl openclaw --version', { timeout: 5000 });
    } else if (cmdInfo.type === 'win32') {
      execSync('openclaw --version', { timeout: 5000, windowsHide: true });
    } else {
      execSync('openclaw --version', { timeout: 5000 });
    }
    return true;
  } catch (e) {
    return false;
  }
}

// ==================== 紧急停止模块 IPC 处理函数 ====================

// 临时备份目录（普通停止）
const TEMP_BACKUP_DIR = path.join(__dirname, 'backups', 'temp');
// 紧急备份目录
const EMERGENCY_BACKUP_DIR = path.join(__dirname, 'backups', 'emergency');
// 停止状态文件
const STOP_STATE_FILE = path.join(__dirname, '.stop-state.json');

/**
 * 保存停止状态到文件
 */
function saveStopState(state) {
  try {
    fs.writeFileSync(STOP_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[StopState] 保存状态失败:', e);
  }
}

/**
 * 读取停止状态
 */
function loadStopState() {
  try {
    if (fs.existsSync(STOP_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STOP_STATE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[StopState] 读取状态失败:', e);
  }
  return null;
}

/**
 * 清除停止状态
 */
function clearStopState() {
  try {
    if (fs.existsSync(STOP_STATE_FILE)) {
      fs.unlinkSync(STOP_STATE_FILE);
    }
  } catch (e) {
    console.error('[StopState] 清除状态失败:', e);
  }
}

/**
 * 创建临时备份（普通停止）
 * 【修复】同时备份 openclaw.json 和 auth-profiles.json
 */
async function createTempBackup() {
  try {
    fs.mkdirSync(TEMP_BACKUP_DIR, { recursive: true });
    
    // 清理旧备份
    const files = fs.readdirSync(TEMP_BACKUP_DIR)
      .filter(f => f.startsWith('temp_stop_') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(TEMP_BACKUP_DIR, f),
        time: fs.statSync(path.join(TEMP_BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    // 删除旧备份
    for (let i = 1; i < files.length; i++) {
      fs.unlinkSync(files[i].path);
    }
    
    // 创建新备份（包含两个配置文件）
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    const fileName = `temp_stop_${timestamp}.json`;
    const backupPath = path.join(TEMP_BACKUP_DIR, fileName);
    
    // 【v2.6 修复】同时备份 openclaw.json、models.json 和 auth-profiles.json
    const authProfilesPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'auth-profiles.json');
    const modelsPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'models.json');
    const backupData = {
      openclaw: JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8')),
      models: fs.existsSync(modelsPath) ? JSON.parse(fs.readFileSync(modelsPath, 'utf8')) : { providers: {} },
      authProfiles: fs.existsSync(authProfilesPath) ? JSON.parse(fs.readFileSync(authProfilesPath, 'utf8')) : { profiles: {} },
      backupType: 'temp_stop_v3',
      timestamp: Date.now()
    };
    
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    
    addLog('info', '[临时备份] 已创建普通停止备份（包含 auth-profiles）', { fileName }, 'system');
    
    return {
      success: true,
      fileName,
      path: backupPath
    };
  } catch (error) {
    addLog('error', '[临时备份] 创建失败', { error: error.message }, 'system');
    throw error;
  }
}

/**
 * 创建紧急备份
 * 【修复】同时备份 openclaw.json 和 auth-profiles.json
 */
async function createEmergencyBackup() {
  try {
    fs.mkdirSync(EMERGENCY_BACKUP_DIR, { recursive: true });
    
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    const randomId = Math.random().toString(36).substring(2, 8);
    const fileName = `emergency_auto_${timestamp}_${randomId}.json`;
    const backupPath = path.join(EMERGENCY_BACKUP_DIR, fileName);
    
    // 【v2.6 修复】同时备份 openclaw.json、models.json 和 auth-profiles.json
    const authProfilesPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'auth-profiles.json');
    const modelsPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'models.json');
    const backupData = {
      openclaw: JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8')),
      models: fs.existsSync(modelsPath) ? JSON.parse(fs.readFileSync(modelsPath, 'utf8')) : { providers: {} },
      authProfiles: fs.existsSync(authProfilesPath) ? JSON.parse(fs.readFileSync(authProfilesPath, 'utf8')) : { profiles: {} },
      backupType: 'emergency_auto_v3',
      timestamp: Date.now()
    };
    
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    
    addLog('info', '[紧急备份] 已创建紧急停止备份（包含 auth-profiles）', { fileName }, 'system');
    
    return {
      success: true,
      backupId: randomId,
      fileName,
      path: backupPath
    };
  } catch (error) {
    addLog('error', '[紧急备份] 创建失败', { error: error.message }, 'system');
    throw error;
  }
}

// 普通停止
ipcMain.handle('normalStop', async () => {
  try {
    addLog('info', '[普通停止] 开始执行', {}, 'system');
    
    // 1. 创建临时备份
    const backup = await createTempBackup();
    
    // 2. 读取当前配置
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    const previousProvider = config.agents?.defaults?.model?.primary || '未设置';
    
    // 3. 清空 providers
    config.models = { providers: {} };
    config.agents = { defaults: { model: { primary: '' } } };
    
    // 4. 保存配置
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2));
    
    // 5. 【关键修复】清空 auth-profiles.json（普通停止也需要清空 auth，但可恢复）
    const authProfilesPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'auth-profiles.json');
    if (fs.existsSync(authProfilesPath)) {
      const authContent = JSON.parse(fs.readFileSync(authProfilesPath, 'utf8'));
      const clearedProfiles = Object.keys(authContent.profiles || {});
      authContent.profiles = {};
      authContent.lastGood = null;
      fs.writeFileSync(authProfilesPath, JSON.stringify(authContent, null, 2));
      addLog('info', '[普通停止] 已清空 auth-profiles.json', { clearedProfiles: clearedProfiles.length }, 'system');
    }

    // 【v2.7.2 修复】普通停止不停止 Gateway，与紧急停止保持一致
    // 只清空配置让 Gateway 无法连接到 AI 服务，避免恢复时需要重新启动 Gateway
    addLog('info', '[普通停止] Gateway 保持运行（配置已清空，服务不可用）', {}, 'system');

    // 6. 保存停止状态
    saveStopState({
      normalStopped: true,
      emergencyStopped: false,
      backupFileName: backup.fileName,
      timestamp: Date.now(),
      previousProvider
    });
    
    addLog('info', '[普通停止] 执行成功', { backupFileName: backup.fileName }, 'system');
    
    return {
      success: true,
      backupFileName: backup.fileName,
      previousProvider
    };
  } catch (error) {
    addLog('error', '[普通停止] 执行失败', { error: error.message }, 'system');
    return { success: false, error: error.message };
  }
});

// 紧急停止
ipcMain.handle('emergencyStop', async () => {
  try {
    addLog('info', '[紧急停止] 开始执行', {}, 'system');
    
    // 1. 创建紧急备份
    const backup = await createEmergencyBackup();
    
    // 2. 读取当前配置
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    const clearedProviders = Object.keys(config.models?.providers || {});
    
    // 3. 清空所有关键配置
    config.models = { providers: {} };
    config.agents = { defaults: { model: { primary: '' } } };
    config.auth = { profiles: {} };
    
    // 4. 破坏 Gateway Token
    if (config.gateway?.auth?.token) {
      config.gateway.auth.token = 'EMERGENCY_STOP_' + Date.now();
    }
    
    // 5. 保存配置
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2));
    
    // 6. 【关键】清空 auth-profiles.json
    const authProfilesPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'auth-profiles.json');
    if (fs.existsSync(authProfilesPath)) {
      const authContent = JSON.parse(fs.readFileSync(authProfilesPath, 'utf8'));
      const clearedProfiles = Object.keys(authContent.profiles || {});
      authContent.profiles = {};
      authContent.lastGood = null;
      fs.writeFileSync(authProfilesPath, JSON.stringify(authContent, null, 2));
      addLog('info', '[紧急停止] 已清空 auth-profiles.json', { clearedProfiles: clearedProfiles.length }, 'system');
    }

    // 【v2.5 修复】紧急停止不停止 Gateway，只破坏 Token 让 Gateway 无法使用
    // 这样可以避免恢复时需要重新启动 Gateway
    addLog('info', '[紧急停止] Gateway 保持运行（Token 已破坏，服务不可用）', {}, 'system');

    // 7. 保存停止状态
    saveStopState({
      normalStopped: false,
      emergencyStopped: true,
      backupId: backup.backupId,
      backupFileName: backup.fileName,
      timestamp: Date.now()
    });
    
    addLog('info', '[紧急停止] 执行成功', { 
      backupId: backup.backupId,
      clearedProviders: clearedProviders.length 
    }, 'system');
    
    return {
      success: true,
      backupId: backup.backupId,
      backupFileName: backup.fileName,
      clearedProviders
    };
  } catch (error) {
    addLog('error', '[紧急停止] 执行失败', { error: error.message }, 'system');
    return { success: false, error: error.message };
  }
});

// 普通恢复
ipcMain.handle('normalRestore', async () => {
  try {
    addLog('info', '[普通恢复] 开始执行', {}, 'system');
    
    // 1. 获取临时备份
    if (!fs.existsSync(TEMP_BACKUP_DIR)) {
      return { success: false, error: '未找到临时备份' };
    }
    
    const files = fs.readdirSync(TEMP_BACKUP_DIR)
      .filter(f => f.startsWith('temp_stop_') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(TEMP_BACKUP_DIR, f),
        time: fs.statSync(path.join(TEMP_BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    if (files.length === 0) {
      return { success: false, error: '未找到临时备份' };
    }
    
    // 2. 【v2.6 修复】读取备份数据并恢复配置文件，同时处理 apiKey
    const backupData = JSON.parse(fs.readFileSync(files[0].path, 'utf8'));
    
    // 恢复 openclaw.json（处理 apiKey 为 "e"）
    if (backupData.openclaw) {
      const openclawConfig = backupData.openclaw;
      
      // 【v2.6 关键修复】将 models.providers.*.apiKey 重置为 "e"
      if (openclawConfig.models?.providers) {
        for (const [providerId, provider] of Object.entries(openclawConfig.models.providers)) {
          // 将所有非 "e" 的 apiKey 重置为 "e"（包括 enc: 开头的加密密钥）
          if (provider.apiKey && provider.apiKey !== 'e') {
            provider.apiKey = 'e';
            addLog('info', `[普通恢复] 重置 ${providerId}.apiKey 为 "e"`, {}, 'system');
          }
        }
      }
      
      saveOpenClawConfigOrdered(openclawConfig);
      addLog('info', '[普通恢复] 已恢复 openclaw.json（apiKey 已重置，按官方字段顺序）', {}, 'system');
    }

    // 【v2.6 修复】恢复 models.json
    if (backupData.models) {
      const modelsPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'models.json');
      fs.mkdirSync(path.dirname(modelsPath), { recursive: true });
      fs.writeFileSync(modelsPath, JSON.stringify(backupData.models, null, 2));
      const restoredProviders = Object.keys(backupData.models.providers || {}).length;
      addLog('info', '[普通恢复] 已恢复 models.json', { restoredProviders }, 'system');
    }

    // 恢复 auth-profiles.json（真实 API Key 存储在这里）
    if (backupData.authProfiles) {
      const authProfilesPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'auth-profiles.json');
      fs.writeFileSync(authProfilesPath, JSON.stringify(backupData.authProfiles, null, 2));
      const restoredProfiles = Object.keys(backupData.authProfiles.profiles || {}).length;
      addLog('info', '[普通恢复] 已恢复 auth-profiles.json', { restoredProfiles }, 'system');
    }

    // 【v2.7.4 修复】检查 Gateway 状态，如未运行则自动修复
    addLog('info', '[普通恢复] 检查 Gateway 服务状态...', {}, 'system');
    const gatewayStatus = await checkGatewayStatusWithRetry(3);

    if (!gatewayStatus.running) {
      addLog('warning', '[普通恢复] Gateway 服务未运行，尝试自动修复...', {}, 'system');

      // 尝试安装并启动 Gateway
      const repairResult = await repairGatewayService();

      if (!repairResult.success) {
        addLog('error', '[普通恢复] Gateway 自动修复失败', { error: repairResult.error }, 'system');
        return {
          success: false,
          error: '配置文件已恢复，但 Gateway 服务启动失败：' + repairResult.error,
          needsManualRepair: true
        };
      }

      addLog('success', '[普通恢复] Gateway 服务已自动修复', {}, 'system');
    } else {
      addLog('info', '[普通恢复] Gateway 服务运行正常，等待配置重新加载...', {}, 'system');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 【v2.3 更新】状态清除移至渲染进程检测通过后执行
    // 不在此处清除，而是返回成功让前端进行检测

    addLog('info', '[普通恢复] 配置文件恢复成功', { fileName: files[0].name }, 'system');

    return { success: true };
  } catch (error) {
    addLog('error', '[普通恢复] 执行失败', { error: error.message }, 'system');
    return { success: false, error: error.message };
  }
});

// 紧急恢复
// 【v2.7.1 修复】支持通过 backupId 或查找最新备份文件
ipcMain.handle('emergencyRestore', async () => {
  try {
    addLog('info', '[紧急恢复] 开始执行', {}, 'system');

    // 1. 获取紧急备份
    // 【v2.7.1 修复】首先尝试通过 backupId 查找，如果找不到则使用最新的备份文件
    let backupFile = null;
    const state = loadStopState();

    if (state?.backupId && fs.existsSync(EMERGENCY_BACKUP_DIR)) {
      // 尝试通过 backupId 查找
      const files = fs.readdirSync(EMERGENCY_BACKUP_DIR)
        .filter(f => f.includes(state.backupId))
        .map(f => path.join(EMERGENCY_BACKUP_DIR, f));

      if (files.length > 0) {
        backupFile = files[0];
        addLog('info', '[紧急恢复] 通过 backupId 找到备份文件', { backupId: state.backupId }, 'system');
      }
    }

    // 如果通过 backupId 没找到，尝试查找最新的紧急备份文件
    if (!backupFile && fs.existsSync(EMERGENCY_BACKUP_DIR)) {
      const files = fs.readdirSync(EMERGENCY_BACKUP_DIR)
        .filter(f => f.startsWith('emergency_auto_') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(EMERGENCY_BACKUP_DIR, f),
          time: fs.statSync(path.join(EMERGENCY_BACKUP_DIR, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 0) {
        backupFile = files[0].path;
        addLog('info', '[紧急恢复] 使用最新的紧急备份文件', { fileName: files[0].name }, 'system');
      }
    }

    if (!backupFile) {
      return { success: false, error: '未找到紧急备份文件' };
    }

    // 2. 【v2.6 修复】读取备份数据并恢复配置文件，同时处理 apiKey
    const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    
    // 恢复 openclaw.json（处理 apiKey 为 "e"）
    if (backupData.openclaw) {
      const openclawConfig = backupData.openclaw;
      
      // 【v2.6 关键修复】将 models.providers.*.apiKey 重置为 "e"
      if (openclawConfig.models?.providers) {
        for (const [providerId, provider] of Object.entries(openclawConfig.models.providers)) {
          // 将所有非 "e" 的 apiKey 重置为 "e"（包括 enc: 开头的加密密钥）
          if (provider.apiKey && provider.apiKey !== 'e') {
            provider.apiKey = 'e';
            addLog('info', `[紧急恢复] 重置 ${providerId}.apiKey 为 "e"`, {}, 'system');
          }
        }
      }
      
      saveOpenClawConfigOrdered(openclawConfig);
      addLog('info', '[紧急恢复] 已恢复 openclaw.json（apiKey 已重置，按官方字段顺序）', {}, 'system');
    }

    // 【v2.6 修复】恢复 models.json
    if (backupData.models) {
      const modelsPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'models.json');
      fs.mkdirSync(path.dirname(modelsPath), { recursive: true });
      fs.writeFileSync(modelsPath, JSON.stringify(backupData.models, null, 2));
      const restoredProviders = Object.keys(backupData.models.providers || {}).length;
      addLog('info', '[紧急恢复] 已恢复 models.json', { restoredProviders }, 'system');
    }

    // 恢复 auth-profiles.json（真实 API Key 存储在这里）
    if (backupData.authProfiles) {
      const authProfilesPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'auth-profiles.json');
      fs.writeFileSync(authProfilesPath, JSON.stringify(backupData.authProfiles, null, 2));
      const restoredProfiles = Object.keys(backupData.authProfiles.profiles || {}).length;
      addLog('info', '[紧急恢复] 已恢复 auth-profiles.json', { restoredProfiles }, 'system');
    }

    // 【v2.7.4 修复】检查 Gateway 服务状态，如未运行则自动修复
    addLog('info', '[紧急恢复] 检查 Gateway 服务状态...', {}, 'system');
    const gatewayStatus = await checkGatewayStatusWithRetry(3);

    if (!gatewayStatus.running) {
      addLog('warning', '[紧急恢复] Gateway 服务未运行，尝试自动修复...', {}, 'system');

      // 尝试安装并启动 Gateway
      const repairResult = await repairGatewayService();

      if (!repairResult.success) {
        addLog('error', '[紧急恢复] Gateway 自动修复失败', { error: repairResult.error }, 'system');
        return {
          success: false,
          error: '配置文件已恢复，但 Gateway 服务启动失败：' + repairResult.error,
          needsManualRepair: true
        };
      }

      addLog('success', '[紧急恢复] Gateway 服务已自动修复', {}, 'system');
    } else {
      addLog('info', '[紧急恢复] Gateway 服务运行正常，等待配置重新加载...', {}, 'system');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 【v2.3 更新】状态清除移至渲染进程检测通过后执行
    // 不在此处清除，而是返回成功让前端进行检测

    addLog('info', '[紧急恢复] 配置文件恢复成功', {}, 'system');

    return { success: true };
  } catch (error) {
    addLog('error', '[紧急恢复] 执行失败', { error: error.message }, 'system');
    return { success: false, error: error.message };
  }
});

// 检查临时备份
ipcMain.handle('checkTempBackup', async () => {
  try {
    if (!fs.existsSync(TEMP_BACKUP_DIR)) {
      return { exists: false };
    }
    
    const files = fs.readdirSync(TEMP_BACKUP_DIR)
      .filter(f => f.startsWith('temp_stop_') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(TEMP_BACKUP_DIR, f),
        time: fs.statSync(path.join(TEMP_BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    if (files.length === 0) {
      return { exists: false };
    }
    
    return {
      exists: true,
      fileName: files[0].name,
      timestamp: files[0].time
    };
  } catch (error) {
    return { exists: false, error: error.message };
  }
});

// 获取紧急停止状态
ipcMain.handle('getEmergencyStopState', async () => {
  const state = loadStopState();
  return {
    stopped: state?.emergencyStopped || false,
    backupId: state?.backupId || null
  };
});

// 【v2.7 新增】清除临时备份
ipcMain.handle('clearTempBackup', async () => {
  try {
    if (fs.existsSync(TEMP_BACKUP_DIR)) {
      const files = fs.readdirSync(TEMP_BACKUP_DIR)
        .filter(f => f.startsWith('temp_stop_') && f.endsWith('.json'));
      
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(TEMP_BACKUP_DIR, file));
          addLog('info', `[清除临时备份] 已删除: ${file}`, {}, 'system');
        } catch (e) {
          console.warn(`[清除临时备份] 删除失败: ${file}`, e);
        }
      }
    }
    return { success: true };
  } catch (error) {
    console.error('[清除临时备份] 失败:', error);
    return { success: false, error: error.message };
  }
});

// 【v2.7 新增】清除紧急停止状态
// 【v2.7.1 修复】不再删除紧急备份文件，只清除状态文件
ipcMain.handle('clearEmergencyStopState', async () => {
  try {
    // 清除 .stop-state.json（主状态文件）
    if (fs.existsSync(STOP_STATE_FILE)) {
      fs.unlinkSync(STOP_STATE_FILE);
      addLog('info', '[清除紧急停止状态] 已删除状态文件', {}, 'system');
    }

    // 【v2.7.1 修复】不再删除紧急备份文件，保留以备后续使用
    // 紧急备份文件保留在 backups/emergency/ 目录中

    return { success: true };
  } catch (error) {
    console.error('[清除紧急停止状态] 失败:', error);
    return { success: false, error: error.message };
  }
});

// 验证 OpenClaw 配置
ipcMain.handle('verifyOpenclawConfig', async () => {
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      return { success: false, error: '配置文件不存在' };
    }
    
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 验证 Models 配置
ipcMain.handle('verifyModelsConfig', async () => {
  try {
    const modelsPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'models.json');
    if (!fs.existsSync(modelsPath)) {
      return { success: false, error: '文件不存在' };
    }
    
    const config = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 验证 Auth 配置
ipcMain.handle('verifyAuthConfig', async () => {
  try {
    const authPath = path.join(OPENCLAW_CONFIG_DIR, 'agents', 'main', 'agent', 'auth-profiles.json');
    if (!fs.existsSync(authPath)) {
      return { success: false, error: '文件不存在' };
    }
    
    const config = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 验证 Gateway 进程
ipcMain.handle('verifyGatewayProcess', async () => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // 【修复】添加跨平台支持
    let command;
    if (isWin) {
      // Windows: 使用 tasklist
      command = 'tasklist | findstr "openclaw"';
    } else if (isMac) {
      // macOS: 使用 pgrep
      command = 'pgrep -f "openclaw.*gateway" || echo "not found"';
    } else {
      // Linux: 使用 pgrep
      command = 'pgrep -f "openclaw.*gateway" || echo "not found"';
    }
    
    try {
      const { stdout } = await execAsync(command);
      let running;
      if (isWin) {
        running = stdout.trim().length > 0;
      } else {
        running = stdout.trim() !== 'not found' && stdout.trim() !== '';
      }
      return { success: true, running };
    } catch (execError) {
      // 命令执行失败（如进程不存在），返回未运行
      return { success: true, running: false };
    }
  } catch (error) {
    return { success: false, running: false, error: error.message };
  }
});

// 验证 Gateway 端口
ipcMain.handle('verifyGatewayPort', async () => {  
  try {
    const net = require('net');
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve({ success: true, open: true });
      });
      
      socket.on('error', () => {
        resolve({ success: true, open: false });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ success: true, open: false });
      });
      
      socket.connect(3000, 'localhost');
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 验证 Gateway Token
ipcMain.handle('verifyGatewayToken', async () => {
  try {
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    const token = config.gateway?.auth?.token;
    
    if (!token) {
      return { success: true, valid: false, error: 'Token 不存在' };
    }
    
    if (token.startsWith('EMERGENCY_STOP_')) {
      return { success: true, valid: false, error: 'Token 已被破坏' };
    }
    
    return { success: true, valid: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 验证 Gateway 健康状态
ipcMain.handle('verifyGatewayHealth', async () => {
  try {
    const result = await getGatewayStatus();
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 验证 AI 连接
ipcMain.handle('verifyAIConnection', async () => {
  try {
    const result = await getGatewayStatus();
    if (!result.running) {
      return { success: true, connected: false, error: 'Gateway 未运行' };
    }
    
    // 简单的 HTTP 请求测试
    const http = require('http');
    return new Promise((resolve) => {
      const req = http.get('http://localhost:3000/health', (res) => {
        resolve({ success: true, connected: res.statusCode === 200 });
      });
      
      req.on('error', () => {
        resolve({ success: true, connected: false });
      });
      
      req.setTimeout(3000, () => {
        req.destroy();
        resolve({ success: true, connected: false });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 重新安装 Gateway
ipcMain.handle('reinstallGateway', async () => {
  try {
    addLog('info', '[Gateway] 开始重新安装', {}, 'system');
    
    const { spawn } = require('child_process');
    const child = spawn('openclaw', ['gateway', 'install'], {
      detached: true,
      stdio: 'ignore'
    });
    
    child.unref();
    
    // 等待安装完成
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    addLog('info', '[Gateway] 重新安装完成', {}, 'system');
    
    return { success: true };
  } catch (error) {
    addLog('error', '[Gateway] 重新安装失败', { error: error.message }, 'system');
    return { success: false, error: error.message };
  }
});

// 【v2.7 新增】从备份恢复 Gateway 配置
// 【v2.7.5 重写】修复 Gateway Token 不一致问题
// 策略：以 auth.token 为准，统一 remote.token
ipcMain.handle('repairGatewayFromBackup', async () => {
  try {
    addLog('info', '[Gateway修复] 开始修复 Token 不一致问题', {}, 'system');
    
    // 1. 读取当前配置
    let currentConfig = {};
    try {
      currentConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    } catch (e) {
      return { success: false, error: '无法读取当前配置: ' + e.message };
    }
    
    const authToken = currentConfig.gateway?.auth?.token;
    const remoteToken = currentConfig.gateway?.remote?.token;
    
    // 2. 检查 token 状态
    if (!authToken) {
      return { success: false, error: 'auth.token 不存在，无法修复' };
    }
    
    // 3. 【v2.7.5 修复逻辑】统一 token
    // 策略：以 auth.token 为准（服务端 token），将 remote.token 设置为相同值
    // 原因：Gateway 服务读取的是 auth.token，客户端应该使用相同的 token 连接
    if (authToken !== remoteToken) {
      addLog('info', `[Gateway修复] 检测到 token 不一致，准备统一`, {
        authToken: authToken.substring(0, 8) + '...',
        remoteToken: remoteToken ? remoteToken.substring(0, 8) + '...' : '不存在'
      }, 'system');
      
      // 确保 gateway 对象存在
      if (!currentConfig.gateway) {
        currentConfig.gateway = {};
      }
      if (!currentConfig.gateway.remote) {
        currentConfig.gateway.remote = {};
      }
      
      // 将 remote.token 设置为与 auth.token 相同
      currentConfig.gateway.remote.token = authToken;
      
      // 更新 meta 信息
      if (!currentConfig.meta) {
        currentConfig.meta = {};
      }
      currentConfig.meta.lastTouchedAt = new Date().toISOString();
      currentConfig.meta.lastTouchedVersion = currentConfig.meta.lastTouchedVersion || 'unknown';
      
      // 4. 保存修复后的配置
      fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(currentConfig, null, 2));
      
      addLog('success', '[Gateway修复] Token 已统一', {
        unifiedToken: authToken.substring(0, 8) + '...'
      }, 'system');
      
      return { 
        success: true, 
        message: 'Token 已统一，Gateway 将自动检测配置变化',
        backup: 'token-unified'
      };
    } else {
      // Token 已经一致
      return { 
        success: true, 
        message: 'Token 已经一致，无需修复',
        backup: 'already-consistent'
      };
    }
  } catch (error) {
    addLog('error', '[Gateway修复] 修复失败', { error: error.message }, 'system');
    return { success: false, error: error.message };
  }
});

// 【v2.5 新增】Gateway 自动修复 - 安装并启动 Gateway
ipcMain.handle('autoRepairGateway', async () => {
  try {
    addLog('info', '[Gateway] 开始自动修复（install + start）', {}, 'system');
    
    const { spawn } = require('child_process');
    
    // 步骤1: 执行 install
    addLog('info', '[Gateway] 执行 install...', {}, 'system');
    const installResult = await new Promise((resolve) => {
      const spawnInfo = buildOpenClawSpawnArgs(['gateway', 'install']);
      const proc = spawn(spawnInfo.command, spawnInfo.args, {
        windowsHide: true,
        shell: spawnInfo.shell,
        timeout: 30000
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });
      
      proc.on('close', (code) => {
        resolve({ success: code === 0, stdout, stderr, code });
      });
      
      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
    
    addLog('info', '[Gateway] install 完成', { success: installResult.success }, 'system');
    
    // 等待一下让系统处理
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 步骤2: 执行 start
    addLog('info', '[Gateway] 执行 start...', {}, 'system');
    const startResult = await new Promise((resolve) => {
      const spawnInfo = buildOpenClawSpawnArgs(['gateway', 'start']);
      const proc = spawn(spawnInfo.command, spawnInfo.args, {
        windowsHide: true,
        shell: spawnInfo.shell,
        timeout: 30000
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });
      
      proc.on('close', (code) => {
        resolve({ success: code === 0, stdout, stderr, code });
      });
      
      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
    
    addLog('info', '[Gateway] start 完成', { success: startResult.success }, 'system');

    // 【v2.7.3 修复】等待 Gateway 启动并验证
    addLog('info', '[Gateway] 等待 Gateway 启动...', {}, 'system');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 【v2.7.3 新增】验证 Gateway 是否真正启动
    addLog('info', '[Gateway] 验证 Gateway 状态...', {}, 'system');
    const verifyStatus = await checkGatewayStatusWithRetry(3);

    if (verifyStatus.running) {
      addLog('success', '[Gateway] 服务已成功启动', {}, 'system');
      return {
        success: true,
        install: installResult,
        start: startResult,
        verified: true
      };
    } else {
      addLog('error', '[Gateway] 服务启动后验证失败', {}, 'system');
      return {
        success: false,
        install: installResult,
        start: startResult,
        verified: false,
        error: '服务启动失败，请手动执行: openclaw gateway install && openclaw gateway start'
      };
    }
  } catch (error) {
    addLog('error', '[Gateway] 自动修复失败', { error: error.message }, 'system');
    return { success: false, error: error.message };
  }
});

// 显示系统通知
ipcMain.handle('showNotification', async (event, { title, body }) => {
  try {
    const { Notification } = require('electron');
    
    if (Notification.isSupported()) {
      new Notification({
        title,
        body,
        icon: path.join(__dirname, 'assets', 'icon.png')
      }).show();
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 【v2.7.5】检查依赖是否安装（用于导入导出功能）
ipcMain.handle('checkDependencies', async () => {
  try {
    try {
      require('archiver');
      require('extract-zip');
      return { success: true };
    } catch (e) {
      return { success: false, missing: ['archiver', 'extract-zip'] };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 【v2.7.5】安装依赖
ipcMain.handle('installDependencies', async () => {
  try {
    addLog('info', '[Dependencies] 开始安装依赖...', {}, 'system');
    
    const { execSync } = require('child_process');
    execSync('npm install', { 
      cwd: __dirname,
      stdio: 'pipe',
      timeout: 120000
    });
    
    addLog('success', '[Dependencies] 依赖安装成功', {}, 'system');
    return { success: true };
  } catch (error) {
    addLog('error', `[Dependencies] 依赖安装失败: ${error.message}`, {}, 'system');
    return { success: false, error: error.message };
  }
});

// 【v2.7.5】导出备份 - 将选中的备份文件打包导出
ipcMain.handle('export-backups', async (event, backupPaths) => {
  try {
    const { dialog } = require('electron');
    const archiver = require('archiver');
    
    addLog('info', '[Export] 开始导出备份', { count: backupPaths.length }, 'system');
    
    // 选择保存位置
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出备份',
      defaultPath: `backups-export-${getDateString()}.zip`,
      filters: [
        { name: 'ZIP 文件', extensions: ['zip'] }
      ]
    });
    
    if (result.canceled) {
      return { success: false, canceled: true };
    }
    
    const outputPath = result.filePath;
    
    // 创建 ZIP 文件
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve) => {
      output.on('close', () => {
        addLog('success', `[Export] 备份导出成功: ${outputPath}`, {}, 'system');
        resolve({ 
          success: true, 
          path: outputPath,
          count: backupPaths.length,
          size: archive.pointer()
        });
      });
      
      archive.on('error', (err) => {
        addLog('error', `[Export] 导出失败: ${err.message}`, {}, 'system');
        resolve({ success: false, error: err.message });
      });
      
      archive.pipe(output);
      
      // 添加备份文件到 ZIP
      for (const backupPath of backupPaths) {
        if (fs.existsSync(backupPath)) {
          const fileName = path.basename(backupPath);
          // 保留原始目录结构
          const relativePath = path.relative(BACKUP_DIR, backupPath);
          archive.file(backupPath, { name: relativePath });
        }
      }
      
      archive.finalize();
    });
  } catch (error) {
    addLog('error', `[Export] 导出异常: ${error.message}`, {}, 'system');
    return { success: false, error: error.message };
  }
});

// 【v2.7.5】导入备份 - 从 ZIP 文件导入备份到相应位置
ipcMain.handle('import-backups', async () => {
  try {
    const { dialog } = require('electron');
    const extract = require('extract-zip');
    
    addLog('info', '[Import] 开始导入备份', {}, 'system');
    
    // 选择 ZIP 文件
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入备份',
      filters: [
        { name: 'ZIP 文件', extensions: ['zip'] }
      ],
      properties: ['openFile']
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    
    const zipPath = result.filePaths[0];
    const tempDir = path.join(__dirname, 'temp', 'import-' + Date.now());
    
    // 创建临时目录
    fs.mkdirSync(tempDir, { recursive: true });
    
    // 解压 ZIP 文件
    await extract(zipPath, { dir: tempDir });
    
    // 扫描解压后的文件
    const importedFiles = [];
    
    function scanDir(dir, baseDir = '') {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(baseDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDir(fullPath, relativePath);
        } else if (item.endsWith('.json')) {
          // 确定目标位置
          let targetDir;
          if (relativePath.includes('init-backups')) {
            targetDir = path.join(BACKUP_DIR, 'init-backups');
          } else {
            // 从路径中提取日期目录
            const parts = relativePath.split(path.sep);
            if (parts.length >= 2) {
              targetDir = path.join(BACKUP_DIR, 'archives', parts[0]);
            } else {
              targetDir = path.join(BACKUP_DIR, 'archives', getDateString());
            }
          }
          
          // 确保目标目录存在
          fs.mkdirSync(targetDir, { recursive: true });
          
          const targetPath = path.join(targetDir, path.basename(item));
          
          // 【v2.7.5】导入时覆盖已存在的文件
          const isExist = fs.existsSync(targetPath);
          fs.copyFileSync(fullPath, targetPath);
          importedFiles.push({ file: item, path: targetPath, overwritten: isExist });
          if (isExist) {
            addLog('info', `[Import] 覆盖已存在的备份: ${item}`, {}, 'system');
          }
        }
      }
    }
    
    scanDir(tempDir);
    
    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    // 【v2.7.5】记录导入完成日志（覆盖模式）
    const overwrittenCount = importedFiles.filter(f => f.overwritten).length;
    addLog('success', `[Import] 备份导入完成: ${importedFiles.length} 个成功, ${overwrittenCount} 个已覆盖`, {}, 'system');
    
    // 【v2.7.5】返回导入结果（覆盖模式）
    return {
      success: true,
      imported: importedFiles.length,
      overwritten: overwrittenCount,
      importedFiles
    };
  } catch (error) {
    addLog('error', `[Import] 导入异常: ${error.message}`, {}, 'system');
    return { success: false, error: error.message };
  }
});

// 禁用硬件加速以避免花屏问题
app.disableHardwareAcceleration();

// 应用生命周期
app.whenReady().then(async () => {
  loadLogs();
  console.log('[Main] Logs loaded:', logs.length, 'entries');
  
  // 启用全局 HTTP/HTTPS 请求追踪
  wrapHttpRequest();
  
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});

// 防止多开
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}