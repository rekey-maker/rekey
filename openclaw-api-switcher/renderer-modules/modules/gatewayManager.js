// OpenClaw API Switcher - Gateway 管理模块
// 处理 Gateway 状态检测、系统检查、OpenClaw 配置检查等功能

/**
 * 检查 Gateway 状态
 */
async function checkGatewayStatus() {
  try {
    const status = await window.electronAPI.getGatewayStatus();
    updateGatewayStatusUI(status);
    return status;
  } catch (error) {
    console.error('[Gateway] 状态检查失败:', error);
    updateGatewayStatusUI({ running: false, error: error.message });
    return { running: false, error: error.message };
  }
}

/**
 * 更新 Gateway 状态 UI
 */
function updateGatewayStatusUI(status) {
  const statusDot = document.getElementById('gateway-status-dot');
  const statusText = document.getElementById('gateway-status-text');
  
  if (!statusDot || !statusText) return;
  
  if (status.running) {
    statusDot.style.background = 'var(--success)';
    statusDot.style.boxShadow = '0 0 8px var(--success)';
    statusText.textContent = '运行中';
    statusText.style.color = 'var(--success)';
  } else {
    statusDot.style.background = 'var(--error)';
    statusDot.style.boxShadow = '0 0 8px var(--error)';
    statusText.textContent = status.error ? '错误' : '已停止';
    statusText.style.color = 'var(--error)';
  }
}

/**
 * 自动检测 OpenClaw 配置
 * @param {string} source - 检测来源，用于日志区分：'init'|'delete'|'backup'|'restore'|'manual'
 */
async function autoCheckOpenClawConfig(source = 'manual') {
  try {
    const sourceLabels = {
      'init': '程序启动',
      'delete': '删除Provider',
      'add': '添加Provider',
      'edit': '编辑Provider',
      'backup': '备份操作',
      'restore': '恢复操作',
      'manual': '手动触发'
    };
    const sourceLabel = sourceLabels[source] || source;
    
    // 检查程序配置是否为空
    const apiConfig = await window.electronAPI.loadApiConfig();
    const hasProgramConfig = apiConfig?.providers && Object.keys(apiConfig.providers).length > 0;
    
    if (hasProgramConfig) {
      // 程序配置已存在，检查 OpenClaw 同步状态
      const checkResult = await window.electronAPI.checkOpenClawConfig({ source });
      
      if (checkResult.success && checkResult.totalProviders > 0) {
        // OpenClaw 也有配置（冗余）
        const providerNames = checkResult.providers.map(p => p.name || p.id).join(', ');
        console.log(`[${sourceLabel}] 发现冗余: ${providerNames}`);
      }
      
      // 更新 UI 状态
      updateHealthStatus(hasProgramConfig, checkResult);
      return;
    }
    
    // 程序配置为空，检查 OpenClaw 是否有可迁移配置
    const checkResult = await window.electronAPI.checkOpenClawConfig({ source });
    
    if (!checkResult.success || checkResult.totalProviders === 0) {
      return;
    }
    
    // 有可迁移配置
    const providerNames = checkResult.providers.map(p => p.name || p.id).join(', ');
    const hasUnknownProviders = checkResult.providers.some(p => !isPredefinedProvider(p.id));
    
    if (!hasUnknownProviders) {
      // 可迁移的配置
      console.log(`[${sourceLabel}] 可迁移: ${providerNames}`);
      showMigrationUI(checkResult);
    } else {
      // 异常配置
      const unknownProviders = checkResult.providers.filter(p => !isPredefinedProvider(p.id));
      const unknownNames = unknownProviders.map(p => p.name || p.id).join(', ');
      console.log(`[${sourceLabel}] 异常配置: ${unknownNames}`);
      showCleanupUI(unknownProviders);
    }
  } catch (error) {
    console.error(`[${sourceLabel}] 检测失败:`, error.message);
  }
}

