// OpenClaw API Switcher - 初始化管理模块
// 处理应用初始化、配置加载、状态恢复等功能

/**
 * 初始化应用
 */
async function init() {
  console.log('[Init] Starting OpenClaw API Switcher');
  try {
    // 初始化版本号显示
    await initializeVersionDisplay();
    
    await loadConfig();

    // 注意：API Key 已经在 loadConfig() 中加载，无需额外同步
    // 新架构：程序配置是主数据源，OpenClaw 只是同步目标

    await loadLogs();
    await loadRequestHistory();
    await renderProviderList();
    // 恢复上次选择的 provider 和模型
    await restoreLastSelectedModel();
    renderCurrentModel();
    renderPresets();
    renderIconSelector();
    setupEventListeners();
    setupRealtimeLogs();
    setupOpenClawCheck();
    setupTabSwitching();
    setupRequestFilter();
    initRequestTracking(); // 初始化请求追踪监听
    setupGlobalStatusListener();
    initApiWarningModal(); // 初始化API警告对话框
    // 初始化时检查所有 Gateway 状态
    checkGatewayStatus();
    if (typeof checkGatewayServiceStatus === 'function') {
      checkGatewayServiceStatus();
    }
    await updateSessionInfo();
    startProtectionTimer();
    startAutoConnectionCheck();
    
    // 自动检测当前 Provider 的 API 连接（只更新右侧状态，不更新左侧"已激活"状态）
    setTimeout(() => autoTestApiConnection(), 2000);
    
    // 自动运行系统检查（诊断页面）
    setTimeout(() => {
      if (typeof checkConfigHealth === 'function') {
        console.log('[Init] 自动运行系统检查...');
        checkConfigHealth();
      }
      // 运行系统检查（配置文件和Gateway服务）
      if (typeof runSystemChecks === 'function') {
        console.log('[Init] 自动运行系统检查（配置文件和Gateway）...');
        runSystemChecks();
      }
    }, 3000);
    renderRequests();
    updateMiniSessionInfo();

    // 程序启动时自动检测 OpenClaw 配置（仅执行一次）
    // 注意：不再使用周期性定时器，避免日志重复输出
    // 检测场景：a) 程序启动  b) 备份操作  c) 恢复操作  d) 初始化配置
    setTimeout(() => autoCheckOpenClawConfig('init'), 1000);
    
    // 程序启动时检查是否需要显示迁移提醒（新架构）
    // 只在程序配置为空且 OpenClaw 有可迁移配置时显示
    setTimeout(() => {
      if (typeof initMigrationCheck === 'function') {
        console.log('[Init] 检查迁移配置状态...');
        initMigrationCheck();
      }
    }, 1500);

    // 初始化配置检查卡片
    setTimeout(() => {
      if (typeof initConfigCheckCard === 'function') {
        console.log('[Init] 初始化配置检查卡片...');
        initConfigCheckCard();
      }
    }, 2000);

    // 初始化配置状态总览模块（延迟执行，确保DOM已渲染）
    setTimeout(() => {
      if (typeof initConfigStatusModal === 'function') {
        console.log('[Init] 初始化配置状态总览模块...');
        initConfigStatusModal();
      } else {
        console.warn('[Init] initConfigStatusModal 函数未定义');
      }
    }, 500);

    // 初始化停止管理器（检查是否有未完成的停止状态）
    setTimeout(() => {
      if (typeof initStopManager === 'function') {
        console.log('[Init] 初始化停止管理器...');
        initStopManager();
      } else {
        console.warn('[Init] initStopManager 函数未定义');
      }
    }, 600);

    // 程序启动时加载备份列表（只加载一次）
    await loadBackupsPaginated();

    // 添加终端控制按钮
    setTimeout(() => {
      addTerminalControls();
    }, 100);

    // 初始化命令状态栏悬停功能
    setTimeout(() => {
      initCommandStatusBar();
    }, 200);

    // 初始化备份备注输入监听
    setupBackupNoteInput();

    console.log('[Init] Initialization completed successfully');
  } catch (e) {
    console.error('[Init] Initialization failed:', e);
    setGlobalStatus('初始化失败: ' + e.message, 'error');
  }
}