/**
 * 更新健康状态 UI
 */
function updateHealthStatus(hasProgramConfig, checkResult) {
  const programDot = document.getElementById('health-program-dot');
  const programValue = document.getElementById('health-program-value');
  const openclawDot = document.getElementById('health-openclaw-dot');
  const openclawValue = document.getElementById('health-openclaw-value');
  
  // 更新程序配置状态
  if (programDot && programValue) {
    if (hasProgramConfig) {
      programDot.style.background = 'var(--success)';
      programDot.style.boxShadow = '0 0 8px var(--success)';
      programValue.textContent = '已配置';
      programValue.style.color = 'var(--success)';
    } else {
      programDot.style.background = 'var(--error)';
      programDot.style.boxShadow = '0 0 8px var(--error)';
      programValue.textContent = '未配置';
      programValue.style.color = 'var(--error)';
    }
  }
  
  // 更新 OpenClaw 状态
  if (openclawDot && openclawValue) {
    if (checkResult.success && checkResult.totalProviders > 0) {
      openclawDot.style.background = 'var(--info)';
      openclawDot.style.boxShadow = '0 0 8px var(--info)';
      openclawValue.textContent = checkResult.totalProviders + ' 个可迁移';
      openclawValue.style.color = 'var(--info)';
    } else {
      openclawDot.style.background = 'var(--success)';
      openclawDot.style.boxShadow = '0 0 8px var(--success)';
      openclawValue.textContent = '无配置';
      openclawValue.style.color = 'var(--success)';
    }
  }
}

/**
 * 显示迁移 UI
 */
function showMigrationUI(checkResult) {
  const healthActionSection = document.getElementById('health-action-section');
  const migrateSection = document.getElementById('migrate-section');
  
  if (healthActionSection) healthActionSection.style.display = 'block';
  if (migrateSection) migrateSection.style.display = 'block';
  
  showHealthStatus('info', `检测到 ${checkResult.totalProviders} 个可迁移的配置，点击迁移按钮导入`);
  setGlobalStatus(`检测到 ${checkResult.totalProviders} 个可迁移API配置，点击"📥 迁移API配置"卡片导入`, 'info');
}

/**
 * 显示清理 UI
 */
function showCleanupUI(unknownProviders) {
  const healthActionSection = document.getElementById('health-action-section');
  const cleanupSection = document.getElementById('cleanup-section');
  const cleanupProviderList = document.getElementById('cleanup-provider-list');
  
  if (healthActionSection) healthActionSection.style.display = 'block';
  if (cleanupSection) cleanupSection.style.display = 'block';
  if (cleanupProviderList) {
    cleanupProviderList.innerHTML = unknownProviders.map(p => '• ' + p.name + ' (' + p.id + ')').join('<br>');
  }
  
  showHealthStatus('warning', `⚠️ 发现 ${unknownProviders.length} 个异常配置，建议清理后重新配置`);
}

/**
 * 设置 OpenClaw 配置检查
 */
function setupOpenClawCheck() {
  console.log('[OpenClaw] 配置检查已设置（仅启动时检查，无周期性检查）');
}

/**
 * 启动自动连接检查
 */
function startAutoConnectionCheck() {
  StateManager.clearAutoConnectionInterval();
  // 初始化时检查所有 Gateway 状态
  checkGatewayStatus();
  if (typeof checkGatewayServiceStatus === 'function') {
    checkGatewayServiceStatus();
  }

  const interval = setInterval(async () => {
    try {
      // 自动检查时同时更新所有状态指示器
      await checkGatewayStatus();
      if (typeof checkGatewayServiceStatus === 'function') {
        await checkGatewayServiceStatus();
      }
    } catch (e) {
      console.error('[AutoConnection] 检查失败:', e);
    }
  }, 30000);

  StateManager.setAutoConnectionInterval(interval);
  console.log('[AutoConnection] 自动连接检查已启动');
}

/**
 * 【v2.7.5 删除】isPredefinedProvider 已移至 configHealthManager.js
 * 注意：此函数现在由 configHealthManager.js 提供
 */

/**
 * 显示健康状态
 * @param {string} type - 状态类型：'normal'|'info'|'warning'|'error'
 * @param {string} message - 状态消息
 */
function showHealthStatus(type, message) {
  const healthStatus = document.getElementById('health-status');
  if (!healthStatus) return;
  
  healthStatus.textContent = message;
  healthStatus.className = 'health-status ' + type;
}

// ==================== 迁移配置相关函数 ====================

/**
 * 扫描 OpenClaw 配置用于迁移（新架构）
 * @returns {Promise<Object>} - 检测结果
 */
async function scanOpenClawForMigration() {
  try {
    const result = await window.electronAPI.scanOpenClawForMigration();
    return {
      success: result.success,
      providers: result.providers || [],
      configs: result.configs || {},
      totalProviders: result.providers?.length || 0,
      errors: result.errors || []
    };
  } catch (error) {
    console.error('[Migration] 扫描失败:', error);
    return { success: false, providers: [], configs: {}, totalProviders: 0, errors: [error.message] };
  }
}

/**
 * 检查 OpenClaw 配置是否已经迁移过
 * @param {Array} openclawProviders - OpenClaw 中的供应商列表
 * @param {Object} programConfig - 程序配置
 * @returns {boolean} - true: 已迁移, false: 未迁移
 */
function checkIfAlreadyMigrated(openclawProviders, programConfig) {
  // 情况1: OpenClaw 没有配置
  if (!openclawProviders || openclawProviders.length === 0) {
    return true; // 视为已处理，无需迁移
  }
  
  // 情况2: 程序配置为空
  if (!programConfig?.providers || Object.keys(programConfig.providers).length === 0) {
    return false; // 程序配置为空，未迁移
  }
  
  // 获取供应商ID列表
  const openclawIds = openclawProviders.map(p => p.id || p).sort();
  const programIds = Object.keys(programConfig.providers).sort();
  
  // 检查: OpenClaw 的所有供应商是否都在程序配置中
  const allMigrated = openclawIds.every(id => programIds.includes(id));
  
  if (!allMigrated) {
    return false; // 有未迁移的供应商
  }
  
  // 额外检查：API Key 是否一致（防止部分迁移）
  for (const providerId of openclawIds) {
    const programProvider = programConfig.providers[providerId];
    if (!programProvider) {
      return false; // 供应商不存在
    }
  }
  
  return true; // 已迁移
}

/**
 * 检查迁移状态
 * @returns {Promise<boolean>} - true: 已迁移, false: 未迁移
 */
async function checkMigrationStatus() {
  const apiConfig = await window.electronAPI.loadApiConfig();
  const scanResult = await scanOpenClawForMigration();
  
  if (!scanResult.success || scanResult.totalProviders === 0) {
    return true; // OpenClaw 没有配置，视为已处理
  }
  
  return checkIfAlreadyMigrated(scanResult.providers, apiConfig);
}

/**
 * 显示迁移提醒（非弹窗，在全局状态栏显示）
 * @param {number} count - 可迁移的供应商数量
 */
function showMigrationReminder(count) {
  // 在全局状态栏显示黄色提醒
  setGlobalStatus(
    `⚠️ 检测到 ${count} 个 OpenClaw 配置可迁移，点击下方按钮开始迁移`,
    'warning'
  );
  
  // 在首页显示迁移提醒卡片
  renderMigrationReminderCard(count);
  
  // 同时在诊断页面显示提醒卡片
  const migrateSection = document.getElementById('migrate-section');
  const healthActionSection = document.getElementById('health-action-section');
  
  if (healthActionSection) healthActionSection.style.display = 'block';
  if (migrateSection) {
    migrateSection.style.display = 'block';
    migrateSection.classList.add('highlight-pulse');
  }
  
  // 更新健康状态
  updateHealthStatus(false, { success: true, totalProviders: count });
  
  // 记录到日志
  addLog('info', `检测到 ${count} 个可迁移的 OpenClaw 配置`, { count }, 'system');
}