/**
 * 设置全局状态栏监听器
 */
function setupGlobalStatusListener() {
  window.electronAPI.onGlobalStatus((message, type) => {
    console.log('[GlobalStatus] 收到状态:', message, '类型:', type);
    setGlobalStatus(message, type);
  });
}

/**
 * 恢复上次选择的 provider 和模型
 */
async function restoreLastSelectedModel() {
  try {
    // 从 api-config.json 获取当前配置
    const apiConfig = await window.electronAPI.loadApiConfig();
    const currentModel = apiConfig?.selectedModel;
    if (!currentModel) {
      console.log('[Init] No previous model selection found');
      return;
    }

    const [providerName, modelId] = currentModel.split('/');
    if (!providerName || !modelId) {
      console.log('[Init] Invalid model format:', currentModel);
      return;
    }

    const provider = apiConfig.providers?.[providerName];
    if (!provider) {
      console.log('[Init] Provider not found:', providerName);
      return;
    }

    // 检查模型是否存在（大小写不敏感）
    const modelExists = provider.models?.some(m => m.id.toLowerCase() === modelId.toLowerCase());
    if (!modelExists) {
      console.log('[Init] Model not found:', modelId, 'in provider:', providerName);
      return;
    }

    // 获取标准模型ID（处理大小写不一致）
    const standardModel = provider.models.find(m => m.id.toLowerCase() === modelId.toLowerCase());
    const standardModelId = standardModel ? standardModel.id : modelId;

    // 设置选中的 provider
    StateManager.setSelectedProvider(providerName);

    // 重新渲染 provider 列表以显示选中状态
    await renderProviderList();

    // 安全切换模式：启动时不自动同步到 OpenClaw
    // 只有用户点击【应用配置】按钮时才同步
    // 显示【应用配置】按钮提示用户需要手动应用
    if (typeof updateApplyButtonState === 'function') {
      updateApplyButtonState('unsynced', providerName);
    }
    
    console.log('[Init] 恢复选中状态:', providerName, '(未同步到 OpenClaw，等待用户手动应用)');

    console.log('[Init] Restored last selected model:', currentModel);
    addLog('info', '恢复上次选择的模型: ' + currentModel, '', 'system');
  } catch (e) {
    console.error('[Init] Failed to restore last selected model:', e);
  }
}

/**
 * 加载配置
 */
async function loadConfig() {
  try {
    const config = await window.electronAPI.loadConfig();
    StateManager.setConfig(config);
    console.log('[Config] Loaded');
  } catch (e) {
    console.error('[Config] Failed to load:', e);
  }
}

/**
 * 保存配置
 */
async function saveConfig() {
  try {
    const config = StateManager.getConfig();
    await window.electronAPI.saveConfig(config);
    console.log('[Config] Saved');
  } catch (e) {
    console.error('[Config] Failed to save:', e);
  }
}

/**
 * 初始化版本号显示
 * 从主进程获取版本号并更新UI
 */
async function initializeVersionDisplay() {
  try {
    const result = await window.electronAPI.getAppVersion();
    const version = result.version || '1.0.0';
    
    // 更新标题栏版本号
    const versionDisplay = document.getElementById('app-version-display');
    if (versionDisplay) {
      versionDisplay.textContent = 'v' + version;
    }
    
    // 更新版本对话框中的当前版本
    const currentVersionDisplay = document.getElementById('current-version-display');
    if (currentVersionDisplay) {
      currentVersionDisplay.textContent = 'v' + version;
    }
    
    console.log('[Init] 版本号已初始化:', version);
  } catch (error) {
    console.error('[Init] 初始化版本号失败:', error);
    // 使用默认版本号
    const versionDisplay = document.getElementById('app-version-display');
    if (versionDisplay) {
      versionDisplay.textContent = 'v1.0.0';
    }
  }
}

// DOM加载完成后初始化
// 注意：此事件监听器只应在入口文件中定义一次
// 由于 renderer.js 是入口文件且已精简，这里保留事件监听
document.addEventListener('DOMContentLoaded', init);