/**
 * 在首页渲染迁移提醒卡片
 * @param {number} count - 可迁移的供应商数量，0 表示已同步完成
 */
function renderMigrationReminderCard(count) {
  console.log('[Migration] renderMigrationReminderCard 被调用，count:', count);
  
  // 检查是否已存在卡片
  let card = document.getElementById('migration-reminder-card');
  if (card) {
    console.log('[Migration] 移除已存在的卡片');
    card.remove();
  }
  
  // 创建卡片
  card = document.createElement('div');
  card.id = 'migration-reminder-card';
  
  // 根据状态决定显示内容
  if (count > 0) {
    // 有需要迁移的配置
    card.className = 'migration-reminder-card';
    card.innerHTML = `
      <div class="reminder-icon">🔄</div>
      <div class="reminder-content">
        <div class="reminder-title">检测到 OpenClaw 配置</div>
        <div class="reminder-text">发现 ${count} 个 API 供应商配置可迁移</div>
      </div>
      <button class="btn-reminder-migrate" onclick="startMigrationWizard()">
        <span>开始迁移</span>
        <span class="arrow">→</span>
      </button>
      <button class="btn-reminder-dismiss" onclick="dismissMigrationReminderCard()" title="暂不迁移">
        ✕
      </button>
    `;
  } else {
    // 已同步完成，显示手动迁移入口
    card.className = 'migration-reminder-card synced';
    card.innerHTML = `
      <div class="reminder-icon">✓</div>
      <div class="reminder-content">
        <div class="reminder-title">配置已同步</div>
        <div class="reminder-text">OpenClaw 配置已完成迁移</div>
      </div>
      <button class="btn-reminder-manual" onclick="startMigrationWizard()" title="手动管理配置">
        <span>管理配置</span>
        <span class="arrow">→</span>
      </button>
      <button class="btn-reminder-dismiss" onclick="dismissMigrationReminderCard()" title="关闭提示">
        ✕
      </button>
    `;
  }
  
  // 插入到 provider-list 顶部
  const providerList = document.getElementById('provider-list');
  console.log('[Migration] provider-list 元素:', providerList);
  if (providerList) {
    providerList.insertBefore(card, providerList.firstChild);
    console.log('[Migration] 卡片已插入到 provider-list');
  } else {
    console.error('[Migration] 找不到 provider-list 元素，无法插入卡片');
  }
}

/**
 * 开始迁移向导
 */
function startMigrationWizard() {
  // 移除提醒卡片
  dismissMigrationReminderCard();
  
  // 打开迁移向导
  if (typeof MigrationWizard !== 'undefined') {
    MigrationWizard.init();
  } else {
    console.error('[Migration] MigrationWizard 未定义');
    setGlobalStatus('迁移向导加载失败', 'error');
  }
}

/**
 * 关闭迁移提醒卡片
 */
function dismissMigrationReminderCard() {
  const card = document.getElementById('migration-reminder-card');
  if (card) {
    card.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => card.remove(), 300);
  }
  
  // 记录用户选择（同时保存版本号）
  localStorage.setItem('migrationReminderDismissed', 'true');
  localStorage.setItem('migrationReminderDismissedVersion', '2');
  
  // 恢复状态栏
  setGlobalStatus('就绪', 'info');
}

/**
 * 关闭迁移提醒
 */
function dismissMigrationReminder() {
  // 恢复默认状态栏
  setGlobalStatus('就绪', 'info');
  
  // 移除卡片高亮
  const migrateSection = document.getElementById('migrate-section');
  if (migrateSection) {
    migrateSection.classList.remove('highlight-pulse');
  }
  
  // 记录用户选择（可选：下次不再提醒）
  localStorage.setItem('migrationReminderDismissed', 'true');
}

/**
 * 检查是否应该显示迁移提醒
 * @returns {Promise<boolean>}
 */
async function shouldShowMigrationReminder() {
  console.log('[Migration] 检查是否应该显示迁移提醒...');
  
  // 【开发模式】始终显示提醒，方便调试
  // 生产环境可以取消下面的注释来启用用户关闭功能
  // const dismissed = localStorage.getItem('migrationReminderDismissed');
  // if (dismissed === 'true') {
  //   console.log('[Migration] 用户已手动关闭提醒，不显示');
  //   return false;
  // }
  
  // 检查 OpenClaw 是否有可迁移配置
  const scanResult = await scanOpenClawForMigration();
  console.log('[Migration] OpenClaw 扫描结果:', scanResult.success, '数量:', scanResult.totalProviders);
  if (!scanResult.success || scanResult.totalProviders === 0) {
    console.log('[Migration] 没有可迁移配置，不显示提醒');
    return false; // 没有可迁移配置
  }
  
  // 检查程序配置
  const apiConfig = await window.electronAPI.loadApiConfig();
  const providerCount = apiConfig?.providers ? Object.keys(apiConfig.providers).length : 0;
  console.log('[Migration] 程序配置供应商数量:', providerCount);
  
  // 检查是否已完全迁移（OpenClaw 的所有配置都已迁移到程序）
  const isMigrated = checkIfAlreadyMigrated(scanResult.providers, apiConfig);
  console.log('[Migration] 是否已完全迁移:', isMigrated);
  if (isMigrated) {
    console.log('[Migration] 已完全迁移，不显示提醒');
    return false; // 已完全迁移，不显示提醒
  }
  
  // 只要 OpenClaw 有可迁移配置且未完全迁移，就显示提醒
  // （不管程序配置是否已存在部分供应商）
  console.log('[Migration] 应该显示提醒（配置未完成）');
  return true; // 应该显示提醒
}

/**
 * 初始化时检查并显示迁移提醒
 */
async function initMigrationCheck() {
  try {
    console.log('[Migration] initMigrationCheck 开始执行...');
    
    // 先检查程序配置 - 如果已有供应商，不显示任何迁移提醒
    const apiConfig = await window.electronAPI.loadApiConfig();
    const hasProgramProviders = apiConfig && apiConfig.providers && Object.keys(apiConfig.providers).length > 0;
    
    console.log('[Migration] 程序配置检查:', {
      hasProgramProviders,
      providerCount: apiConfig?.providers ? Object.keys(apiConfig.providers).length : 0
    });
    
    // 如果程序中已有供应商配置，不显示迁移提醒（用户已经配置好了）
    if (hasProgramProviders) {
      console.log('[Migration] 程序中已有供应商配置，不显示迁移提醒');
      return;
    }
    
    // 检查 OpenClaw 配置
    const scanResult = await scanOpenClawForMigration();
    console.log('[Migration] OpenClaw 扫描结果:', scanResult);
    
    if (!scanResult.success || scanResult.totalProviders === 0) {
      console.log('[Migration] 没有可迁移配置，不显示提醒');
      return;
    }
    
    // 检查是否已迁移
    const isMigrated = checkIfAlreadyMigrated(scanResult.providers, apiConfig);
    console.log('[Migration] 是否已完全迁移:', isMigrated);
    
    if (isMigrated) {
      // 已完全迁移，显示"已同步"状态卡片
      console.log('[Migration] 已完全迁移，显示已同步状态');
      renderMigrationReminderCard(0); // 0 表示已同步
    } else {
      // 有需要迁移的配置，显示提醒
      console.log('[Migration] 有需要迁移的配置，显示提醒');
      showMigrationReminder(scanResult.totalProviders);
    }
  } catch (error) {
    console.error('[Migration] 初始化检查失败:', error);
  }
}

/**
 * 运行系统检查（诊断页面）
 * 检查配置文件和 Gateway 服务状态
 */
async function runSystemChecks() {
  console.log('[SystemCheck] 开始系统检查...');
  
  // 检查配置文件
  await checkConfigFileStatus();
  
  // 检查 Gateway 服务
  await checkGatewayServiceStatus();
  
  console.log('[SystemCheck] 系统检查完成');
}

/**
 * 检查配置文件状态
 */
async function checkConfigFileStatus() {
  const configDot = document.getElementById('check-config-dot');
  const configStatus = document.querySelector('#check-config .check-status');
  
  if (!configDot || !configStatus) return;
  
  try {
    const apiConfig = await window.electronAPI.loadApiConfig();
    const hasConfig = apiConfig && apiConfig.providers && Object.keys(apiConfig.providers).length > 0;
    
    if (hasConfig) {
      configDot.style.background = 'var(--success)';
      configDot.style.boxShadow = '0 0 8px var(--success)';
      configStatus.textContent = '正常';
      configStatus.style.color = 'var(--success)';
      console.log('[SystemCheck] 配置文件: 正常 (' + Object.keys(apiConfig.providers).length + ' 个供应商)');
    } else {
      configDot.style.background = 'var(--warning)';
      configDot.style.boxShadow = '0 0 8px var(--warning)';
      configStatus.textContent = '未配置';
      configStatus.style.color = 'var(--warning)';
      console.log('[SystemCheck] 配置文件: 未配置');
    }
  } catch (error) {
    console.error('[SystemCheck] 配置文件检查失败:', error);
    configDot.style.background = 'var(--error)';
    configDot.style.boxShadow = '0 0 8px var(--error)';
    configStatus.textContent = '错误';
    configStatus.style.color = 'var(--error)';
  }
}

/**
 * 检查 Gateway 服务状态（诊断页面）
 */
async function checkGatewayServiceStatus() {
  const gatewayDot = document.getElementById('check-gateway-dot');
  const gatewayStatus = document.querySelector('#check-gateway .check-status');

  // 诊断页面 Gateway 控制台状态指示器
  const diagRunningIcon = document.getElementById('diag-running-icon');
  const diagRunningText = document.getElementById('diag-running-text');
  const diagConnectionIcon = document.getElementById('diag-connection-icon');
  const diagConnectionText = document.getElementById('diag-connection-text');
  const diagLastcheckText = document.getElementById('diag-lastcheck-text');
  // 【v2.7.5 新增】Token 修复按钮
  const fixTokenBtn = document.getElementById('btn-fix-gateway-token');

  try {
    const status = await window.electronAPI.getGatewayStatus();
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });

    // 【v2.7.5 新增】检查 Token 状态
    let tokenNeedsRepair = false;
    try {
      const tokenStatus = await window.electronAPI.checkGatewayTokenStatus();
      const hasAuthToken = !!tokenStatus.details?.authToken;
      const hasRemoteToken = !!(tokenStatus.details?.remoteToken);
      const isConsistent = !!(hasAuthToken && hasRemoteToken && tokenStatus.details?.isConsistent);
      tokenNeedsRepair = !hasAuthToken || !hasRemoteToken || !isConsistent;
      console.log('[SystemCheck] Token 状态:', { hasAuthToken, hasRemoteToken, isConsistent, needsRepair: tokenNeedsRepair });
    } catch (tokenError) {
      console.error('[SystemCheck] Token 检查失败:', tokenError);
      tokenNeedsRepair = true;
    }

    // 更新左侧系统检查 - Gateway 状态
    if (gatewayDot && gatewayStatus) {
      if (status.running) {
        gatewayDot.style.background = 'var(--success)';
        gatewayDot.style.boxShadow = '0 0 8px var(--success)';
        gatewayStatus.textContent = '运行中';
        gatewayStatus.style.color = 'var(--success)';
      } else {
        gatewayDot.style.background = 'var(--error)';
        gatewayDot.style.boxShadow = '0 0 8px var(--error)';
        gatewayStatus.textContent = status.error ? '错误' : '已停止';
        gatewayStatus.style.color = 'var(--error)';
      }
    }

    // 更新右侧 Gateway 控制台 - 运行状态
    if (diagRunningIcon && diagRunningText) {
      if (status.running) {
        diagRunningIcon.textContent = '✅';
        diagRunningText.textContent = '运行中';
        diagRunningText.style.color = 'var(--success)';
      } else {
        diagRunningIcon.textContent = '❌';
        diagRunningText.textContent = status.error ? '错误' : '已停止';
        diagRunningText.style.color = 'var(--error)';
      }
    }

    // 更新右侧 Gateway 控制台 - 连接状态
    if (diagConnectionIcon && diagConnectionText) {
      if (status.running) {
        diagConnectionIcon.textContent = '🔌';
        diagConnectionText.textContent = '端口 18789 正常';
        diagConnectionText.style.color = 'var(--success)';
      } else {
        diagConnectionIcon.textContent = '🔌';
        diagConnectionText.textContent = '端口 18789 未连接';
        diagConnectionText.style.color = 'var(--error)';
      }
    }

    // 更新最后检查时间
    if (diagLastcheckText) {
      diagLastcheckText.textContent = timeStr;
    }

    // 【v2.7.5 更新】更新 Token 状态按钮样式（胶囊型）
    const tokenStatusIcon = document.getElementById('token-status-icon');
    const tokenStatusText = document.getElementById('token-status-text');
    if (fixTokenBtn && tokenStatusIcon && tokenStatusText) {
      if (tokenNeedsRepair) {
        // Token 异常：变成修复样式（警告色）
        tokenStatusIcon.textContent = '🔧';
        tokenStatusText.textContent = '修复 Token';
        fixTokenBtn.className = 'status-pill status-dynamic status-btn status-warning';
        fixTokenBtn.dataset.desc = 'Gateway Token 配置异常，点击修复';
        console.log('[SystemCheck] Token 需要修复，显示修复按钮样式');
      } else {
        // Token 正常：显示为正常状态（已激活）
        tokenStatusIcon.textContent = '🛡️';
        tokenStatusText.textContent = 'Token 正常';
        fixTokenBtn.className = 'status-pill status-dynamic status-btn active';
        fixTokenBtn.dataset.desc = 'Gateway Token 配置正常';
        console.log('[SystemCheck] Token 正常，显示状态按钮样式');
      }
    }

    console.log('[SystemCheck] Gateway 服务:', status.running ? '运行中' : '已停止');

    // 检查是否需要显示安装按钮
    const installBtn = document.getElementById('btn-install-gateway');
    const restartBtn = document.getElementById('btn-restart-gateway');
    if (installBtn && restartBtn) {
      if (!status.running && status.error && (status.error.includes('not loaded') || status.error.includes('not installed'))) {
        installBtn.style.display = 'inline-block';
        restartBtn.style.display = 'none';
        console.log('[SystemCheck] Gateway 服务未安装，显示安装按钮');
      } else {
        installBtn.style.display = 'none';
        restartBtn.style.display = 'inline-block';
      }
    }
  } catch (error) {
    console.error('[SystemCheck] Gateway 检查失败:', error);

    if (gatewayDot && gatewayStatus) {
      gatewayDot.style.background = 'var(--error)';
      gatewayDot.style.boxShadow = '0 0 8px var(--error)';
      gatewayStatus.textContent = '检查失败';
      gatewayStatus.style.color = 'var(--error)';
    }

    if (diagRunningIcon && diagRunningText) {
      diagRunningIcon.textContent = '❌';
      diagRunningText.textContent = '检查失败';
      diagRunningText.style.color = 'var(--error)';
    }
  }
}

/**
 * 重启 Gateway 服务
 */
async function restartGateway() {
  try {
    setGlobalStatus('正在重启 Gateway 服务...', 'info');
    console.log('[Gateway] 开始重启 Gateway...');

    const result = await window.electronAPI.restartGateway();

    if (result.success) {
      setGlobalStatus('Gateway 重启成功', 'success');
      console.log('[Gateway] 重启成功');
      
      // 重启后刷新状态 - 多次刷新确保所有UI同步
      console.log('[Gateway] 立即刷新状态...');
      await checkGatewayServiceStatus();
      await checkGatewayStatus();
      
      // 延迟再次刷新，确保Gateway完全启动
      setTimeout(async () => {
        console.log('[Gateway] 3秒后刷新状态...');
        await checkGatewayServiceStatus();
        await checkGatewayStatus();
      }, 3000);
      
      // 再延迟一次，确保状态稳定
      setTimeout(async () => {
        console.log('[Gateway] 6秒后最终刷新...');
        await checkGatewayServiceStatus();
        await checkGatewayStatus();
      }, 6000);
    } else {
      // 重启失败，立即更新状态指示器
      console.log('[Gateway] 重启失败，更新状态指示器...');
      
      // 强制更新UI为失败状态（不依赖检测，直接显示错误状态）
      updateGatewayStatusUI({ running: false, error: '重启失败' });
      
      // 然后异步更新系统检查状态
      await checkGatewayServiceStatus();
      await checkGatewayStatus();
      
      // 检查是否是服务未安装导致的失败
      if (result.output && result.output.includes('not loaded') || result.output && result.output.includes('not installed')) {
        setGlobalStatus('Gateway 服务未安装，请先点击 install 按钮安装', 'warning');
        console.log('[Gateway] 服务未安装，提示用户安装');

        // 显示安装提示
        if (confirm('Gateway 服务未安装，无法重启。\n\n是否查看安装说明？')) {
          // 滚动到 install 按钮位置
          const installBtn = document.querySelector('[data-cmd="openclaw gateway install"]');
          if (installBtn) {
            installBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            installBtn.style.animation = 'pulse 1s 3';
            setTimeout(() => {
              installBtn.style.animation = '';
            }, 3000);
          }
        }
      } else {
        setGlobalStatus('Gateway 重启失败: ' + (result.error || '未知错误'), 'error');
        console.error('[Gateway] 重启失败:', result.error);
      }
    }

    return result;
  } catch (error) {
    console.error('[Gateway] 重启失败:', error);
    setGlobalStatus('Gateway 重启失败: ' + error.message, 'error');
    return { success: false, error: error.message };
  }
}

/**
 * 检查更新
 */
async function checkUpdates() {
  try {
    setGlobalStatus('正在检查更新...', 'info');
    console.log('[Update] 开始检查更新...');

    const result = await window.electronAPI.checkUpdates();

    if (result.available) {
      setGlobalStatus(`发现新版本: ${result.latestVersion} (当前: ${result.currentVersion})`, 'info');
      console.log('[Update] 发现新版本:', result.latestVersion);

      // 显示更新提示
      if (confirm(`发现新版本 ${result.latestVersion}\n\n当前版本: ${result.currentVersion}\n\n是否查看更新详情？`)) {
        window.electronAPI.openExternal('https://github.com/your-repo/openclaw-api-switcher/releases');
      }
    } else {
      setGlobalStatus(`当前已是最新版本 (${result.currentVersion})`, 'success');
      console.log('[Update] 当前已是最新版本');
    }

    return result;
  } catch (error) {
    console.error('[Update] 检查更新失败:', error);
    setGlobalStatus('检查更新失败: ' + error.message, 'error');
    return { available: false, error: error.message };
  }
}

console.log('[GatewayManager] Gateway 管理模块已加载');
