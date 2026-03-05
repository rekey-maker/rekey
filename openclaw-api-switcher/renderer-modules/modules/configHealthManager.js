// OpenClaw API Switcher - 配置健康检查模块
// 处理配置健康检查、迁移、清理等功能

// 检测到的 providers 列表
let detectedProviders = [];

// 【v2.7.5】配置检查结果存储（用于配置检查卡片和系统检查共享）
// 注意：此变量在文件顶部声明，不要在函数内重复声明
let lastConfigCheckResult = null;

/**
 * 【v2.7.5】更新 OpenClaw 配置显示（直接在页面中显示）
 * 替代原来的弹窗显示方式
 */
async function updateOpenClawConfigDisplay() {
  const displayEl = document.getElementById('openclaw-config-display');
  if (!displayEl) return;

  try {
    // 【v2.7.5】获取程序配置（从 api-config.json 读取，实时生效）
    const programConfig = await window.electronAPI.loadApiConfig();
    const activeProviderId = programConfig?.activeProvider || null;
    const providers = programConfig?.providers || {};
    
    console.log('[ConfigDisplay] 读取配置:', {
      activeProviderId,
      providerCount: Object.keys(providers).length,
      selectedModel: programConfig?.selectedModel
    });

    // 【v2.7.5】获取 Gateway Token 状态（使用与诊断页相同的检测方式）
    let tokenStatus = { ok: false, message: '未检测' };
    try {
      const tokenCheckResult = await window.electronAPI.checkGatewayTokenStatus();
      console.log('[ConfigDisplay] Token状态检测结果:', tokenCheckResult);
      
      if (tokenCheckResult?.exists && tokenCheckResult?.valid) {
        tokenStatus.ok = true;
        tokenStatus.message = '正常';
      } else if (tokenCheckResult?.status === 'mismatch') {
        tokenStatus.ok = false;
        tokenStatus.message = '不一致';
      } else if (tokenCheckResult?.status === 'missing_token') {
        tokenStatus.ok = false;
        tokenStatus.message = '未配置';
      } else {
        tokenStatus.ok = false;
        tokenStatus.message = '异常';
      }
    } catch (e) {
      console.error('[ConfigDisplay] Token检测失败:', e);
      tokenStatus.message = '未检测';
    }

    let html = '';

    if (!activeProviderId) {
      // 未配置
      html = `
        <div style="text-align: center; padding: 16px 12px; color: var(--text-muted);">
          <div style="font-size: 24px; margin-bottom: 8px;">📝</div>
          <div style="font-size: 12px; margin-bottom: 4px;">未配置</div>
          <div style="font-size: 10px; opacity: 0.6;">请在「API 供应商」页面选择并应用配置</div>
        </div>
      `;
    } else {
      // 已配置，显示详细信息
      const providerConfig = providers[activeProviderId] || {};
      const hasApiKey = !!providerConfig.apiKey && providerConfig.apiKey !== '' && providerConfig.apiKey !== 'e';
      const isLocal = isLocalProvider(providerConfig?.baseUrl);
      // 获取当前选中的模型
      const selectedModel = programConfig?.selectedModel || '';
      const currentModel = selectedModel.split('/')[1] || providerConfig.models?.[0]?.id || '未配置';

      html = `
        <div style="display: flex; flex-direction: column; gap: 6px; padding: 4px 0;">
          <!-- 供应商 -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: #22c55e;"></span>
              <span style="font-size: 12px; color: var(--text-secondary);">供应商</span>
            </div>
            <span style="font-size: 12px; color: #22c55e; font-weight: 500;">${activeProviderId}</span>
          </div>

          <!-- 模型 -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: ${currentModel !== '未配置' ? '#22c55e' : '#ef4444'};"></span>
              <span style="font-size: 12px; color: var(--text-secondary);">模型</span>
            </div>
            <span style="font-size: 12px; color: ${currentModel !== '未配置' ? '#22c55e' : '#ef4444'}; font-weight: 500;">${currentModel}</span>
          </div>

          <!-- API Key -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: ${hasApiKey ? '#22c55e' : '#ef4444'};"></span>
              <span style="font-size: 12px; color: var(--text-secondary);">API Key</span>
            </div>
            <span style="font-size: 12px; color: ${hasApiKey ? '#22c55e' : '#ef4444'}; font-weight: 500;">${hasApiKey ? '已配置' : '未配置'}</span>
          </div>

          <!-- Token -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: ${tokenStatus.ok ? '#22c55e' : '#fbbf24'};"></span>
              <span style="font-size: 12px; color: var(--text-secondary);">Gateway Token</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 12px; color: ${tokenStatus.ok ? '#22c55e' : '#fbbf24'}; font-weight: 500;">${tokenStatus.message}</span>
              ${!tokenStatus.ok && tokenStatus.message === '不一致' ? `<span style="font-size: 10px; color: #fbbf24; opacity: 0.8;">(去诊断页修复)</span>` : ''}
            </div>
          </div>

          <!-- 本地供应商提示 -->
          ${isLocal ? `
          <div style="padding: 6px 8px; background: rgba(6, 182, 212, 0.06); border-radius: 4px; margin-top: 4px;">
            <span style="font-size: 10px; color: #06b6d4;">🏠 本地/局域网供应商，跳过 API 连接测试</span>
          </div>
          ` : ''}
        </div>
      `;
    }

    displayEl.innerHTML = html;
  } catch (error) {
    console.error('[ConfigDisplay] 更新配置显示失败:', error);
    displayEl.innerHTML = `
      <div style="text-align: center; padding: 24px 12px; color: var(--text-muted);">
        <div style="font-size: 13px; margin-bottom: 6px;">加载配置失败</div>
        <div style="font-size: 11px; opacity: 0.7;">${error.message}</div>
      </div>
    `;
  }
}

/**
 * 执行完整的系统健康检查
 * 由右上角"检查"按钮触发
 */
async function performSystemHealthCheck() {
  console.log('[SystemCheck] 开始系统健康检查...');
  
  // 记录检查开始日志
  addLog('info', '开始系统健康检查', {}, 'system');
  setGlobalStatus('正在执行系统健康检查...', 'info');
  
  // 显示检查进度面板
  showCheckProgressPanel();
  
  const checkResults = {
    timestamp: new Date().toISOString(),
    items: [],
    summary: {
      total: 0,
      passed: 0,
      warning: 0,
      failed: 0
    }
  };
  
  // 检查项列表
  // 注意：先检查配置文件，如果配置有问题，Gateway检查会给出相应建议
  const checkItems = [
    { id: 'config', name: 'OpenClaw配置完整性', func: checkProgramConfig },
    { id: 'gateway', name: 'Gateway服务状态', func: checkGatewayService },
    { id: 'openclaw', name: 'OpenClaw配置同步', func: checkOpenClawSync },
    { id: 'apikey', name: 'OpenClaw API密钥有效性', func: checkApiKeyValidity },
    { id: 'backup', name: '备份文件完整性', func: checkBackupIntegrity },
    { id: 'network', name: '网络连接状态', func: checkNetworkConnection }
  ];
  
  checkResults.summary.total = checkItems.length;
  
  // 依次执行检查
  for (let i = 0; i < checkItems.length; i++) {
    const item = checkItems[i];
    updateCheckProgress(i + 1, checkItems.length, item.name);

    try {
      // 对于 Gateway 检查，传入配置检查结果（如果前面已经检查过配置）
      let result;
      if (item.id === 'gateway' && lastConfigCheckResult) {
        result = await item.func(lastConfigCheckResult);
      } else {
        result = await item.func();
      }

      // 保存配置检查结果供后续检查使用
      if (item.id === 'config') {
        lastConfigCheckResult = result;
      }

      checkResults.items.push({
        id: item.id,
        name: item.name,
        status: result.status, // 'passed' | 'warning' | 'failed'
        message: result.message,
        details: result.details || null,
        action: result.action || null
      });
      
      // 更新统计
      if (result.status === 'passed') checkResults.summary.passed++;
      else if (result.status === 'warning') checkResults.summary.warning++;
      else checkResults.summary.failed++;
      
      // 记录日志
      const logLevel = result.status === 'passed' ? 'info' : result.status === 'warning' ? 'warning' : 'error';
      addLog(logLevel, `系统检查 - ${item.name}: ${result.message}`, { status: result.status }, 'system');
      
    } catch (error) {
      console.error(`[SystemCheck] ${item.name} 检查失败:`, error);
      checkResults.items.push({
        id: item.id,
        name: item.name,
        status: 'failed',
        message: '检查过程发生错误',
        details: error.message
      });
      checkResults.summary.failed++;
      addLog('error', `系统检查 - ${item.name}: 检查失败`, { error: error.message }, 'system');
    }
    
    // 短暂延迟，让用户看到进度
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // 隐藏进度面板，显示结果面板
  hideCheckProgressPanel();
  showCheckResultsPanel(checkResults);
  
  // 记录检查完成日志
  const summaryMsg = `系统检查完成: ${checkResults.summary.passed}项通过, ${checkResults.summary.warning}项警告, ${checkResults.summary.failed}项失败`;
  addLog('info', summaryMsg, checkResults.summary, 'system');
  
  // 根据结果设置全局状态
  if (checkResults.summary.failed > 0) {
    setGlobalStatus(`系统检查完成，发现 ${checkResults.summary.failed} 个问题`, 'error');
  } else if (checkResults.summary.warning > 0) {
    setGlobalStatus(`系统检查完成，发现 ${checkResults.summary.warning} 个警告`, 'warning');
  } else {
    setGlobalStatus('系统检查完成，所有项目正常', 'success');
  }
  
  console.log('[SystemCheck] 系统健康检查完成:', checkResults);
  return checkResults;
}

/**
 * 显示检查进度面板
 */
function showCheckProgressPanel() {
  // 创建进度面板（如果不存在）
  let panel = document.getElementById('system-check-progress-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'system-check-progress-panel';
    panel.className = 'system-check-panel';
    panel.innerHTML = `
      <div class="check-panel-header">
        <span class="check-panel-title">🔍 系统健康检查</span>
        <span class="check-panel-close" onclick="hideCheckProgressPanel()">✕</span>
      </div>
      <div class="check-panel-content">
        <div class="check-progress-info">
          <span id="check-progress-text">准备检查...</span>
          <span id="check-progress-count">0/6</span>
        </div>
        <div class="check-progress-bar">
          <div id="check-progress-fill" class="check-progress-fill"></div>
        </div>
        <div id="check-current-item" class="check-current-item">-</div>
      </div>
    `;
    document.body.appendChild(panel);
  }
  
  panel.style.display = 'block';
  // 确保进度面板在最前面
  panel.style.zIndex = '1002';
  
  // 添加动画样式（如果还没有）
  if (!document.getElementById('system-check-styles')) {
    const styles = document.createElement('style');
    styles.id = 'system-check-styles';
    styles.textContent = `
      .system-check-panel {
        position: fixed;
        top: 60px;
        right: 20px;
        width: 320px;
        background: rgba(30, 30, 46, 0.98);
        border: 1px solid rgba(168, 224, 99, 0.3);
        border-radius: 12px;
        padding: 16px;
        z-index: 1002;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        animation: slideInRight 0.3s ease;
      }
      .check-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .check-panel-title {
        font-weight: 600;
        color: #a8e063;
        font-size: 14px;
      }
      .check-panel-close {
        cursor: pointer;
        color: #94a3b8;
        font-size: 16px;
        padding: 4px;
      }
      .check-panel-close:hover {
        color: #f1f5f9;
      }
      .check-progress-info {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 12px;
        color: #94a3b8;
      }
      .check-progress-bar {
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 8px;
      }
      .check-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #a8e063, #56ab2f);
        border-radius: 2px;
        transition: width 0.3s ease;
        width: 0%;
      }
      .check-current-item {
        font-size: 12px;
        color: #f1f5f9;
        min-height: 18px;
      }
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(styles);
  }
}

/**
 * 更新检查进度
 */
function updateCheckProgress(current, total, itemName) {
  const progressText = document.getElementById('check-progress-text');
  const progressCount = document.getElementById('check-progress-count');
  const progressFill = document.getElementById('check-progress-fill');
  const currentItem = document.getElementById('check-current-item');
  
  if (progressText) progressText.textContent = '正在检查...';
  if (progressCount) progressCount.textContent = `${current}/${total}`;
  if (progressFill) progressFill.style.width = `${(current / total) * 100}%`;
  if (currentItem) currentItem.textContent = `⏳ ${itemName}`;
}

/**
 * 隐藏检查进度面板
 */
function hideCheckProgressPanel() {
  const panel = document.getElementById('system-check-progress-panel');
  if (panel) {
    panel.style.display = 'none';
  }
}

/**
 * 显示检查结果面板
 */
function showCheckResultsPanel(results) {
  // 创建结果面板
  let panel = document.getElementById('system-check-results-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'system-check-results-panel';
    panel.className = 'system-check-results-panel';
    document.body.appendChild(panel);
  }
  
  // 生成结果HTML
  const statusIcons = {
    passed: '✅',
    warning: '⚠️',
    failed: '❌'
  };
  
  // 图标颜色样式
  const iconColors = {
    passed: '#4ade80',
    warning: '#f59e0b',
    failed: '#f87171'
  };
  
  const statusColors = {
    passed: '#4ade80',
    warning: '#fbbf24',
    failed: '#f87171'
  };
  
  const itemsHtml = results.items.map(item => `
    <div class="check-result-item" style="border-left-color: ${statusColors[item.status]}">
      <div class="check-result-header">
        <span class="check-result-icon" style="color: ${iconColors[item.status]}">${statusIcons[item.status]}</span>
        <span class="check-result-name">${item.name}</span>
        <span class="check-result-status" style="color: ${statusColors[item.status]}">
          ${item.status === 'passed' ? '通过' : item.status === 'warning' ? '警告' : '失败'}
        </span>
      </div>
      ${item.details ? `<div class="check-result-details">${item.details}</div>` : ''}
      ${item.action ? `<div class="check-result-action">💡 ${item.action}</div>` : ''}
    </div>
  `).join('');
  
  // 确定总体状态
  let overallStatus = 'passed';
  if (results.summary.failed > 0) overallStatus = 'failed';
  else if (results.summary.warning > 0) overallStatus = 'warning';
  
  const overallIcon = statusIcons[overallStatus];
  const overallColor = statusColors[overallStatus];
  const overallText = overallStatus === 'passed' ? '系统状态良好' : overallStatus === 'warning' ? '系统存在警告' : '系统存在问题';
  
  panel.innerHTML = `
    <div class="check-results-header">
      <span class="check-results-title">📋 系统检查结果</span>
      <span class="check-panel-close" onclick="hideCheckResultsPanel()">✕</span>
    </div>
    <div class="check-results-summary" style="border-left-color: ${overallColor}">
      <div class="check-summary-icon" style="color: ${iconColors[overallStatus]}">${overallIcon}</div>
      <div class="check-summary-text">
        <div class="check-summary-title" style="color: ${overallColor}">${overallText}</div>
        <div class="check-summary-stats">
          <span style="color: ${iconColors.passed}">✅</span> ${results.summary.passed} 通过 &nbsp;|&nbsp; 
          <span style="color: ${iconColors.warning}">⚠️</span> ${results.summary.warning} 警告 &nbsp;|&nbsp; 
          <span style="color: ${iconColors.failed}">❌</span> ${results.summary.failed} 失败
        </div>
      </div>
    </div>
    <div class="check-results-list">
      ${itemsHtml}
    </div>
    <div class="check-results-footer">
      <button class="btn btn-sm" onclick="hideCheckResultsPanel()">关闭</button>
      <button class="btn btn-sm btn-primary" onclick="performSystemHealthCheck()">重新检查</button>
    </div>
  `;
  
  panel.style.display = 'block';
  
  // 添加点击外部关闭的事件监听
  setTimeout(() => {
    document.addEventListener('click', handleClickOutsideResultsPanel);
  }, 100);
  
  // 添加结果面板样式
  if (!document.getElementById('system-check-results-styles')) {
    const styles = document.createElement('style');
    styles.id = 'system-check-results-styles';
    styles.textContent = `
      .system-check-results-panel {
        position: fixed;
        top: 60px;
        right: 20px;
        width: 400px;
        max-height: 80vh;
        background: rgba(30, 30, 46, 0.98);
        border: 1px solid rgba(168, 224, 99, 0.3);
        border-radius: 12px;
        z-index: 1001;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        animation: slideInRight 0.3s ease;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .check-results-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .check-results-title {
        font-weight: 600;
        color: #a8e063;
        font-size: 14px;
      }
      .check-results-summary {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        margin: 16px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        border-left: 3px solid;
      }
      .check-summary-icon {
        font-size: 24px;
      }
      .check-summary-title {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 4px;
      }
      .check-summary-stats {
        font-size: 12px;
        color: #94a3b8;
      }
      .check-results-list {
        flex: 1;
        overflow-y: auto;
        padding: 0 16px;
        max-height: 400px;
      }
      .check-result-item {
        padding: 12px;
        margin-bottom: 8px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        border-left: 3px solid;
      }
      .check-result-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }
      .check-result-name {
        flex: 1;
        font-size: 13px;
        color: #f1f5f9;
      }
      .check-result-status {
        font-size: 11px;
        font-weight: 500;
      }
      .check-result-details {
        font-size: 11px;
        color: #94a3b8;
        margin-left: 28px;
        margin-top: 4px;
      }
      .check-result-action {
        font-size: 11px;
        color: #a8e063;
        margin-left: 28px;
        margin-top: 6px;
        padding: 6px 10px;
        background: rgba(168, 224, 99, 0.1);
        border-radius: 4px;
        border-left: 2px solid #a8e063;
      }
      .check-results-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
    `;
    document.head.appendChild(styles);
  }
}

/**
 * 隐藏检查结果面板
 */
function hideCheckResultsPanel() {
  const panel = document.getElementById('system-check-results-panel');
  if (panel) {
    panel.style.display = 'none';
  }
  // 移除点击外部关闭的事件监听
  document.removeEventListener('click', handleClickOutsideResultsPanel);
}

/**
 * 处理点击结果面板外部的事件
 */
function handleClickOutsideResultsPanel(event) {
  const panel = document.getElementById('system-check-results-panel');
  if (panel && panel.style.display === 'block') {
    // 检查点击是否在面板外部
    if (!panel.contains(event.target)) {
      hideCheckResultsPanel();
    }
  }
}

// ============ 具体检查项实现 ============

/**
 * 检查 Gateway 服务状态
 * @param {Object} configCheckResult - 配置文件检查结果（如果有）
 */
async function checkGatewayService(configCheckResult = null) {
  try {
    setGlobalStatus('正在检查 Gateway 服务状态...', 'info');
    addLog('info', '开始检查 Gateway 服务状态', {}, 'system');

    // 检查配置文件是否有问题（空字段、损坏等）
    const hasConfigIssue = configCheckResult &&
      (configCheckResult.status === 'warning' || configCheckResult.status === 'failed');
    const hasEmptyFields = configCheckResult &&
      configCheckResult.message &&
      configCheckResult.message.includes('空字段');

    if (hasConfigIssue) {
      console.log('[checkGatewayService] 检测到配置问题:', configCheckResult.message);
    }

    const status = await window.electronAPI.getGatewayStatus();
    
    // 情况1: Gateway 正在运行
    if (status.running) {
      const version = status.version || '未知版本';
      const port = status.port || '默认端口';
      const msg = `Gateway 服务运行正常 (${version})`;
      
      setGlobalStatus(msg, 'success');
      addLog('success', 'Gateway 服务检查通过', {
        running: true,
        version: version,
        port: port,
        pid: status.pid
      }, 'system');
      
      return {
        status: 'passed',
        message: 'Gateway 服务运行正常',
        details: `版本: ${version}${port !== '默认端口' ? `, 端口: ${port}` : ''}`,
        action: null
      };
    }
    
    // 情况2: Gateway 未运行，但有错误信息
    if (status.error) {
      const errorMsg = status.error;
      let action;
      let logLevel = 'warning';

      // 如果配置文件有空字段或其他问题，优先建议修复配置
      if (hasEmptyFields) {
        action = '检测到配置文件存在空字段，这是导致 Gateway 无法启动的原因。建议：1) 添加 API 供应商后点击「应用配置」，会自动修复 OpenClaw 配置；2) 然后运行 "openclaw gateway" 启动服务';
        logLevel = 'warning';
      } else if (hasConfigIssue) {
        action = '检测到配置文件异常。建议：1) 添加 API 供应商后点击「应用配置」，会自动修复 OpenClaw 配置；2) 然后运行 "openclaw gateway" 启动服务';
        logLevel = 'warning';
      } else {
        // 配置文件正常，根据错误类型提供建议
        if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('Connection refused')) {
          action = 'Gateway 服务未启动，建议：1) 运行 "openclaw gateway" 启动服务；2) 如仍有问题，运行 "openclaw doctor --fix" 修复';
          logLevel = 'warning';
        } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
          action = 'Gateway 响应超时，建议：1) 运行 "openclaw doctor --fix" 修复；2) 或重启 Gateway 服务';
          logLevel = 'warning';
        } else if (errorMsg.includes('not found') || errorMsg.includes('ENOENT')) {
          action = '未找到 Gateway 程序，建议：1) 运行 "openclaw install" 重新安装；2) 或 "openclaw doctor --fix" 修复环境';
          logLevel = 'error';
        } else if (errorMsg.includes('port') || errorMsg.includes('EADDRINUSE')) {
          action = '端口被占用，建议：运行 "openclaw doctor --fix" 自动修复端口冲突';
          logLevel = 'error';
        } else if (errorMsg.includes('permission') || errorMsg.includes('EACCES')) {
          action = '权限不足，建议：运行 "openclaw doctor --fix" 修复权限，或以管理员身份运行';
          logLevel = 'error';
        } else {
          action = '建议：1) 运行 "openclaw gateway" 启动服务；2) 如仍有问题，运行 "openclaw doctor --fix" 修复';
        }
      }

      setGlobalStatus(`Gateway 服务异常: ${errorMsg}`, logLevel);
      addLog(logLevel, 'Gateway 服务未运行', {
        running: false,
        error: errorMsg,
        hasConfigIssue,
        hasEmptyFields,
        action: action
      }, 'system');

      return {
        status: 'failed',
        message: 'Gateway 服务未运行',
        details: errorMsg,
        action: action
      };
    }

    // 情况3: Gateway 未运行，无具体错误
    const msg = 'Gateway 服务未运行，可能未启动或未安装';
    setGlobalStatus(msg, 'warning');
    addLog('warning', 'Gateway 服务未运行', {
      running: false,
      reason: '服务未启动',
      hasConfigIssue,
      hasEmptyFields
    }, 'system');

    // 根据配置状态给出建议
    let action;
    if (hasEmptyFields) {
      action = '检测到配置文件存在空字段。建议：1) 添加 API 供应商后点击「应用配置」，会自动修复 OpenClaw 配置；2) 然后运行 "openclaw gateway" 启动服务';
    } else if (hasConfigIssue) {
      action = '建议：1) 添加 API 供应商后点击「应用配置」，会自动修复 OpenClaw 配置；2) 运行 "openclaw gateway" 启动服务';
    } else {
      action = '建议：1) 运行 "openclaw gateway" 启动服务；2) 如仍有问题，运行 "openclaw doctor --fix" 修复';
    }

    return {
      status: 'failed',
      message: 'Gateway 服务未运行',
      details: '服务未启动或未安装',
      action: action
    };
    
  } catch (error) {
    const errorMsg = error.message || '未知错误';
    setGlobalStatus(`检查 Gateway 状态失败: ${errorMsg}`, 'error');
    addLog('error', '检查 Gateway 服务时发生异常', { error: errorMsg }, 'system');
    
    return {
      status: 'failed',
      message: '无法获取 Gateway 状态',
      details: errorMsg,
      action: '请查看日志获取详细信息，或尝试重启程序'
    };
  }
}

/**
 * 检查 OpenClaw 配置文件完整性
 * 检查 ~/.openclaw/ 目录下的配置文件
 */
async function checkProgramConfig() {
  try {
    setGlobalStatus('正在检查 OpenClaw 配置文件...', 'info');
    addLog('info', '开始检查 OpenClaw 配置文件完整性', { path: '~/.openclaw/' }, 'system');
    
    const result = await window.electronAPI.checkOpenClawIntegrity();
    
    if (!result.success) {
      const errorMsg = result.error || '未知错误';
      setGlobalStatus(`OpenClaw 配置检查失败: ${errorMsg}`, 'error');
      addLog('error', 'OpenClaw 配置文件检查失败', { error: errorMsg }, 'system');
      return {
        status: 'failed',
        message: '无法检查 OpenClaw 配置',
        details: errorMsg,
        action: '请检查程序权限或重新安装 OpenClaw'
      };
    }
    
    const { files, missingFields, totalFields, emptyFields = [], validFields = 0 } = result;
    const existingFiles = Object.values(files).filter(f => f.exists);
    const fileCount = existingFiles.length;

    console.log('[checkProgramConfig] IPC 返回结果:', { emptyFields, validFields, totalFields, missingFields });

    addLog('info', 'OpenClaw 配置文件检查结果', {
      totalFiles: Object.keys(files).length,
      existingFiles: fileCount,
      missingFields: missingFields.length,
      emptyFields: emptyFields.length,
      validFields: validFields,
      totalFields: totalFields
    }, 'system');
    
    // 情况1: 关键文件不存在（OpenClaw 未安装）
    const criticalFiles = ['openclaw.json'];
    const missingCriticalFiles = criticalFiles.filter(f => !files[f] || !files[f].exists);
    
    if (missingCriticalFiles.length > 0) {
      const msg = `OpenClaw 未安装: 缺少 ${missingCriticalFiles.join(', ')}`;
      const action = '建议运行 "openclaw doctor --fix" 自动修复环境，或 "openclaw install" 重新安装';
      setGlobalStatus(msg, 'warning');
      addLog('warning', msg, { missingFiles: missingCriticalFiles, action }, 'system');
      return {
        status: 'warning',
        message: 'OpenClaw 未安装或配置目录不存在',
        details: `缺少关键文件: ${missingCriticalFiles.join(', ')}`,
        action: action
      };
    }

    const openclawFile = files['openclaw.json'];

    // 情况2: 配置文件为空
    if (openclawFile.exists && openclawFile.isEmpty) {
      const msg = 'OpenClaw 配置文件为空，需要初始化';
      const action = '建议运行 "openclaw doctor --fix" 自动修复，或使用本程序配置 API 后应用配置';
      setGlobalStatus(msg, 'warning');
      addLog('warning', msg, { path: openclawFile.path, action }, 'system');
      return {
        status: 'warning',
        message: 'OpenClaw 配置文件为空',
        details: '配置文件存在但没有内容，可能是初次安装',
        action: action
      };
    }

    // 情况3: JSON 格式错误（文件损坏）
    if (openclawFile.exists && !openclawFile.isValidJson) {
      const msg = 'OpenClaw 配置文件格式错误，需要修复';
      const action = '建议运行 "openclaw doctor --fix" 自动修复，或从备份恢复配置';
      setGlobalStatus(msg, 'error');
      addLog('error', msg, { path: openclawFile.path, action }, 'system');
      return {
        status: 'failed',
        message: 'OpenClaw 配置文件损坏',
        details: 'JSON 格式不正确，无法解析',
        action: action
      };
    }

    // 情况4: 缺少必要字段（配置不完整）
    if (missingFields.length > 0) {
      const msg = `OpenClaw 配置不完整，缺少 ${missingFields.length} 个必要字段`;
      const action = '建议：添加 API 供应商后点击「应用配置」，会自动修复 OpenClaw 配置';
      setGlobalStatus(msg, 'warning');
      addLog('warning', msg, { missingFields: missingFields, action }, 'system');
      return {
        status: 'warning',
        message: `配置不完整，缺少 ${missingFields.length} 个必要字段`,
        details: `缺失字段: ${missingFields.join(', ')}`,
        action: action
      };
    }

    // 情况4b: 检查空字段（字段存在但内容为空）
    // 注意：空字段通常是由本程序写入导致的，所以优先推荐用本程序修复
    if (emptyFields.length > 0) {
      const msg = `OpenClaw 配置存在 ${emptyFields.length} 个空字段（由程序写入导致）`;
      const action = '建议：使用本程序配置 API 后点击"应用配置"，或运行 "openclaw doctor --fix" 清理';
      setGlobalStatus(msg, 'warning');
      addLog('warning', msg, { emptyFields: emptyFields, action, source: '程序写入' }, 'system');
      return {
        status: 'warning',
        message: `配置存在空字段`,
        details: `空字段: ${emptyFields.join(', ')}（建议用本程序重新配置）`,
        action: action
      };
    }

    // 情况5: 检查是否有有效的 providers（配置是否有效）
    if (validFields === 0) {
      const msg = 'OpenClaw 配置结构正常，但未配置有效供应商';
      const action = '建议：使用本程序配置 API 后点击"应用配置"，或运行 "openclaw doctor --fix" 检查';
      setGlobalStatus(msg, 'warning');
      addLog('warning', msg, { fileCount, totalFields, validFields, action }, 'system');
      return {
        status: 'warning',
        message: '配置结构正常（无有效供应商）',
        details: `已检查 ${fileCount} 个文件，${totalFields} 个字段，但未发现有效供应商配置`,
        action: action
      };
    }
    
    // ========== 【新增】Gateway Token 检查 ==========
    try {
      const tokenCheckResult = await window.electronAPI.checkGatewayTokenStatus();
      
      if (!tokenCheckResult.exists) {
        const msg = 'Gateway Token 不存在';
        const action = '建议：运行 "openclaw gateway install --force" 重新安装 Gateway';
        setGlobalStatus(msg, 'warning');
        addLog('warning', msg, { action }, 'system');
        return {
          status: 'warning',
          message: 'Gateway Token 不存在',
          details: '配置文件中没有 Gateway Token',
          action: action
        };
      }
      
      if (!tokenCheckResult.valid) {
        let msg = 'Gateway Token 异常';
        let action = '建议运行 "openclaw gateway install --force" 重新安装 Gateway';
        
        if (tokenCheckResult.status === 'mismatch') {
          msg = 'Gateway Token 不一致（auth.token ≠ remote.token）';
          action = '建议：使用本程序"应用配置"功能自动同步 Token，或运行 "openclaw gateway install --force" 重装';
        } else if (tokenCheckResult.status === 'wrong_mode') {
          msg = 'Gateway 认证模式不正确';
          action = '建议：使用本程序"应用配置"功能自动修复，或运行 "openclaw config set gateway.auth.mode token"';
        }
        
        setGlobalStatus(msg, 'warning');
        addLog('warning', msg, { 
          status: tokenCheckResult.status,
          details: tokenCheckResult.details,
          action 
        }, 'system');
        
        return {
          status: 'warning',
          message: msg,
          details: tokenCheckResult.message,
          action: action
        };
      }
      
      // Token 正常，记录日志
      addLog('info', 'Gateway Token 检查通过', {
        status: tokenCheckResult.status,
        details: tokenCheckResult.details
      }, 'system');
      
    } catch (tokenError) {
      console.error('[checkProgramConfig] Gateway Token 检查失败:', tokenError);
      addLog('warning', 'Gateway Token 检查失败', { error: tokenError.message }, 'system');
      // Token 检查失败不阻断整体检查，继续后续检查
    }
    
    // 情况6: 所有检查通过
    const msg = `OpenClaw 配置完整，包含 ${validFields} 个供应商`;
    setGlobalStatus(msg, 'success');
    addLog('success', 'OpenClaw 配置文件检查通过', {
      fileCount,
      totalFields,
      validFields,
      files: Object.keys(files).filter(k => files[k].exists)
    }, 'system');

    return {
      status: 'passed',
      message: `OpenClaw 配置完整`,
      details: `已检查 ${fileCount} 个文件，${totalFields} 个字段，${validFields} 个供应商`
    };
    
  } catch (error) {
    const errorMsg = error.message || '未知错误';
    setGlobalStatus(`检查 OpenClaw 配置失败: ${errorMsg}`, 'error');
    addLog('error', '检查 OpenClaw 配置文件时发生异常', { error: errorMsg }, 'system');
    return {
      status: 'failed',
      message: '检查 OpenClaw 配置完整性失败',
      details: errorMsg,
      action: '请查看日志获取详细信息，或尝试重启程序'
    };
  }
}

/**
 * 检查 OpenClaw 配置同步状态
 */
async function checkOpenClawSync() {
  try {
    const result = await window.electronAPI.checkOpenClawConfig({ source: 'health-check' });
    
    if (!result.success) {
      return {
        status: 'warning',
        message: '无法检查 OpenClaw 配置',
        details: result.message
      };
    }
    
    const apiConfig = await window.electronAPI.loadApiConfig();
    const programProviders = apiConfig?.providers ? Object.keys(apiConfig.providers) : [];
    const openclawProviders = result.providers || [];
    
    if (openclawProviders.length === 0) {
      return {
        status: 'passed',
        message: 'OpenClaw 配置干净（无冗余）',
        details: null
      };
    }
    
    // 检查 OpenClaw 中是否有程序中没有的配置（冗余配置）
    const redundantProviders = openclawProviders.filter(op => !programProviders.includes(op.id));
    
    if (redundantProviders.length === 0) {
      // OpenClaw 中没有冗余配置，这是正常状态
      if (openclawProviders.length === programProviders.length) {
        return {
          status: 'passed',
          message: 'OpenClaw 配置已同步',
          details: `${openclawProviders.length} 个供应商已同步`
        };
      } else {
        // 程序中有更多配置，这是正常情况（未同步到 OpenClaw）
        return {
          status: 'passed',
          message: 'OpenClaw 配置干净（无冗余）',
          details: `程序中有 ${programProviders.length} 个配置，OpenClaw 中有 ${openclawProviders.length} 个配置`
        };
      }
    } else {
      // OpenClaw 中有程序没有的配置，这是冗余配置
      return {
        status: 'warning',
        message: `OpenClaw 存在 ${redundantProviders.length} 个冗余配置`,
        details: `冗余配置: ${redundantProviders.map(p => p.id).join(', ')}`
      };
    }
  } catch (error) {
    return {
      status: 'failed',
      message: '检查 OpenClaw 同步状态失败',
      details: error.message
    };
  }
}

/**
 * 检查 API Key 有效性
 * 检查 OpenClaw 的 auth-profiles.json 中的真实 API Key 是否有效
 * 注意：openclaw.json 中的 apiKey 是占位符 'e'，真实密钥存储在 auth-profiles.json
 */
async function checkApiKeyValidity() {
  try {
    // 使用专门的 IPC 检查 API Key（从 auth-profiles.json 读取）
    const result = await window.electronAPI.checkOpenClawApiKeys();
    
    if (!result || !result.success) {
      return {
        status: 'warning',
        message: '无法检查 OpenClaw API 密钥',
        details: result?.message || '请检查 OpenClaw 是否正确安装'
      };
    }
    
    // 【v2.7.5 修复】使用正确的字段名
    const providers = result.providers || [];
    const summary = result.summary || { total: 0, valid: 0, placeholder: 0, missing: 0 };
    
    // 【调试日志】
    console.log('[checkApiKeyValidity] 收到结果:', {
      providersCount: providers.length,
      providers: providers.map(p => ({ id: p.id, status: p.status })),
      summary
    });
    
    if (providers.length === 0) {
      console.log('[checkApiKeyValidity] 没有配置供应商');
      return {
        status: 'warning',
        message: 'OpenClaw 未配置任何供应商',
        details: '请在 OpenClaw 中配置 API 供应商'
      };
    }
    
    // 从 providers 数组中提取各类密钥
    const missingKeys = providers.filter(p => p.status === 'missing').map(p => p.id);
    const placeholderKeys = providers.filter(p => p.status === 'placeholder').map(p => p.id);
    const validKeys = providers.filter(p => p.status === 'valid').map(p => p.id);
    
    // 【调试日志】
    console.log('[checkApiKeyValidity] 分类结果:', {
      missingKeys,
      placeholderKeys,
      validKeys
    });
    
    // 优先显示最严重的问题
    if (missingKeys.length > 0) {
      return {
        status: 'failed',
        message: `OpenClaw 中 ${missingKeys.length} 个供应商未设置 API 密钥`,
        details: `auth-profiles.json 中缺少: ${missingKeys.join(', ')}`
      };
    }

    if (placeholderKeys.length > 0) {
      return {
        status: 'warning',
        message: `OpenClaw 中 ${placeholderKeys.length} 个供应商使用无效 API 密钥`,
        details: `auth-profiles.json 中使用占位符或密钥过短: ${placeholderKeys.join(', ')}`
      };
    }

    return {
      status: 'passed',
      message: `OpenClaw 中 ${validKeys.length} 个供应商 API 密钥有效`,
      details: 'auth-profiles.json 中的真实密钥格式正确'
    };
  } catch (error) {
    return {
      status: 'failed',
      message: '无法检查 OpenClaw API 密钥',
      details: `检查 auth-profiles.json 时出错: ${error.message}`
    };
  }
}

/**
 * 检查备份文件完整性
 */
async function checkBackupIntegrity() {
  try {
    // 检查备份目录是否存在 - 使用 list-backups API
    const backupList = await window.electronAPI.listBackups();
    
    if (Array.isArray(backupList)) {
      const backupCount = backupList.length;
      
      if (backupCount > 0) {
        return {
          status: 'passed',
          message: `备份功能正常，共有 ${backupCount} 个备份`,
          details: null
        };
      } else {
        return {
          status: 'warning',
          message: '暂无备份文件',
          details: '建议定期备份配置'
        };
      }
    } else {
      return {
        status: 'warning',
        message: '无法读取备份列表',
        details: '备份列表格式异常'
      };
    }
  } catch (error) {
    return {
      status: 'failed',
      message: '检查备份完整性失败',
      details: error.message
    };
  }
}

/**
 * 检查网络连接状态
 */
async function checkNetworkConnection() {
  try {
    // 简单检查：尝试获取 Gateway 状态即可间接验证网络
    const status = await window.electronAPI.getGatewayStatus();
    
    if (status.running) {
      return {
        status: 'passed',
        message: '网络连接正常',
        details: 'Gateway 服务可访问'
      };
    } else {
      return {
        status: 'warning',
        message: '无法确认网络状态',
        details: 'Gateway 未运行，无法验证网络连接'
      };
    }
  } catch (error) {
    return {
      status: 'warning',
      message: '网络检查受限',
      details: '无法验证网络连接状态'
    };
  }
}

/**
 * 检查 API 配置健康状态
 */
async function checkConfigHealth() {
  console.log('[ConfigHealth] 开始检查配置健康...');
  
  const programDot = document.getElementById('health-program-dot');
  const programValue = document.getElementById('health-program-value');
  const openclawDot = document.getElementById('health-openclaw-dot');
  const openclawValue = document.getElementById('health-openclaw-value');
  const healthStatusMessage = document.getElementById('health-status-message');
  const healthActionSection = document.getElementById('health-action-section');
  const migrateSection = document.getElementById('migrate-section');
  const cleanupSection = document.getElementById('cleanup-section');
  const cleanupProviderList = document.getElementById('cleanup-provider-list');
  const healthActionResult = document.getElementById('health-action-result');
  
  console.log('[ConfigHealth] 元素检查:', {
    programDot: !!programDot,
    programValue: !!programValue,
    openclawDot: !!openclawDot,
    openclawValue: !!openclawValue
  });
  
  // 显示开始检查的状态
  setGlobalStatus('正在扫描 API 配置...', 'info');
  
  // 重置状态 - 检查中（黄色脉冲）
  if (programDot) {
    programDot.style.background = 'var(--warning)';
    programDot.style.boxShadow = '0 0 8px var(--warning)';
  }
  if (programValue) {
    programValue.textContent = '检测中...';
    programValue.style.color = 'var(--warning)';
  }
  if (openclawDot) {
    openclawDot.style.background = 'var(--warning)';
    openclawDot.style.boxShadow = '0 0 8px var(--warning)';
  }
  if (openclawValue) {
    openclawValue.textContent = '检测中...';
    openclawValue.style.color = 'var(--warning)';
  }
  if (healthStatusMessage) healthStatusMessage.style.display = 'none';
  if (healthActionSection) healthActionSection.style.display = 'none';
  if (migrateSection) migrateSection.style.display = 'none';
  if (cleanupSection) cleanupSection.style.display = 'none';
  if (healthActionResult) healthActionResult.style.display = 'none';
  detectedProviders = [];
  
  try {
    // 检查程序配置
    setGlobalStatus('正在检查程序配置...', 'info');
    const apiConfig = await window.electronAPI.loadApiConfig();
    const hasProgramConfig = apiConfig && apiConfig.providers && Object.keys(apiConfig.providers).length > 0;
    
    console.log('[ConfigHealth] 程序配置检查:', {
      hasProgramConfig,
      apiConfigExists: !!apiConfig,
      providersExists: !!(apiConfig && apiConfig.providers),
      providerCount: apiConfig && apiConfig.providers ? Object.keys(apiConfig.providers).length : 0
    });
    
    if (programDot) {
      programDot.style.background = hasProgramConfig ? 'var(--success)' : 'var(--error)';
      programDot.style.boxShadow = hasProgramConfig ? '0 0 8px var(--success)' : '0 0 8px var(--error)';
    }
    if (programValue) {
      programValue.textContent = hasProgramConfig ? Object.keys(apiConfig.providers).length + ' 个供应商' : '未配置';
      programValue.style.color = hasProgramConfig ? 'var(--success)' : 'var(--error)';
    }
    
    // 检查 OpenClaw 配置（只检查不清理）
    setGlobalStatus('正在检查 OpenClaw 配置...', 'info');
    const checkResult = await window.electronAPI.checkOpenClawConfig({ source: 'health-check' });
    detectedProviders = checkResult.providers || [];
    
    if (!checkResult.success) {
      // 检查失败
      if (openclawDot) {
        openclawDot.style.background = 'var(--error)';
        openclawDot.style.boxShadow = '0 0 8px var(--error)';
      }
      if (openclawValue) {
        openclawValue.textContent = '检查失败';
        openclawValue.style.color = 'var(--error)';
      }
      setGlobalStatus('API配置检查失败: ' + checkResult.message, 'error');
      return;
    }
    
    // 判断状态并显示相应提示
    if (detectedProviders.length === 0) {
      // 无 OpenClaw 配置
      if (openclawDot) {
        openclawDot.style.background = 'var(--success)';
        openclawDot.style.boxShadow = '0 0 8px var(--success)';
      }
      if (openclawValue) {
        openclawValue.textContent = '无配置';
        openclawValue.style.color = 'var(--success)';
      }
      
      if (hasProgramConfig) {
        showHealthStatus('normal', '✓ 配置正常，程序配置已存在');
        setGlobalStatus('✓ 配置扫描完成：程序配置正常，OpenClaw 无配置，可随时迁移', 'success');
      } else {
        showHealthStatus('normal', '💡 新用户，请添加 API 供应商');
        setGlobalStatus('💡 配置扫描完成：欢迎使用！请添加您的第一个 API 供应商', 'info');
      }
    } else {
      // 发现 OpenClaw 配置
      const hasUnknownProviders = detectedProviders.some(p => !isPredefinedProvider(p.id));
      
      if (!hasProgramConfig) {
        // 新用户，有可迁移的配置 - 先检查配置完整性
        setGlobalStatus('正在检查 OpenClaw 配置完整性...', 'info');
        const integrityResult = await window.electronAPI.checkOpenClawIntegrity();
        const hasIssues = integrityResult.emptyFields?.length > 0 || integrityResult.missingFields?.length > 0;
        
        if (openclawDot) {
          openclawDot.style.background = hasIssues ? 'var(--warning)' : 'var(--info)';
          openclawDot.style.boxShadow = hasIssues ? '0 0 8px var(--warning)' : '0 0 8px var(--info)';
        }
        if (openclawValue) {
          openclawValue.textContent = hasIssues ? detectedProviders.length + ' 个（需修复）' : detectedProviders.length + ' 个可迁移';
          openclawValue.style.color = hasIssues ? 'var(--warning)' : 'var(--info)';
        }
        
        const providerNames = detectedProviders.map(p => p.name).join('、');
        
        if (hasIssues) {
          // 配置有严重问题，引导用户重新配置而不是迁移
          const issueCount = (integrityResult.emptyFields?.length || 0) + (integrityResult.missingFields?.length || 0);
          showHealthStatus('error', '检测到 ' + detectedProviders.length + ' 个配置，但发现 ' + issueCount + ' 个严重问题');
          setGlobalStatus('🔶 OpenClaw 配置存在 ' + issueCount + ' 个问题（空字段或缺失字段），建议重新配置而不是迁移。点击下方【配置API】按钮重新配置', 'error');
          
          // 显示配置API按钮而不是迁移按钮
          if (healthActionSection) healthActionSection.style.display = 'block';
          if (migrateSection) {
            migrateSection.style.display = 'block';
            // 修改迁移区域的提示和按钮
            migrateSection.innerHTML = `
              <div style="margin-bottom: 10px; color: var(--error); font-weight: 500;">
                ⚠️ 检测到配置问题
              </div>
              <div style="margin-bottom: 12px; color: var(--text-secondary); font-size: 12px;">
                OpenClaw 配置存在 ${issueCount} 个问题。建议添加 API 供应商后点击「应用配置」，会自动修复 OpenClaw 配置
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-sm btn-primary" id="btn-config-api-instead" style="flex: 1;">
                  ⚙️ 配置API
                </button>
                <button class="btn btn-sm" id="btn-force-migrate" style="flex: 1; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); color: #f59e0b;">
                  ⚠️ 强制迁移
                </button>
              </div>
            `;
            
            // 绑定配置API按钮
            const configApiBtn = document.getElementById('btn-config-api-instead');
            if (configApiBtn) {
              configApiBtn.addEventListener('click', () => {
                if (typeof openNewProviderModal === 'function') {
                  openNewProviderModal();
                } else {
                  setGlobalStatus('无法打开配置对话框', 'error');
                }
              });
            }
            
            // 绑定强制迁移按钮
            const forceMigrateBtn = document.getElementById('btn-force-migrate');
            if (forceMigrateBtn) {
              forceMigrateBtn.addEventListener('click', () => {
                if (confirm('配置存在问题，强制迁移可能导致部分功能异常。确定要继续吗？')) {
                  migrateOpenClawConfig();
                }
              });
            }
          }
          
          // 自动打开配置检查卡片显示详细问题
          setTimeout(() => {
            const configCheckCard = document.querySelector('.config-check-card');
            if (configCheckCard) {
              configCheckCard.scrollIntoView({ behavior: 'smooth' });
            }
          }, 100);
        } else if (hasUnknownProviders) {
          // 有异常配置，显示警告但允许迁移
          const unknownProviders = detectedProviders.filter(p => !isPredefinedProvider(p.id));
          showHealthStatus('warning', '检测到 ' + detectedProviders.length + ' 个配置（含 ' + unknownProviders.length + ' 个未知供应商）');
          setGlobalStatus('📥 扫描完成：检测到 ' + detectedProviders.length + ' 个配置（' + providerNames + '），含 ' + unknownProviders.length + ' 个未知供应商，点击【迁移配置】导入', 'warning');
          
          if (healthActionSection) healthActionSection.style.display = 'block';
          if (migrateSection) migrateSection.style.display = 'block';
        } else {
          showHealthStatus('info', '检测到 ' + detectedProviders.length + ' 个可迁移的配置');
          setGlobalStatus('📥 扫描完成：检测到 ' + detectedProviders.length + ' 个可迁移配置（' + providerNames + '），点击【迁移配置】按钮导入', 'info');
          
          if (healthActionSection) healthActionSection.style.display = 'block';
          if (migrateSection) migrateSection.style.display = 'block';
        }
      } else if (hasUnknownProviders) {
        // 已有程序配置，发现异常配置（不在预定义列表中）
        if (openclawDot) {
          openclawDot.style.background = 'var(--warning)';
          openclawDot.style.boxShadow = '0 0 8px var(--warning)';
        }
        if (openclawValue) {
          openclawValue.textContent = detectedProviders.length + ' 个异常';
          openclawValue.style.color = 'var(--warning)';
        }
        
        const unknownProviders = detectedProviders.filter(p => !isPredefinedProvider(p.id));
        showHealthStatus('warning', '⚠️ 发现 ' + unknownProviders.length + ' 个异常配置，建议清理后重新配置');
        
        if (healthActionSection) healthActionSection.style.display = 'block';
        if (cleanupSection) cleanupSection.style.display = 'block';
        if (cleanupProviderList) {
          cleanupProviderList.innerHTML = unknownProviders.map(p => '• ' + p.name + ' (' + p.id + ')').join('<br>');
        }
        
        const unknownNames = unknownProviders.map(p => p.name).join('、');
        setGlobalStatus('🔶 扫描完成：发现 ' + unknownProviders.length + ' 个异常配置（' + unknownNames + '），建议清理后重新配置', 'warning');
      } else {
        // 配置正常，但 OpenClaw 中有冗余
        if (openclawDot) {
          openclawDot.style.background = 'var(--success)';
          openclawDot.style.boxShadow = '0 0 8px var(--success)';
        }
        if (openclawValue) {
          openclawValue.textContent = '已同步';
          openclawValue.style.color = 'var(--success)';
        }
        
        // 如果有程序配置，不显示迁移提醒卡片（用户已经配置好了）
        if (hasProgramConfig) {
          showHealthStatus('normal', '✓ 配置已同步');
          
          // 显示管理配置按钮（在扫描配置按钮旁边）
          const btnManageMigration = document.getElementById('btn-manage-migration');
          if (btnManageMigration) {
            btnManageMigration.style.display = 'inline-block';
          }
          
          // 隐藏操作区域（不再提醒用户）
          if (healthActionSection) healthActionSection.style.display = 'none';
          if (migrateSection) migrateSection.style.display = 'none';
          
          setGlobalStatus('✓ 扫描完成：配置已同步，程序配置和 OpenClaw 配置一致', 'success');
        } else {
          // 没有程序配置，显示迁移提示
          showHealthStatus('normal', '✓ 配置已同步，可随时重新迁移');
          
          // 显示管理配置按钮（在扫描配置按钮旁边）
          const btnManageMigration = document.getElementById('btn-manage-migration');
          if (btnManageMigration) {
            btnManageMigration.style.display = 'inline-block';
          }
          
          // 配置已同步，隐藏大按钮区域，只保留提示文字
          if (healthActionSection) healthActionSection.style.display = 'block';
          if (migrateSection) {
            migrateSection.style.display = 'block';
            // 更新提示文字
            const migrateTip = migrateSection.querySelector('div:first-child');
            if (migrateTip) {
              migrateTip.textContent = '💡 可随时重新迁移或更新配置';
            }
            // 隐藏大按钮和暂不迁移按钮
            const btnMigrateOpenclaw = document.getElementById('btn-migrate-openclaw');
            const btnDismissMigration = document.getElementById('btn-dismiss-migration');
            if (btnMigrateOpenclaw) btnMigrateOpenclaw.style.display = 'none';
            if (btnDismissMigration) btnDismissMigration.style.display = 'none';
          }
          
          const syncedProviderNames = detectedProviders.map(p => p.name).join('、');
          setGlobalStatus('✓ 扫描完成：配置已同步（' + syncedProviderNames + '），点击【迁移配置】按钮可重新配置', 'success');
        }
      }
    }
  } catch (error) {
    console.error('[ConfigHealth] API配置检查失败:', error);
    if (programDot) {
      programDot.style.background = 'var(--error)';
      programDot.style.boxShadow = '0 0 8px var(--error)';
    }
    if (programValue) {
      programValue.textContent = '检查失败';
      programValue.style.color = 'var(--error)';
    }
    if (openclawDot) {
      openclawDot.style.background = 'var(--error)';
      openclawDot.style.boxShadow = '0 0 8px var(--error)';
    }
    if (openclawValue) {
      openclawValue.textContent = '检查失败';
      openclawValue.style.color = 'var(--error)';
    }
    setGlobalStatus('✗ 配置扫描失败：' + (error.message || '未知错误') + '，请检查程序日志', 'error');
  }
  
  console.log('[ConfigHealth] 配置健康检查完成');
}

/**
 * 显示健康状态提示
 * @param {string} type - 状态类型 (normal | info | warning | error)
 * @param {string} message - 提示消息
 */
function showHealthStatus(type, message) {
  const healthStatusMessage = document.getElementById('health-status-message');
  if (!healthStatusMessage) return;
  
  healthStatusMessage.textContent = message;
  healthStatusMessage.style.display = 'block';
  
  // 根据类型设置颜色
  switch (type) {
    case 'normal':
      healthStatusMessage.style.background = 'rgba(34, 197, 94, 0.1)';
      healthStatusMessage.style.color = 'var(--success)';
      healthStatusMessage.style.borderLeft = '3px solid var(--success)';
      break;
    case 'info':
      healthStatusMessage.style.background = 'rgba(59, 130, 246, 0.1)';
      healthStatusMessage.style.color = 'var(--info)';
      healthStatusMessage.style.borderLeft = '3px solid var(--info)';
      break;
    case 'warning':
      healthStatusMessage.style.background = 'rgba(234, 179, 8, 0.1)';
      healthStatusMessage.style.color = 'var(--warning)';
      healthStatusMessage.style.borderLeft = '3px solid var(--warning)';
      break;
    case 'error':
      healthStatusMessage.style.background = 'rgba(239, 68, 68, 0.1)';
      healthStatusMessage.style.color = 'var(--error)';
      healthStatusMessage.style.borderLeft = '3px solid var(--error)';
      break;
  }
}

/**
 * 检查是否为预定义供应商
 * @param {string} providerId - 供应商ID
 * @returns {boolean} 是否为预定义供应商
 */
function isPredefinedProvider(providerId) {
  if (!providerId) return false;
  
  const predefinedProviders = {
    // 国内提供商
    moonshot: true, aliyun: true, siliconflow: true, deepseek: true,
    zhipu: true, minimax: true, baidu: true, xfyun: true,
    volcano: true, stepfun: true, tencent: true,
    // 国外提供商
    openai: true, anthropic: true, gemini: true, groq: true,
    together: true, azure: true,
    // 本地/局域网模型
    ollama: true, lmstudio: true, custom_local: true
  };
  
  return predefinedProviders[providerId.toLowerCase()] || false;
}

/**
 * 迁移 OpenClaw 配置到程序配置
 */
async function migrateOpenClawConfig() {
  try {
    setGlobalStatus('正在迁移 OpenClaw 配置...', 'info');
    const result = await window.electronAPI.migrateOpenClawConfig();
    
    if (result.success && result.migrated) {
      // 迁移成功
      showHealthStatus('normal', '✓ ' + result.message);
      
      // 隐藏迁移按钮
      const migrateSection = document.getElementById('migrate-section');
      const healthActionSection = document.getElementById('health-action-section');
      if (migrateSection) migrateSection.style.display = 'none';
      if (healthActionSection) healthActionSection.style.display = 'none';
      
      // 更新状态显示
      const programDot = document.getElementById('health-program-dot');
      const programValue = document.getElementById('health-program-value');
      const openclawDot = document.getElementById('health-openclaw-dot');
      const openclawValue = document.getElementById('health-openclaw-value');
      
      if (programDot) {
        programDot.style.background = 'var(--success)';
        programDot.style.boxShadow = '0 0 8px var(--success)';
      }
      if (programValue) {
        programValue.textContent = result.providers.length + ' 个供应商';
        programValue.style.color = 'var(--success)';
      }
      if (openclawDot) {
        openclawDot.style.background = 'var(--success)';
        openclawDot.style.boxShadow = '0 0 8px var(--success)';
      }
      if (openclawValue) {
        openclawValue.textContent = '已迁移';
        openclawValue.style.color = 'var(--success)';
      }
      
      // 显示结果
      const healthActionResult = document.getElementById('health-action-result');
      if (healthActionResult) {
        healthActionResult.innerHTML = 
          '<div style="color: var(--success); font-weight: 500;">✓ 迁移成功</div>' +
          '<div style="color: var(--text-secondary); font-size: 10px; margin-top: 4px;">' +
            '已导入: ' + result.providers.join(', ') +
            (result.skipped && result.skipped.length > 0 ? '<br>已跳过: ' + result.skipped.join(', ') : '') +
          '</div>';
        healthActionResult.style.display = 'block';
      }
      
      // 刷新供应商列表显示
      await initNewApiConfig();
      await renderProviderList();
      
      // 设置安全切换状态 - 根据架构文档，迁移后应该自动选中第一个供应商
      if (result.providers && result.providers.length > 0) {
        const firstProviderId = result.providers[0];
        
        // 设置为 pending 状态（等待用户确认应用）
        if (typeof StateManager !== 'undefined') {
          StateManager.setPendingProvider(firstProviderId);
          StateManager.setAppliedProvider(null);
          StateManager.setIsApplying(false);
        }
        
        // 更新应用配置按钮状态
        if (typeof updateApplyButtonState === 'function') {
          updateApplyButtonState('pending', firstProviderId);
        }
        
        // 更新"当前使用"标签页显示
        if (typeof updateCurrentUsageDisplay === 'function') {
          updateCurrentUsageDisplay();
        }
        
        // 自动触发 API 检测
        if (typeof autoTestApiConnection === 'function') {
          setTimeout(() => autoTestApiConnection(), 500);
        }
        
        addLog('info', '迁移后自动选中供应商: ' + firstProviderId, {}, 'system');
      }

      setGlobalStatus('成功迁移 ' + result.providers.length + ' 个配置，请点击"应用配置"同步到 OpenClaw', 'success');
      addLog('info', '迁移 OpenClaw 配置成功', { providers: result.providers, selectedModel: result.selectedModel }, 'user');
    } else if (result.success && !result.migrated) {
      // 无需迁移
      showHealthStatus('normal', 'ℹ️ ' + result.message);
      setGlobalStatus(result.message, 'info');
    } else {
      // 迁移失败
      showHealthStatus('error', '✗ ' + result.message);
      setGlobalStatus('迁移失败: ' + result.message, 'error');
    }
  } catch (error) {
    console.error('迁移失败:', error);
    showHealthStatus('error', '✗ 迁移过程发生错误');
    setGlobalStatus('迁移过程发生错误', 'error');
  }
}

/**
 * 全选 providers
 */
function selectAllProviders() {
  document.querySelectorAll('.provider-checkbox').forEach(cb => cb.checked = true);
}

/**
 * 全不选 providers
 */
function deselectAllProviders() {
  document.querySelectorAll('.provider-checkbox').forEach(cb => cb.checked = false);
}

/**
 * 清理选中的 providers
 */
async function cleanupSelectedProviders() {
  const selectedCheckboxes = document.querySelectorAll('.provider-checkbox:checked');
  const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);
  
  if (selectedIds.length === 0) {
    alert('请至少选择一个要清理的配置');
    return;
  }
  
  // 获取选中项的详细信息
  const selectedProviders = detectedProviders.filter(p => selectedIds.includes(p.id));
  
  // 详细确认对话框
  const confirmMessage = '确定要清理以下 ' + selectedIds.length + ' 个配置吗？\n\n' +
    selectedProviders.map(p => '• ' + p.name + ' (' + p.models + ' 个模型)').join('\n') +
    '\n\n⚠️ 注意：\n1. 将自动备份 OpenClaw 配置文件\n2. 删除 ~/.openclaw/openclaw.json 中的 models.providers.' + selectedIds.join(', ') +
    '\n3. 这些配置可以通过本程序重新配置\n\n此操作不可撤销，确定继续吗？';
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  try {
    setGlobalStatus('正在清理 ' + selectedIds.length + ' 个选中配置...', 'info');
    const result = await window.electronAPI.cleanupOpenClawProvidersSelective(selectedIds);
    
    if (result.success && result.cleaned) {
      // 清理成功
      const cleanupResultEl = document.getElementById('cleanup-result');
      const openclawDot = document.getElementById('health-openclaw-dot');
      const openclawValue = document.getElementById('health-openclaw-value');
      const checkResultSection = document.getElementById('check-result-section');
      
      if (cleanupResultEl) {
        cleanupResultEl.innerHTML = 
          '<div style="color: var(--success); font-weight: 500;">✓ 成功清理 ' + result.providers.length + ' 个配置</div>' +
          '<div style="color: var(--text-secondary); font-size: 10px; margin-top: 4px;">' +
            '已删除: ' + result.providers.join(', ') + '<br>' +
            '备份位置: ' + result.backupPath +
          '</div>';
        cleanupResultEl.style.display = 'block';
        cleanupResultEl.style.borderLeftColor = 'var(--success)';
      }
      
      // 更新状态
      if (openclawDot) {
        openclawDot.style.background = 'var(--success)';
        openclawDot.style.boxShadow = '0 0 8px var(--success)';
      }
      if (openclawValue) {
        openclawValue.textContent = '已清理';
        openclawValue.style.color = 'var(--success)';
      }
      
      // 隐藏选择列表
      if (checkResultSection) checkResultSection.style.display = 'none';
      
      // 清空检测列表
      detectedProviders = [];
      
      setGlobalStatus('成功清理 ' + result.providers.length + ' 个冗余配置', 'success');
      addLog('info', '选择性清理 OpenClaw 冗余配置成功', {
        providers: result.providers,
        backupPath: result.backupPath
      }, 'user');
    } else {
      // 清理失败
      const cleanupResultEl = document.getElementById('cleanup-result');
      if (cleanupResultEl) {
        cleanupResultEl.innerHTML = '<span style="color: var(--error);">✗ ' + result.message + '</span>';
        cleanupResultEl.style.display = 'block';
        cleanupResultEl.style.borderLeftColor = 'var(--error)';
      }
      setGlobalStatus('清理失败: ' + result.message, 'error');
      addLog('error', '选择性清理 OpenClaw 冗余配置失败', { message: result.message }, 'user');
    }
  } catch (error) {
    console.error('清理失败:', error);
    const cleanupResultEl = document.getElementById('cleanup-result');
    if (cleanupResultEl) {
      cleanupResultEl.innerHTML = '<span style="color: var(--error);">✗ 清理过程发生错误: ' + error.message + '</span>';
      cleanupResultEl.style.display = 'block';
      cleanupResultEl.style.borderLeftColor = 'var(--error)';
    }
    setGlobalStatus('清理过程发生错误', 'error');
    addLog('error', '选择性清理 OpenClaw 冗余配置异常', { error: error.message }, 'user');
  }
}

/**
 * 清理 OpenClaw 冗余配置
 */
async function cleanupOpenClawRedundant() {
  const cleanupResultEl = document.getElementById('cleanup-result');
  const openclawDot = document.getElementById('health-openclaw-dot');
  const openclawValue = document.getElementById('health-openclaw-value');
  const cleanupSection = document.getElementById('cleanup-section');
  
  // 二次确认
  if (!confirm('确定要清理 OpenClaw 中的冗余配置吗？\n\n这将：\n1. 备份 OpenClaw 配置文件\n2. 删除其中的 models.providers 数据\n3. 保留程序配置中的供应商数据\n\n清理后 OpenClaw 将使用程序配置中的供应商设置。')) {
    return;
  }
  
  try {
    setGlobalStatus('正在清理 OpenClaw 冗余配置...', 'info');
    const result = await window.electronAPI.cleanupOpenClawRedundant();
    
    if (result.success && result.cleaned) {
      // 清理成功
      if (cleanupResultEl) {
        cleanupResultEl.innerHTML = 
          '<div style="color: var(--success); font-weight: 500;">✓ 成功清理 ' + result.providers.length + ' 个冗余配置</div>' +
          '<div style="color: var(--text-secondary); font-size: 10px; margin-top: 4px;">' +
            '已删除: ' + result.providers.join(', ') + '<br>' +
            '备份位置: ' + result.backupPath +
          '</div>';
        cleanupResultEl.style.display = 'block';
        cleanupResultEl.style.borderLeftColor = 'var(--success)';
      }
      
      // 更新状态
      if (openclawDot) {
        openclawDot.style.background = 'var(--success)';
        openclawDot.style.boxShadow = '0 0 8px var(--success)';
      }
      if (openclawValue) {
        openclawValue.textContent = '已清理';
        openclawValue.style.color = 'var(--success)';
      }
      
      // 隐藏清理按钮
      if (cleanupSection) cleanupSection.style.display = 'none';
      
      setGlobalStatus('成功清理 ' + result.providers.length + ' 个冗余配置', 'success');
      addLog('info', '清理 OpenClaw 冗余配置成功', {
        providers: result.providers,
        backupPath: result.backupPath
      }, 'user');
    } else {
      // 清理失败或无需清理
      if (cleanupResultEl) {
        cleanupResultEl.innerHTML = '<span style="color: var(--warning);">ℹ️ ' + result.message + '</span>';
        cleanupResultEl.style.display = 'block';
        cleanupResultEl.style.borderLeftColor = 'var(--warning)';
      }
      setGlobalStatus(result.message, result.cleaned ? 'success' : 'info');
    }
  } catch (error) {
    console.error('清理失败:', error);
    if (cleanupResultEl) {
      cleanupResultEl.innerHTML = '<span style="color: var(--error);">✗ 清理过程发生错误: ' + error.message + '</span>';
      cleanupResultEl.style.display = 'block';
      cleanupResultEl.style.borderLeftColor = 'var(--error)';
    }
    setGlobalStatus('清理过程发生错误', 'error');
    addLog('error', '清理 OpenClaw 冗余配置异常', { error: error.message }, 'user');
  }
}

// ==================== 配置检查卡片功能 v2.7.5 ====================
// 【v2.7.5 重构】简洁版配置检查 - 只显示问题，正常时最小化显示
// 注意：lastConfigCheckResult 已在文件顶部声明

// 【v2.7.5】防止检查过于频繁
let isConfigChecking = false;
let lastCheckTime = 0;
const MIN_CHECK_INTERVAL = 5000; // 最小检查间隔 5 秒

/**
 * 【v2.7.5】执行配置检查
 * @param {Object} options - 检查选项
 * @param {boolean} options.testApiConnection - 是否测试 API 连接（默认 false，避免卡顿）
 * @param {boolean} options.isAutoCheck - 是否为自动检查（自动检查不测试 API）
 */
async function performConfigIntegrityCheck(options = {}) {
  const { testApiConnection = false, isAutoCheck = false } = options;
  
  // 防止重复检查
  if (isConfigChecking) {
    console.log('[ConfigCheck] 检查正在进行中，跳过');
    return;
  }
  
  // 检查间隔限制（非手动检查）
  const now = Date.now();
  if (isAutoCheck && now - lastCheckTime < MIN_CHECK_INTERVAL) {
    console.log('[ConfigCheck] 检查间隔太短，跳过自动检查');
    return;
  }
  
  isConfigChecking = true;
  lastCheckTime = now;
  
  console.log(`[ConfigCheck] 开始配置检查 (测试API: ${testApiConnection})`);

  try {
    // ==================== 【第1步】检查程序配置（本地文件，很快）====================
    const programConfig = await window.electronAPI.loadApiConfig();
    const providers = programConfig?.providers || {};
    const providerCount = Object.keys(providers).length;
    
    // ==================== 【第2步】检查 openclaw.json（本地文件）====================
    // 【重要】OpenClaw 只能用一个供应商，只检查当前生效的配置
    let openclawConfig = null;
    let activeProviderId = null;
    let openclawProviders = {};
    const openclawIssues = [];
    const authProfilesIssues = [];
    
    try {
      const openclawResult = await window.electronAPI.checkOpenClawIntegrity();
      if (openclawResult.success) {
        openclawConfig = openclawResult;
        openclawProviders = openclawResult.files?.['openclaw.json']?.providers || {};
        
        // 获取当前激活的供应商（OpenClaw 只能用一个）
        activeProviderId = Object.keys(openclawProviders)[0] || null;
        
        if (activeProviderId) {
          const providerConfig = openclawProviders[activeProviderId];
          
          // 检查当前供应商配置完整性
          if (!providerConfig.baseUrl) {
            openclawIssues.push({
              type: 'openclaw',
              provider: activeProviderId,
              issue: 'Base URL 未配置'
            });
          }
          if (!providerConfig.model) {
            openclawIssues.push({
              type: 'openclaw',
              provider: activeProviderId,
              issue: '模型未配置'
            });
          }
          
          // 检查 auth-profiles.json（只检查当前激活的供应商）
          if (!isLocalProvider(providerConfig?.baseUrl)) {
            const authProfiles = await window.electronAPI.loadAuthProfiles() || {};
            const apiKey = getApiKeyFromAuthProfiles(authProfiles, activeProviderId);
            
            if (!apiKey) {
              authProfilesIssues.push({ 
                type: 'auth', 
                provider: activeProviderId, 
                issue: 'auth-profiles.json 中缺少 API Key' 
              });
            }
          }
        }
      } else {
        openclawIssues.push({ type: 'openclaw', provider: '全局', issue: 'openclaw.json 检查失败' });
      }
    } catch (e) {
      console.log('[ConfigCheck] openclaw.json 检查失败:', e.message);
      openclawIssues.push({ type: 'openclaw', provider: '全局', issue: '无法检查 openclaw.json' });
    }

    // ==================== 【第3步】API Key 有效性检查（可选，可能很慢）====================
    // 【重要】只测试当前激活的供应商（OpenClaw 只能用一个）
    let apiKeyTestResults = [];
    let invalidApiKeys = [];
    
    // 只有明确要求时才测试 API 连接
    if (testApiConnection && activeProviderId && openclawProviders[activeProviderId]) {
      const providerConfig = openclawProviders[activeProviderId];
      
      // 检查是否为本地供应商
      if (isLocalProvider(providerConfig?.baseUrl)) {
        console.log(`[ConfigCheck] ${activeProviderId} 是本地供应商，跳过 API 测试`);
        apiKeyTestResults.push({
          provider: activeProviderId,
          valid: true,
          message: '本地/局域网供应商，跳过测试'
        });
      } else {
        // 测试当前激活的供应商
        try {
          setGlobalStatus(`正在测试 ${activeProviderId} API 连接...`, 'info');
          
          const authProfiles = await window.electronAPI.loadAuthProfiles() || {};
          const testResult = await testProviderApiConnection(activeProviderId, providerConfig, authProfiles);
          apiKeyTestResults.push({
            provider: activeProviderId,
            valid: testResult.success,
            message: testResult.message || (testResult.success ? '连接正常' : '连接失败')
          });
        } catch (e) {
          apiKeyTestResults.push({
            provider: activeProviderId,
            valid: false,
            message: '测试过程出错: ' + e.message
          });
        }
      }
      invalidApiKeys = apiKeyTestResults.filter(r => !r.valid);
    }

    // ==================== 【第4步】Gateway Token 一致性检查（本地）====================
    let tokenIssue = null;
    try {
      const gatewayStatus = await window.electronAPI.checkGatewayStatus();
      const gatewayToken = gatewayStatus?.token;
      const configToken = programConfig?.gatewayToken;

      if (gatewayStatus?.running && configToken && gatewayToken && configToken !== gatewayToken) {
        tokenIssue = { type: 'token', issue: 'Token 与 Gateway 不一致' };
      }
    } catch (e) {
      console.log('[ConfigCheck] Token 检查跳过:', e.message);
    }

    // ==================== 【第5步】分析结果并更新UI ====================
    const hasConfig = providerCount > 0;
    const hasOpenClawConfig = activeProviderId !== null;
    const allIssues = [...authProfilesIssues, ...openclawIssues];
    const hasIssues = allIssues.length > 0 || invalidApiKeys.length > 0 || tokenIssue !== null;

    // 保存完整结果供详情弹窗使用
    lastConfigCheckResult = {
      hasConfig,
      providerCount,
      providers, // 【v2.7.5】程序中的供应商列表
      activeProviderId, // 【v2.7.5】当前 OpenClaw 使用的供应商
      hasOpenClawConfig,
      openclawProviders, // 【v2.7.5】OpenClaw 中的供应商配置
      authProfilesIssues,
      openclawIssues,
      apiKeyTestResults,
      invalidApiKeys,
      tokenIssue,
      timestamp: new Date().toISOString(),
      apiTested: testApiConnection // 标记是否测试过 API
    };

    // 【v2.7.5】更新页面中的配置显示
    await updateOpenClawConfigDisplay();

    // 设置全局状态
    if (!hasConfig) {
      setGlobalStatus('💡 欢迎使用！请添加您的第一个 API 供应商', 'info');
    } else if (!hasOpenClawConfig) {
      setGlobalStatus(`⚠️ 程序中有 ${providerCount} 个供应商，但 OpenClaw 未配置`, 'warning');
    } else if (hasIssues) {
      const totalIssues = allIssues.length + invalidApiKeys.length + (tokenIssue ? 1 : 0);
      setGlobalStatus(`⚠️ 发现 ${totalIssues} 个问题`, 'warning');
    } else {
      setGlobalStatus(`✓ 当前使用 ${activeProviderId}，配置完整`, 'success');
    }

  } catch (error) {
    console.error('[ConfigCheck] 检查失败:', error);
    setGlobalStatus('✗ 配置检查失败，请查看日志', 'error');
  } finally {
    // 重置检查状态
    isConfigChecking = false;
  }
}

/**
 * 【v2.7.5】获取 auth-profiles.json 中的 API Key
 * 注意：auth-profiles.json 中的 key 是明文存储，不需要解密
 * 结构：{ "profiles": { "provider:default": { "key": "明文API Key" } } }
 * @param {Object} authProfiles - auth-profiles.json 内容
 * @param {string} providerId - 供应商ID
 * @returns {string|null} API Key 或 null
 */
function getApiKeyFromAuthProfiles(authProfiles, providerId) {
  if (!authProfiles) return null;
  
  // auth-profiles.json 结构：profiles["provider:default"].key
  const profileKey = `${providerId}:default`;
  const profile = authProfiles.profiles?.[profileKey];
  
  if (profile && profile.key) {
    // auth-profiles.json 中的 key 是明文，直接返回
    return profile.key;
  }
  
  // 兼容旧格式：直接存储在 providerId 下
  if (authProfiles[providerId]?.apiKey) {
    return authProfiles[providerId].apiKey;
  }
  
  return null;
}

/**
 * 【v2.7.5】检查是否为本地/局域网供应商
 * @param {string} baseUrl - 供应商 Base URL
 * @returns {boolean} 是否为本地/局域网
 */
function isLocalProvider(baseUrl) {
  if (!baseUrl) return false;
  
  // 检查本地地址特征
  const localPatterns = [
    /^http:\/\/localhost/i,
    /^http:\/\/127\./i,
    /^http:\/\/192\.168\./i,
    /^http:\/\/10\./i,
    /^http:\/\/172\.(1[6-9]|2[0-9]|3[01])\./i,
    /:\d+$/  // 带端口的通常也是本地服务
  ];
  
  return localPatterns.some(pattern => pattern.test(baseUrl));
}

/**
 * 【v2.7.5】测试供应商 API 连接有效性
 * @param {string} providerId - 供应商ID
 * @param {Object} providerConfig - 供应商配置（来自 openclaw.json）
 * @param {Object} authProfiles - 完整的 auth-profiles.json 对象
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function testProviderApiConnection(providerId, providerConfig, authProfiles) {
  console.log(`[ConfigCheck] 测试 ${providerId} API 连接...`);

  try {
    // 检查是否为本地供应商，本地供应商跳过测试
    const baseUrl = providerConfig?.baseUrl;
    if (isLocalProvider(baseUrl)) {
      console.log(`[ConfigCheck] ${providerId} 是本地供应商，跳过 API 测试`);
      return { success: true, message: '本地供应商，跳过测试' };
    }

    // 获取 API Key（auth-profiles.json 中是明文）
    const apiKey = getApiKeyFromAuthProfiles(authProfiles, providerId);
    if (!apiKey) {
      return { success: false, message: 'auth-profiles.json 中未找到 API Key' };
    }

    if (!baseUrl) {
      return { success: false, message: 'Base URL 未配置' };
    }
    
    // 尝试调用 API 进行简单测试（获取模型列表）
    const testUrl = baseUrl.replace(/\/$/, '') + '/models';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    try {
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return { success: true, message: 'API 连接正常' };
      } else if (response.status === 401) {
        return { success: false, message: 'API Key 无效或已过期' };
      } else if (response.status === 403) {
        return { success: false, message: 'API Key 权限不足' };
      } else {
        return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return { success: false, message: '连接超时（10秒）' };
      }
      
      // 网络错误或其他 fetch 错误
      return { success: false, message: '网络连接失败: ' + fetchError.message };
    }
  } catch (error) {
    console.error(`[ConfigCheck] 测试 ${providerId} API 失败:`, error);
    return { success: false, message: '测试过程出错: ' + error.message };
  }
}

/**
 * 【v2.7.5】修复 Token 不一致
 */
async function fixTokenMismatch() {
  console.log('[ConfigCheck] 修复 Token 不一致');
  setGlobalStatus('正在修复 Token...', 'info');

  try {
    // 调用 Gateway Token 修复功能
    if (typeof fixGatewayToken === 'function') {
      await fixGatewayToken();
    } else {
      setGlobalStatus('Token 修复功能不可用', 'error');
    }
  } catch (error) {
    console.error('[ConfigCheck] Token 修复失败:', error);
    setGlobalStatus('Token 修复失败: ' + error.message, 'error');
  }
}

/**
 * 【v2.7.5】程序启动时自动执行配置检查
 * 自动检查不测试 API 连接，避免卡顿
 */
async function autoConfigCheckOnStartup() {
  console.log('[ConfigCheck] 程序启动，自动执行配置检查（不测试API）');
  // 延迟执行，等待其他初始化完成
  setTimeout(async () => {
    // 直接更新配置显示
    await updateOpenClawConfigDisplay();
    console.log('[ConfigCheck] 配置信息已加载');
  }, 1000);
}

// 【v2.7.5】页面加载完成后初始化配置检查
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // 绑定事件监听器
    setupConfigCheckEventListeners();
    // 自动检查
    autoConfigCheckOnStartup();
  });
} else {
  setupConfigCheckEventListeners();
  autoConfigCheckOnStartup();
}

/**
 * 【v2.7.5】设置配置检查事件监听器
 * 注意：现在配置直接显示在页面中，不需要弹窗和按钮
 */
function setupConfigCheckEventListeners() {
  // 配置检查现在直接在页面中显示，无需按钮事件
  console.log('[ConfigCheck] 配置检查模块已初始化（直接显示模式）');
}

// 【v2.7.5】保留旧函数兼容性
function updateConfigCheckActions(actionType) {
  // 此函数保留用于兼容性，新逻辑已集成到 performConfigIntegrityCheck
  console.log('[ConfigCheck] updateConfigCheckActions 已弃用，使用新逻辑');
}

/**
 * 修复配置问题
 * 注意：此功能已简化，不再使用 init-backups，而是引导用户手动修复
 */
async function fixConfigIssues() {
  console.log('[ConfigCheck] 开始修复配置');

  try {
    // 获取当前状态
    const programConfig = await window.electronAPI.loadApiConfig();
    const openclawResult = await window.electronAPI.checkOpenClawIntegrity();

    const hasProgramConfig = programConfig && programConfig.providers && Object.keys(programConfig.providers).length > 0;
    const hasOpenClawConfig = openclawResult.success && openclawResult.files &&
      Object.values(openclawResult.files).some(f => f.exists);

    if (!hasProgramConfig) {
      // 没有程序配置，引导用户添加供应商
      setGlobalStatus('请先添加 API 供应商', 'info');
      if (typeof openNewProviderModal === 'function') {
        openNewProviderModal();
      }
    } else if (!hasOpenClawConfig) {
      // 有程序配置但没有 OpenClaw 配置，应用配置
      await applyConfigToOpenClaw();
    } else {
      // 配置有问题，提示用户手动检查
      setGlobalStatus('请检查配置问题并手动修复', 'warning');
      // 打开配置目录方便用户查看
      await openConfigDirectory();
    }

    // 重新检查
    await performConfigIntegrityCheck();

  } catch (error) {
    console.error('[ConfigCheck] 修复失败:', error);
    setGlobalStatus('配置修复失败: ' + error.message, 'error');
  }
}

/**
 * 打开配置目录
 */
async function openConfigDirectory() {
  console.log('[ConfigCheck] 打开配置目录');
  try {
    if (window.electronAPI && window.electronAPI.openOpenClawConfigDir) {
      await window.electronAPI.openOpenClawConfigDir();
      setGlobalStatus('已打开配置目录', 'success');
    } else {
      console.error('[ConfigCheck] 打开目录接口不可用');
      setGlobalStatus('打开目录失败: 接口不可用', 'error');
    }
  } catch (error) {
    console.error('[ConfigCheck] 打开目录失败:', error);
    setGlobalStatus('打开目录失败: ' + error.message, 'error');
  }
}

/**
 * 更新配置检查卡片的操作按钮
 * 【v2.7.5】已弃用，配置现在直接显示在页面中
 * @param {string} actionType - 操作类型: 'none', 'add-provider', 'apply-config', 'fix-config'
 */
function updateConfigCheckActions(actionType) {
  // 【v2.7.5】此函数已弃用，配置直接显示在页面中
  console.log('[ConfigCheck] updateConfigCheckActions 已弃用');
}

/**
 * 将程序配置应用到 OpenClaw
 */
async function applyConfigToOpenClaw() {
  console.log('[ConfigCheck] 开始应用配置到 OpenClaw');

  try {
    // 获取当前程序配置
    const programConfig = await window.electronAPI.loadApiConfig();
    const selectedProvider = programConfig?.selectedModel?.split('/')[0];

    if (!selectedProvider || !programConfig.providers?.[selectedProvider]) {
      setGlobalStatus('请先选择一个供应商', 'warning');
      return;
    }

    const provider = programConfig.providers[selectedProvider];

    // 同步到 OpenClaw
    const providerConfig = {
      id: selectedProvider,
      name: provider.name || selectedProvider,
      icon: provider.icon,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey || '',
      apiType: 'openai',
      models: provider.models
    };

    await window.electronAPI.setActiveProvider(selectedProvider);
    await window.electronAPI.syncToOpenClaw(selectedProvider, providerConfig);

    // 更新状态
    if (typeof StateManager !== 'undefined') {
      StateManager.setAppliedProvider(selectedProvider);
    }
    if (typeof updateApplyButtonState === 'function') {
      updateApplyButtonState('activated', selectedProvider);
    }

    setGlobalStatus('配置已应用到 OpenClaw', 'success');
    addLog('success', '配置已应用到 OpenClaw', { provider: selectedProvider }, 'user');

    // 【v2.7.5】刷新配置显示
    await updateOpenClawConfigDisplay();

  } catch (error) {
    console.error('[ConfigCheck] 应用配置失败:', error);
    setGlobalStatus('应用配置失败: ' + error.message, 'error');
  }
}

/**
 * 初始化配置检查卡片
 * 【v2.7.5】现在直接在页面中显示 OpenClaw 配置
 */
function initConfigCheckCard() {
  console.log('[ConfigCheck] 初始化配置检查卡片');

  // 立即显示配置
  updateOpenClawConfigDisplay();

  // 自动运行系统检查（配置文件和程序配置）
  setTimeout(() => {
    runSystemCheck();
  }, 1000);
}

/**
 * 运行系统检查（更新诊断页面的检查项）
 */
async function runSystemCheck() {
  console.log('[SystemCheck] 开始运行系统检查...');

  // 1. 检查配置文件（OpenClaw 配置）
  await checkConfigFileStatus();

  // 2. 检查程序配置
  await checkProgramConfigStatus();

  console.log('[SystemCheck] 系统检查完成');
}

/**
 * 检查配置文件状态（OpenClaw 配置）
 */
async function checkConfigFileStatus() {
  const checkDot = document.getElementById('check-config-dot');
  const checkStatus = document.getElementById('check-config-status');

  try {
    const result = await window.electronAPI.checkOpenClawIntegrity();

    if (!result.success) {
      if (checkDot) {
        checkDot.style.background = '#ef4444';
        checkDot.style.boxShadow = '0 0 6px #ef4444';
      }
      if (checkStatus) {
        checkStatus.textContent = '检查失败';
        checkStatus.style.color = '#ef4444';
      }
      return;
    }

    const { files, missingFields } = result;
    const criticalFiles = ['openclaw.json'];
    const missingCriticalFiles = criticalFiles.filter(f => !files[f] || !files[f].exists);

    if (missingCriticalFiles.length > 0) {
      // 关键文件不存在
      if (checkDot) {
        checkDot.style.background = '#fbbf24';
        checkDot.style.boxShadow = '0 0 6px #fbbf24';
      }
      if (checkStatus) {
        checkStatus.textContent = '未安装';
        checkStatus.style.color = '#fbbf24';
      }
    } else if (missingFields.length > 0) {
      // 配置不完整
      if (checkDot) {
        checkDot.style.background = '#fbbf24';
        checkDot.style.boxShadow = '0 0 6px #fbbf24';
      }
      if (checkStatus) {
        checkStatus.textContent = '不完整';
        checkStatus.style.color = '#fbbf24';
      }
    } else {
      // 配置正常
      if (checkDot) {
        checkDot.style.background = '#22c55e';
        checkDot.style.boxShadow = '0 0 6px #22c55e';
      }
      if (checkStatus) {
        checkStatus.textContent = '正常';
        checkStatus.style.color = '#22c55e';
      }
    }
  } catch (error) {
    console.error('[SystemCheck] 检查配置文件失败:', error);
    if (checkDot) {
      checkDot.style.background = '#ef4444';
      checkDot.style.boxShadow = '0 0 6px #ef4444';
    }
    if (checkStatus) {
      checkStatus.textContent = '检查失败';
      checkStatus.style.color = '#ef4444';
    }
  }
}

/**
 * 检查程序配置状态
 */
async function checkProgramConfigStatus() {
  const checkDot = document.getElementById('check-program-dot');
  const checkStatus = document.getElementById('check-program-status');

  try {
    const config = await window.electronAPI.loadApiConfig();
    const providers = config?.providers || {};
    const providerCount = Object.keys(providers).length;

    if (providerCount === 0) {
      // 没有程序配置
      if (checkDot) {
        checkDot.style.background = '#fbbf24';
        checkDot.style.boxShadow = '0 0 6px #fbbf24';
      }
      if (checkStatus) {
        checkStatus.textContent = '未配置';
        checkStatus.style.color = '#fbbf24';
      }
    } else {
      // 有程序配置
      if (checkDot) {
        checkDot.style.background = '#22c55e';
        checkDot.style.boxShadow = '0 0 6px #22c55e';
      }
      if (checkStatus) {
        checkStatus.textContent = '正常';
        checkStatus.style.color = '#22c55e';
      }
    }
  } catch (error) {
    console.error('[SystemCheck] 检查程序配置失败:', error);
    if (checkDot) {
      checkDot.style.background = '#ef4444';
      checkDot.style.boxShadow = '0 0 6px #ef4444';
    }
    if (checkStatus) {
      checkStatus.textContent = '检查失败';
      checkStatus.style.color = '#ef4444';
    }
  }
}

// ==================== 配置状态总览模块 ====================

/**
 * 获取程序配置状态
 * @returns {Promise<Object>} 程序配置状态
 */
async function getProgramConfigStatus() {
  try {
    const config = await window.electronAPI.loadApiConfig();
    const providers = config?.providers || {};
    const providerCount = Object.keys(providers).length;
    const selectedModel = config?.selectedModel || '';
    const selectedProvider = selectedModel ? selectedModel.split('/')[0] : '';
    
    return {
      providerCount,
      selectedProvider,
      status: providerCount > 0 ? 'normal' : 'empty'
    };
  } catch (error) {
    console.error('[ConfigStatus] 获取程序配置状态失败:', error);
    return {
      providerCount: 0,
      selectedProvider: '',
      status: 'error',
      error: error.message
    };
  }
}

/**
 * 获取 OpenClaw 文件状态
 * @returns {Promise<Object>} 文件状态
 */
async function getOpenClawFileStatus() {
  try {
    const result = await window.electronAPI.checkOpenClawIntegrity();
    if (!result.success) {
      return {
        openclawJson: { exists: false, status: 'missing' },
        modelsJson: { exists: false, status: 'missing' },
        authProfiles: { exists: false, status: 'missing' }
      };
    }
    
    const { files, missingFields, emptyFields } = result;
    
    // 【调试日志】
    console.log('[ConfigStatus] checkOpenClawIntegrity 返回:', {
      files: Object.keys(files),
      missingFields,
      emptyFields,
      openclawJsonExists: files['openclaw.json']?.exists,
      openclawJsonIsEmpty: files['openclaw.json']?.isEmpty,
      openclawJsonIsValid: files['openclaw.json']?.isValidJson
    });
    
    // 检查 openclaw.json 是否存在且有效
    const openclawFile = files['openclaw.json'];
    const hasOpenclawJson = openclawFile?.exists && !openclawFile?.isEmpty && openclawFile?.isValidJson;
    
    // 检查是否有 models.providers 配置
    const hasModelsConfig = hasOpenclawJson && !missingFields.includes('models') && !missingFields.includes('models.providers');
    const hasEmptyProviders = emptyFields?.some(f => f.includes('models.providers'));
    
    // 【调试日志】
    console.log('[ConfigStatus] 模型配置检查:', {
      hasOpenclawJson,
      hasModelsConfig,
      hasEmptyProviders,
      missingFieldsIncludesModels: missingFields.includes('models'),
      missingFieldsIncludesProviders: missingFields.includes('models.providers')
    });
    
    return {
      openclawJson: { 
        exists: hasOpenclawJson, 
        status: hasOpenclawJson ? 'normal' : 'missing' 
      },
      modelsJson: { 
        exists: hasModelsConfig && !hasEmptyProviders, 
        status: hasModelsConfig && !hasEmptyProviders ? 'normal' : (hasModelsConfig && hasEmptyProviders ? 'warning' : 'missing') 
      },
      authProfiles: { 
        exists: files['auth-profiles.json']?.exists || false, 
        status: files['auth-profiles.json']?.exists ? 'normal' : 'missing' 
      }
    };
  } catch (error) {
    console.error('[ConfigStatus] 获取 OpenClaw 文件状态失败:', error);
    return {
      openclawJson: { exists: false, status: 'error' },
      modelsJson: { exists: false, status: 'error' },
      authProfiles: { exists: false, status: 'error' }
    };
  }
}

/**
 * 获取当前模型信息
 * @returns {Promise<Object>} 当前模型信息
 */
async function getCurrentModelInfo() {
  try {
    const config = await window.electronAPI.loadApiConfig();
    const selectedModel = config?.selectedModel || '';
    const [providerId, modelId] = selectedModel.split('/');
    
    if (!providerId || !config?.providers?.[providerId]) {
      return {
        provider: '未配置',
        model: '未配置',
        apiUrl: '--',
        apiKey: { exists: false }
      };
    }
    
    const provider = config.providers[providerId];
    return {
      provider: provider.name || providerId,
      model: modelId || provider.models?.[0]?.id || '未配置',
      apiUrl: provider.baseUrl || '--',
      apiKey: { 
        exists: !!(provider.apiKey && provider.apiKey !== '' && provider.apiKey !== 'e'),
        masked: true
      }
    };
  } catch (error) {
    console.error('[ConfigStatus] 获取当前模型信息失败:', error);
    return {
      provider: '获取失败',
      model: '获取失败',
      apiUrl: '--',
      apiKey: { exists: false }
    };
  }
}

/**
 * 获取配置问题列表
 * @returns {Promise<Object>} 问题列表
 */
async function getConfigIssues() {
  const issues = [];
  
  try {
    // 检查程序配置
    const programStatus = await getProgramConfigStatus();
    if (programStatus.status === 'empty') {
      issues.push({ type: 'info', message: '程序配置为空，请添加供应商' });
    }
    
    // 检查 OpenClaw 文件
    const fileStatus = await getOpenClawFileStatus();
    if (!fileStatus.openclawJson.exists) {
      issues.push({ type: 'warning', message: 'OpenClaw 主配置文件不存在' });
    }
    
    // 检查 Gateway Token
    const tokenStatus = await window.electronAPI.checkGatewayTokenStatus();
    if (!tokenStatus.valid) {
      if (tokenStatus.status === 'mismatch') {
        issues.push({ type: 'warning', message: 'Gateway Token 不一致' });
      } else if (tokenStatus.status === 'missing') {
        issues.push({ type: 'error', message: 'Gateway Token 未配置' });
      }
    }
    
    return {
      issues,
      hasIssues: issues.length > 0
    };
  } catch (error) {
    console.error('[ConfigStatus] 获取配置问题列表失败:', error);
    return {
      issues: [{ type: 'error', message: '检查过程发生错误: ' + error.message }],
      hasIssues: true
    };
  }
}

/**
 * 打开配置状态总览面板
 */
async function openConfigStatusModal() {
  console.log('[ConfigStatus] 打开配置状态总览面板');
  
  const modal = document.getElementById('config-status-modal');
  const overlay = document.getElementById('config-status-overlay');
  
  if (!modal || !overlay) {
    console.error('[ConfigStatus] 未找到弹窗元素');
    return;
  }
  
  // 强制应用内联样式确保样式生效
  modal.style.cssText = `
    width: 480px !important;
    max-width: 90vw !important;
    max-height: 80vh !important;
    background: var(--bg-card, rgba(30, 30, 40, 0.95)) !important;
    border-radius: 12px !important;
    border: 1px solid rgba(148, 163, 184, 0.15) !important;
    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(148, 163, 184, 0.1) !important;
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    z-index: 1001 !important;
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
  `;
  
  // 应用头部样式
  const header = modal.querySelector('.modal-header');
  if (header) {
    header.style.cssText = `
      background: linear-gradient(135deg, rgba(20, 22, 36, 0.98), rgba(30, 32, 48, 0.95)) !important;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 16px 20px !important;
      gap: 12px !important;
      border-radius: 12px 12px 0 0 !important;
    `;
  }
  
  // 应用标题样式
  const title = modal.querySelector('.modal-title');
  if (title) {
    title.style.cssText = `
      color: #06b6d4 !important;
      font-weight: 600 !important;
      font-size: 16px !important;
      white-space: nowrap !important;
      flex-shrink: 0 !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    `;
  }
  
  // 应用内容区域样式
  const content = modal.querySelector('.modal-content');
  if (content) {
    content.style.cssText = `
      padding: 20px !important;
      overflow-y: auto !important;
      max-height: calc(80vh - 140px) !important;
      background: var(--bg-card, rgba(30, 30, 40, 0.95)) !important;
    `;
  }
  
  // 应用底部样式
  const footer = modal.querySelector('.modal-footer');
  if (footer) {
    footer.style.cssText = `
      display: flex !important;
      justify-content: flex-end !important;
      gap: 12px !important;
      padding: 16px 20px !important;
      border-top: 1px solid rgba(148, 163, 184, 0.15) !important;
      background: rgba(20, 22, 36, 0.5) !important;
      border-radius: 0 0 12px 12px !important;
    `;
  }
  
  // 显示弹窗
  modal.classList.add('show');
  overlay.classList.add('show');
  
  // 更新全局状态栏
  setGlobalStatus('正在查看配置状态总览', 'info');
  
  // 渲染内容
  await renderConfigStatusPanel();
}

/**
 * 关闭配置状态总览面板
 */
function closeConfigStatusModal() {
  console.log('[ConfigStatus] 关闭配置状态总览面板');
  
  const modal = document.getElementById('config-status-modal');
  const overlay = document.getElementById('config-status-overlay');
  
  if (modal) {
    modal.classList.remove('show');
    // 清除内联样式，让 CSS 类重新生效
    modal.style.cssText = '';
    const header = modal.querySelector('.modal-header');
    const title = modal.querySelector('.modal-title');
    const content = modal.querySelector('.modal-content');
    const footer = modal.querySelector('.modal-footer');
    if (header) header.style.cssText = '';
    if (title) title.style.cssText = '';
    if (content) content.style.cssText = '';
    if (footer) footer.style.cssText = '';
  }
  if (overlay) overlay.classList.remove('show');
  
  // 重置全局状态栏
  resetGlobalStatusBar();
}

/**
 * 【v2.7.5 新增】执行完整配置检测
 * 检测所有配置项：程序配置、OpenClaw配置、文件状态、API密钥、备份完整性、网络连接
 */
async function runFullConfigCheck() {
  console.log('[ConfigStatus] 开始执行完整配置检测...');
  
  const results = {
    programConfig: null,
    openClawSync: null,
    fileStatus: null,
    apiKeyValidity: null,
    backupIntegrity: null,
    networkConnection: null,
    gatewayService: null
  };
  
  try {
    // 1. 检查程序配置
    setGlobalStatus('🔍 正在检查程序配置...', 'info');
    results.programConfig = await checkProgramConfigStatus();
    console.log('[ConfigStatus] 程序配置检测完成:', results.programConfig.status);
    
    // 2. 检查 OpenClaw 同步状态
    setGlobalStatus('🔍 正在检查 OpenClaw 同步状态...', 'info');
    results.openClawSync = await checkOpenClawSync();
    console.log('[ConfigStatus] OpenClaw 同步检测完成:', results.openClawSync.status);
    
    // 3. 检查文件状态
    setGlobalStatus('🔍 正在检查配置文件状态...', 'info');
    results.fileStatus = await checkConfigFileStatus();
    console.log('[ConfigStatus] 文件状态检测完成:', results.fileStatus.status);
    
    // 4. 检查 API 密钥有效性
    setGlobalStatus('🔍 正在检查 API 密钥...', 'info');
    results.apiKeyValidity = await checkApiKeyValidity();
    console.log('[ConfigStatus] API 密钥检测完成:', results.apiKeyValidity.status);
    
    // 5. 检查备份完整性
    setGlobalStatus('🔍 正在检查备份完整性...', 'info');
    results.backupIntegrity = await checkBackupIntegrity();
    console.log('[ConfigStatus] 备份完整性检测完成:', results.backupIntegrity.status);
    
    // 6. 检查网络连接
    setGlobalStatus('🔍 正在检查网络连接...', 'info');
    results.networkConnection = await checkNetworkConnection();
    console.log('[ConfigStatus] 网络连接检测完成:', results.networkConnection.status);
    
    // 7. 检查 Gateway 服务
    setGlobalStatus('🔍 正在检查 Gateway 服务...', 'info');
    results.gatewayService = await checkGatewayService();
    console.log('[ConfigStatus] Gateway 服务检测完成:', results.gatewayService.status);
    
    // 汇总结果
    const passedCount = Object.values(results).filter(r => r && r.status === 'passed').length;
    const warningCount = Object.values(results).filter(r => r && r.status === 'warning').length;
    const errorCount = Object.values(results).filter(r => r && r.status === 'failed').length;
    
    console.log('[ConfigStatus] 完整检测完成:', {
      total: 7,
      passed: passedCount,
      warning: warningCount,
      error: errorCount
    });
    
    setGlobalStatus(`✅ 完整检测完成: ${passedCount}项通过, ${warningCount}项警告, ${errorCount}项错误`, 
      errorCount > 0 ? 'error' : (warningCount > 0 ? 'warning' : 'success'));
    
    return results;
  } catch (error) {
    console.error('[ConfigStatus] 完整检测执行失败:', error);
    setGlobalStatus('❌ 完整检测执行失败: ' + error.message, 'error');
    throw error;
  }
}

/**
 * 渲染配置状态面板内容
 */
async function renderConfigStatusPanel() {
  const content = document.getElementById('config-status-content');
  if (!content) return;
  
  // 显示加载状态
  content.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">加载中...</div>';
  
  try {
    // 并行获取所有数据
    const [programStatus, fileStatus, modelInfo, issues, apiKeyStatus] = await Promise.all([
      getProgramConfigStatus(),
      getOpenClawFileStatus(),
      getCurrentModelInfo(),
      getConfigIssues(),
      checkApiKeyValidity() // 【修复】添加 API 密钥有效性检查
    ]);
    
    // 获取 Gateway Token 状态
    const tokenStatus = await window.electronAPI.checkGatewayTokenStatus();
    
    // 构建 HTML
    let html = '';
    
    // 程序配置部分
    html += `
      <div class="config-status-section">
        <div class="section-header">
          <div class="section-icon">📁</div>
          <div class="section-title">程序配置</div>
        </div>
        <div class="section-content">
          <div class="status-row">
            <span class="status-label">API供应商数量</span>
            <span class="status-value">${programStatus.providerCount}个</span>
          </div>
          <div class="status-row">
            <span class="status-label">当前选中</span>
            <span class="status-value">${programStatus.selectedProvider || '未选择'}</span>
          </div>
          <div class="status-row">
            <span class="status-label">配置状态</span>
            <span class="status-icon">${getStatusIcon(programStatus.status)}</span>
          </div>
        </div>
      </div>
    `;
    
    // OpenClaw 配置部分
    html += `
      <div class="config-status-section">
        <div class="section-header">
          <div class="section-icon">⚙️</div>
          <div class="section-title">OpenClaw配置</div>
        </div>
        <div class="section-content">
          <div class="status-row">
            <span class="status-label">主配置文件</span>
            <span class="status-icon">${getStatusIcon(fileStatus.openclawJson.status)}</span>
          </div>
          <div class="status-row">
            <span class="status-label">模型配置</span>
            <span class="status-icon">${getStatusIcon(fileStatus.modelsJson.status)}</span>
          </div>
          <div class="status-row">
            <span class="status-label">密钥存储</span>
            <span class="status-icon">${getStatusIcon(apiKeyStatus.status)}</span>
          </div>
        </div>
      </div>
    `;
    
    // Gateway 安全连接部分（可展开）
    // 【v2.7.5 修复】只有当两个 token 都存在且相等时才认为一致
    const hasAuthToken = !!tokenStatus.details?.authToken;
    const hasRemoteToken = !!tokenStatus.details?.remoteToken;
    const isConsistent = !!(hasAuthToken && hasRemoteToken && tokenStatus.details?.isConsistent);
    const needsRepair = !hasAuthToken || !hasRemoteToken || !isConsistent;

    const tokenStatusIcon = isConsistent ? '🛡️' : hasAuthToken || hasRemoteToken ? '⚠️' : '❌';
    const tokenStatusText = isConsistent ? '安全' : !hasAuthToken || !hasRemoteToken ? '缺失' : '不匹配';

    html += `
      <div class="config-status-section expandable expanded" id="gateway-section">
        <div class="section-header" onclick="toggleGatewaySection()" style="cursor: pointer;">
          <div class="section-icon">🔐</div>
          <div class="section-title">Gateway安全连接</div>
          <span class="expand-icon" style="margin-left: auto; font-size: 10px; color: #64748b;">▼</span>
        </div>
        <div class="section-content">
          <div class="status-row">
            <span class="status-label">服务端验证密钥</span>
            <span class="status-icon">${hasAuthToken ? '✅' : '❌'}</span>
          </div>
          <div class="status-row">
            <span class="status-label">客户端连接密钥</span>
            <span class="status-icon">${hasRemoteToken ? '✅' : '❌'}</span>
          </div>
          <div class="status-row">
            <span class="status-label">双密钥一致性</span>
            <span class="status-icon">${tokenStatusIcon} ${tokenStatusText}</span>
          </div>
          <div class="status-row">
            <span class="status-label">认证方式</span>
            <span class="status-value">${tokenStatus.details?.authMode || '未设置'}</span>
          </div>
          ${needsRepair ? `
            <div class="status-actions">
              <button class="btn btn-sm btn-primary" onclick="fixGatewayToken()">自动修复</button>
              <button class="btn btn-sm" onclick="showGatewayCommands()">查看命令</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    
    // 当前使用的AI模型部分
    html += `
      <div class="config-status-section">
        <div class="section-header">
          <div class="section-icon">🤖</div>
          <div class="section-title">当前使用的AI模型</div>
        </div>
        <div class="section-content">
          <div class="status-row">
            <span class="status-label">服务商</span>
            <span class="status-value">${modelInfo.provider}</span>
          </div>
          <div class="status-row">
            <span class="status-label">模型名称</span>
            <span class="status-value">${modelInfo.model}</span>
          </div>
          <div class="status-row">
            <span class="status-label">API地址</span>
            <span class="status-value" style="font-size: 11px;">${modelInfo.apiUrl}</span>
          </div>
          <div class="status-row">
            <span class="status-label">API密钥</span>
            <span class="status-icon">${modelInfo.apiKey.exists ? '🔒 已加密存储' : '⚠️ 未设置'}</span>
          </div>
        </div>
      </div>
    `;
    
    // 问题提示部分
    html += `
      <div class="config-status-section">
        <div class="section-header">
          <div class="section-icon">⚠️</div>
          <div class="section-title">需要注意的问题</div>
        </div>
        <div class="section-content">
          ${issues.hasIssues ? issues.issues.map(issue => `
            <div class="status-row">
              <span class="status-icon">${getStatusIcon(issue.type)}</span>
              <span class="status-value" style="flex: 1;">${issue.message}</span>
            </div>
          `).join('') : '<div class="status-row"><span class="status-icon">✅</span><span class="status-value">无异常</span></div>'}
        </div>
      </div>
    `;
    
    content.innerHTML = html;
    
  } catch (error) {
    console.error('[ConfigStatus] 渲染配置状态面板失败:', error);
    content.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--error);">加载失败: ${error.message}</div>`;
  }
}

/**
 * 切换 Gateway 区域展开/收起
 */
function toggleGatewaySection() {
  const section = document.getElementById('gateway-section');
  if (!section) return;
  
  section.classList.toggle('expanded');
  const icon = section.querySelector('.expand-icon');
  if (icon) {
    icon.textContent = section.classList.contains('expanded') ? '▼' : '▶';
  }
}

/**
 * 修复 Gateway Token
 * 【v2.7 更新】使用从备份恢复的方式修复 Gateway
 */
/**
 * 【v2.7.5 新增】显示 Gateway 修复进度弹窗
 */
function showGatewayRepairModal() {
  const modal = document.getElementById('gateway-repair-modal');
  const overlay = document.getElementById('gateway-repair-overlay');
  
  if (!modal || !overlay) {
    console.error('[Gateway修复] 找不到弹窗元素');
    return;
  }
  
  // 【v2.7.5 更新】使用统一样式
  document.getElementById('gateway-repair-header-title').textContent = '🔧 正在修复 Gateway Token';
  document.getElementById('gateway-repair-timer').textContent = '0:00';
  document.getElementById('gateway-repair-progress-bar').style.width = '0%';
  document.getElementById('gateway-repair-progress-text').textContent = '0%';
  document.getElementById('gateway-repair-current-step').textContent = '准备修复...';
  document.getElementById('gateway-repair-logs-status').textContent = '进行中';
  
  // 清空日志
  const logContainer = document.getElementById('gateway-repair-logs-content');
  logContainer.innerHTML = '';
  
  // 重置按钮状态
  const closeBtn = document.getElementById('btn-gateway-repair-close');
  const closeBtnX = document.getElementById('btn-gateway-repair-close-x');
  if (closeBtn) {
    closeBtn.textContent = '修复中...';
    closeBtn.disabled = true;
  }
  if (closeBtnX) {
    closeBtnX.disabled = true;
  }
  
  // 显示弹窗
  modal.style.display = 'block';
  overlay.style.display = 'block';
  
  // 启动计时器
  startGatewayRepairTimer();
}

/**
 * 【v2.7.5 新增】计时器变量
 */
let gatewayRepairTimerInterval = null;
let gatewayRepairStartTime = null;

/**
 * 【v2.7.5 新增】启动修复计时器
 */
function startGatewayRepairTimer() {
  gatewayRepairStartTime = Date.now();
  const timerDisplay = document.getElementById('gateway-repair-timer');
  
  if (gatewayRepairTimerInterval) {
    clearInterval(gatewayRepairTimerInterval);
  }
  
  gatewayRepairTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - gatewayRepairStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    if (timerDisplay) {
      timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }, 1000);
}

/**
 * 【v2.7.5 新增】停止修复计时器
 */
function stopGatewayRepairTimer() {
  if (gatewayRepairTimerInterval) {
    clearInterval(gatewayRepairTimerInterval);
    gatewayRepairTimerInterval = null;
  }
}

/**
 * 【v2.7.5 更新】更新修复进度 - 使用统一样式
 */
function updateGatewayRepairProgress(step, status, message) {
  // 更新当前步骤文本
  const currentStepEl = document.getElementById('gateway-repair-current-step');
  if (currentStepEl && message) {
    currentStepEl.textContent = message;
  }
  
  // 更新进度条
  const progressBar = document.getElementById('gateway-repair-progress-bar');
  const progressText = document.getElementById('gateway-repair-progress-text');
  const progressPercent = (step / 4) * 100;
  
  if (progressBar) {
    progressBar.style.width = `${progressPercent}%`;
  }
  if (progressText) {
    progressText.textContent = `${Math.round(progressPercent)}%`;
  }
  
  // 添加日志
  if (message) {
    addGatewayRepairLog(message, status === 'error' ? 'error' : status === 'completed' ? 'success' : 'info');
  }
}

/**
 * 【v2.7.5 更新】添加修复日志 - 使用统一样式
 */
function addGatewayRepairLog(message, type = 'info') {
  const logContainer = document.getElementById('gateway-repair-logs-content');
  if (!logContainer) return;

  const entry = document.createElement('div');
  entry.className = 'restore-log-entry';

  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const typeClass = type === 'error' ? 'error' : type === 'success' ? 'success' : 'info';
  const typeLabel = type === 'error' ? '错误' : type === 'success' ? '成功' : '信息';

  entry.innerHTML = `
    <span class="restore-log-time">${time}</span>
    <span class="restore-log-type ${typeClass}">${typeLabel}</span>
    <span class="restore-log-message">${message}</span>
  `;

  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

/**
 * 【v2.7.5 新增】更新修复弹窗 UI 状态
 */
function updateGatewayRepairUI(status, title, message) {
  const headerTitle = document.getElementById('gateway-repair-header-title');
  const currentStep = document.getElementById('gateway-repair-current-step');
  const logsStatus = document.getElementById('gateway-repair-logs-status');

  if (headerTitle) {
    const icon = status === 'success' ? '✅' : status === 'warning' ? '⚠️' : '❌';
    headerTitle.textContent = `${icon} ${title}`;
  }
  if (currentStep) {
    currentStep.textContent = message;
  }
  if (logsStatus) {
    logsStatus.textContent = status === 'success' ? '已完成' : status === 'warning' ? '需手动处理' : '失败';
  }
}

/**
 * 【v2.7.5 新增】启用关闭按钮
 */
function enableGatewayRepairCloseButton() {
  const closeBtn = document.getElementById('btn-gateway-repair-close');
  const closeBtnX = document.getElementById('btn-gateway-repair-close-x');

  const closeModal = () => {
    document.getElementById('gateway-repair-modal').style.display = 'none';
    document.getElementById('gateway-repair-overlay').style.display = 'none';
    stopGatewayRepairTimer();
  };

  if (closeBtn) {
    closeBtn.textContent = '确定';
    closeBtn.disabled = false;
    closeBtn.onclick = closeModal;
  }
  if (closeBtnX) {
    closeBtnX.disabled = false;
    closeBtnX.onclick = closeModal;
  }
}

/**
 * 【v2.7.5 重写】修复 Gateway Token（带进度弹窗）
 */
async function fixGatewayToken() {
  console.log('[ConfigStatus] 开始修复 Gateway');

  if (!confirm('确定要修复 Gateway Token 吗？\n\n修复逻辑：\n1. 读取 openclaw.json 中的配置\n2. 以 auth.token（服务端）为准\n3. 将 remote.token（客户端）设置为相同值\n4. Gateway 将自动检测配置变化\n\n请确保已备份重要数据。')) {
    return;
  }

  // 显示修复进度弹窗
  showGatewayRepairModal();
  addGatewayRepairLog('用户确认开始修复 Gateway', 'info');

  try {
    setGlobalStatus('🔧 正在修复 Gateway...', 'info');
    addLog('info', '[Gateway修复] 开始从备份恢复配置', {}, 'system');
    addGatewayRepairLog('开始从备份恢复配置...', 'info');

    // 【v2.7 更新】使用新的从备份恢复接口
    if (window.electronAPI && window.electronAPI.repairGatewayFromBackup) {
      updateGatewayRepairProgress(1, 'active', '检查 Gateway 当前状态...');
      
      const result = await window.electronAPI.repairGatewayFromBackup();

      if (result.success) {
        updateGatewayRepairProgress(1, 'completed', `配置已恢复: ${result.backup}`);
        addLog('success', `[Gateway修复] 配置已恢复: ${result.backup}`, {}, 'system');
        addGatewayRepairLog(`配置已从备份恢复: ${result.backup}`, 'success');
        setGlobalStatus(result.message || 'Gateway 配置已恢复', 'success');

        // 等待几秒后检查 Gateway 状态
        updateGatewayRepairProgress(4, 'active', '等待 Gateway 启动并验证状态...');
        addGatewayRepairLog('等待 Gateway 启动（3秒）...', 'info');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 验证修复结果
        addGatewayRepairLog('正在验证 Gateway 状态...', 'info');
        const tokenStatus = await window.electronAPI.checkGatewayTokenStatus?.();
        const healthStatus = await window.electronAPI.verifyGatewayHealth?.();

        if (tokenStatus?.valid && healthStatus?.running) {
          updateGatewayRepairProgress(4, 'completed', 'Gateway 验证通过，服务正常运行');
          addLog('success', '[Gateway修复] Gateway 已正常运行', {}, 'system');
          addGatewayRepairLog('✅ Gateway 修复成功！服务已正常运行', 'success');
          setGlobalStatus('✅ Gateway 修复成功，服务已正常运行', 'success');
          showNotification('Gateway 修复成功', 'Gateway 配置已恢复并正常运行', 'success');

          // 【v2.7.5 更新】使用统一样式更新弹窗为成功状态
          stopGatewayRepairTimer();
          updateGatewayRepairUI('success', 'Gateway 修复成功', '修复完成！服务已正常运行');
          document.getElementById('gateway-repair-progress-bar').style.width = '100%';
          document.getElementById('gateway-repair-progress-text').textContent = '100%';
          enableGatewayRepairCloseButton();
          
          // 【v2.7 关键修复】Gateway 修复成功后，重置停止状态并更新按钮显示
          if (typeof stopState !== 'undefined') {
            stopState.normalStopped = false;
            stopState.emergencyStopped = false;
            stopState.backupFileName = null;
            stopState.backupId = null;
          }
          if (typeof updateStopButtonsVisibility === 'function') {
            updateStopButtonsVisibility();
            addLog('info', '[Gateway修复] 已重置停止状态，恢复按钮已隐藏', {}, 'system');
            addGatewayRepairLog('已重置停止状态', 'info');
          }
        } else {
          updateGatewayRepairProgress(4, 'error', 'Gateway 验证失败，可能需要手动检查');
          addLog('warning', '[Gateway修复] Gateway 可能未完全启动，请手动检查', {}, 'system');
          addGatewayRepairLog('⚠️ Gateway 可能未完全启动', 'warning');
          setGlobalStatus('⚠️ 配置已恢复，Gateway 可能需要手动启动', 'warning');
          
          // 【v2.7.5 更新】使用统一样式
          stopGatewayRepairTimer();
          updateGatewayRepairUI('warning', 'Gateway 需要手动启动', '配置已恢复，但服务验证未通过');
        }

        // 【v2.7.5 更新】启用关闭按钮
        enableGatewayRepairCloseButton();
        
        // 重新渲染面板
        await renderConfigStatusPanel();
        
        // 【v2.7.5 新增】刷新 Gateway 控制台 Token 状态（熄灭闪烁）
        if (typeof checkGatewayServiceStatus === 'function') {
          console.log('[ConfigStatus] Token 修复完成，刷新 Gateway Token 状态');
          await checkGatewayServiceStatus();
        }
      } else {
        updateGatewayRepairProgress(1, 'error', `修复失败: ${result.error}`);
        addLog('error', `[Gateway修复] 修复失败: ${result.error}`, {}, 'system');
        addGatewayRepairLog(`❌ 修复失败: ${result.error}`, 'error');
        setGlobalStatus(`修复 Gateway 失败: ${result.error}`, 'error');

        // 【v2.7.5 更新】使用统一样式
        stopGatewayRepairTimer();
        updateGatewayRepairUI('error', 'Gateway 修复失败', result.error || '未知错误');
        enableGatewayRepairCloseButton();

        // 如果备份恢复失败，询问是否尝试自动修复
        setTimeout(async () => {
          if (confirm('备份恢复失败，是否尝试自动修复（install + start）？')) {
            await autoRepairGateway();
          }
        }, 500);
      }
    } else {
      // 如果没有新接口，尝试使用自动修复
      console.warn('[ConfigStatus] repairGatewayFromBackup IPC 接口未实现，尝试自动修复');
      addGatewayRepairLog('备份恢复接口不可用，尝试自动修复...', 'warning');
      await autoRepairGateway();
    }
  } catch (error) {
    console.error('[ConfigStatus] 修复 Gateway 失败:', error);
    addLog('error', `[Gateway修复] 修复失败: ${error.message}`, {}, 'system');
    addGatewayRepairLog(`❌ 修复失败: ${error.message}`, 'error');
    setGlobalStatus('修复 Gateway 失败: ' + error.message, 'error');

    // 【v2.7.5 更新】使用统一样式
    stopGatewayRepairTimer();
    updateGatewayRepairUI('error', 'Gateway 修复失败', error.message);
    enableGatewayRepairCloseButton();
  }
}

/**
 * 【v2.7.5 重写】自动修复 Gateway（install + start，带进度弹窗）
 */
async function autoRepairGateway() {
  console.log('[ConfigStatus] 开始自动修复 Gateway');

  // 确保弹窗已显示
  const modal = document.getElementById('gateway-repair-modal');
  if (!modal || modal.style.display === 'none') {
    showGatewayRepairModal();
  }

  try {
    setGlobalStatus('🔧 正在自动修复 Gateway...', 'info');
    addLog('info', '[Gateway修复] 执行自动修复（install + start）', {}, 'system');
    addGatewayRepairLog('开始自动修复（install + start）...', 'info');

    if (window.electronAPI && window.electronAPI.autoRepairGateway) {
      // 步骤 1: 检查状态
      updateGatewayRepairProgress(1, 'active', '检查 Gateway 当前状态...');
      addGatewayRepairLog('检查 Gateway 当前状态...', 'info');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 步骤 2: 安装
      updateGatewayRepairProgress(2, 'active', '正在安装 Gateway 服务...');
      addGatewayRepairLog('执行: openclaw gateway install', 'info');
      
      const result = await window.electronAPI.autoRepairGateway();

      if (result.install?.success) {
        updateGatewayRepairProgress(2, 'completed', 'Gateway 安装成功');
        addGatewayRepairLog('✅ Gateway 安装成功', 'success');
      } else if (result.install?.exitCode !== 0) {
        updateGatewayRepairProgress(2, 'completed', 'Gateway 安装完成（可能已存在）');
        addGatewayRepairLog('Gateway 安装完成（可能已存在）', 'info');
      }

      // 步骤 3: 启动
      if (result.start?.success) {
        updateGatewayRepairProgress(3, 'completed', 'Gateway 启动成功');
        addGatewayRepairLog('✅ Gateway 启动成功', 'success');
      } else {
        updateGatewayRepairProgress(3, 'error', 'Gateway 启动失败');
        addGatewayRepairLog('❌ Gateway 启动失败', 'error');
      }

      // 步骤 4: 验证
      updateGatewayRepairProgress(4, 'active', '正在验证 Gateway 服务...');
      addGatewayRepairLog('正在验证 Gateway 服务状态...', 'info');

      if (result.success && result.verified) {
        updateGatewayRepairProgress(4, 'completed', 'Gateway 验证通过，服务正常运行');
        addLog('success', '[Gateway修复] 自动修复完成，服务已验证启动', {
          install: result.install?.success,
          start: result.start?.success,
          verified: result.verified
        }, 'system');
        addGatewayRepairLog('✅ Gateway 自动修复完成！服务已验证启动', 'success');
        setGlobalStatus('✅ Gateway 自动修复完成，服务正常运行', 'success');
        showNotification('Gateway 修复成功', '自动修复已完成，服务正常运行', 'success');

        // 【v2.7.5 更新】使用统一样式
        stopGatewayRepairTimer();
        updateGatewayRepairUI('success', 'Gateway 修复成功', '服务已正常运行，所有检测通过');
        document.getElementById('gateway-repair-progress-bar').style.width = '100%';
        document.getElementById('gateway-repair-progress-text').textContent = '100%';
      } else if (result.success && !result.verified) {
        updateGatewayRepairProgress(4, 'error', 'Gateway 验证失败');
        addLog('warning', '[Gateway修复] 命令执行成功，但服务验证失败', {
          install: result.install?.success,
          start: result.start?.success
        }, 'system');
        addGatewayRepairLog('⚠️ 命令执行成功，但服务验证失败', 'warning');
        setGlobalStatus('⚠️ Gateway 命令已执行，请手动检查服务状态', 'warning');
        showNotification('Gateway 修复警告', '命令已执行，但服务可能未正常启动', 'warning');

        // 【v2.7.5 更新】使用统一样式
        stopGatewayRepairTimer();
        updateGatewayRepairUI('warning', 'Gateway 需要手动检查', '命令已执行，但服务验证未通过');
      } else {
        updateGatewayRepairProgress(4, 'error', `自动修复失败: ${result.error}`);
        addLog('error', `[Gateway修复] 自动修复失败: ${result.error}`, {}, 'system');
        addGatewayRepairLog(`❌ 自动修复失败: ${result.error}`, 'error');
        setGlobalStatus(`自动修复失败: ${result.error}`, 'error');

        // 【v2.7.5 更新】使用统一样式
        stopGatewayRepairTimer();
        updateGatewayRepairUI('error', 'Gateway 修复失败', result.error || '未知错误');
      }

      // 【v2.7.5 更新】启用关闭按钮
      enableGatewayRepairCloseButton();

      // 重新渲染面板
      await renderConfigStatusPanel();

      // 【v2.7.5 新增】刷新 Gateway 控制台 Token 状态（熄灭闪烁）
      if (typeof checkGatewayServiceStatus === 'function') {
        console.log('[ConfigStatus] 修复完成，刷新 Gateway Token 状态');
        await checkGatewayServiceStatus();
      }
    } else {
      throw new Error('autoRepairGateway 接口未实现');
    }
  } catch (error) {
    console.error('[ConfigStatus] 自动修复 Gateway 失败:', error);
    addLog('error', `[Gateway修复] 自动修复失败: ${error.message}`, {}, 'system');
    addGatewayRepairLog(`❌ 自动修复失败: ${error.message}`, 'error');
    setGlobalStatus('自动修复失败: ' + error.message, 'error');

    // 【v2.7.5 更新】使用统一样式
    stopGatewayRepairTimer();
    updateGatewayRepairUI('error', 'Gateway 修复失败', error.message);
    enableGatewayRepairCloseButton();
  }
}

/**
 * 显示 Gateway 修复命令
 */
function showGatewayCommands() {
  console.log('[ConfigStatus] 显示 Gateway 修复命令');

  const commands = [
    '# 查看当前 Token',
    'cat ~/.openclaw/openclaw.json | grep token',
    '',
    '# 手动设置 Token',
    'openclaw config set gateway.auth.token "your-token"',
    'openclaw config set gateway.remote.token "your-token"',
    '',
    '# 重启 Gateway',
    'openclaw gateway restart'
  ];

  alert('手动修复命令：\n\n' + commands.join('\n'));
}

/**
 * 【v2.7.5 新增】处理 Gateway Token 按钮点击
 * 根据当前状态决定是显示状态详情还是执行修复
 */
async function handleGatewayTokenButton() {
  console.log('[ConfigStatus] 处理 Gateway Token 按钮点击');

  // 先检查 Token 状态
  let tokenStatus;
  let hasAuthToken = false;
  let hasRemoteToken = false;
  let isConsistent = false;
  let tokenNeedsRepair = false;

  try {
    tokenStatus = await window.electronAPI.checkGatewayTokenStatus();
    hasAuthToken = !!tokenStatus.details?.authToken;
    hasRemoteToken = !!(tokenStatus.details?.remoteToken);
    isConsistent = !!(hasAuthToken && hasRemoteToken && tokenStatus.details?.isConsistent);
    tokenNeedsRepair = !hasAuthToken || !hasRemoteToken || !isConsistent;
  } catch (error) {
    console.error('[ConfigStatus] 检查 Token 状态失败:', error);
    tokenNeedsRepair = true;
  }

  if (tokenNeedsRepair) {
    // Token 异常：执行修复流程
    // 构建确认消息
    let message = '确定要修复 Gateway Token 吗？\n\n';
    message += '当前状态：\n';
    message += `- 服务端验证密钥: ${hasAuthToken ? '✅ 正常' : '❌ 缺失'}\n`;
    message += `- 客户端连接密钥: ${hasRemoteToken ? '✅ 正常' : '❌ 缺失'}\n`;
    message += `- 双密钥一致性: ${isConsistent ? '🛡️ 安全' : '⚠️ 需要修复'}\n\n`;
    message += '修复逻辑：\n';
    message += '1. 读取 openclaw.json 中的配置\n';
    message += '2. 以 auth.token（服务端）为准\n';
    message += '3. 将 remote.token（客户端）设置为相同值\n';
    message += '4. Gateway 将自动检测配置变化\n\n';
    message += '请确保已备份重要数据。';

    if (!confirm(message)) {
      return;
    }

    // 调用修复函数
    await fixGatewayToken();
  } else {
    // Token 正常：显示状态详情
    let message = '🛡️ Gateway Token 状态正常\n\n';
    message += '当前配置：\n';
    message += `- 服务端验证密钥: ✅ 已配置 (${tokenStatus.details?.authToken || '***'})\n`;
    message += `- 客户端连接密钥: ✅ 已配置 (${tokenStatus.details?.remoteToken || '***'})\n`;
    message += `- 双密钥一致性: 🛡️ 安全\n`;
    message += `- 认证方式: ${tokenStatus.details?.authMode || 'token'}\n\n`;
    message += '无需修复操作。';

    alert(message);
  }
}

/**
 * 【v2.7.5 新增】从 Gateway 控制台调用修复 Token（兼容旧调用）
 * 这个函数被 Gateway 控制台的"修复 Token"按钮调用
 * @deprecated 请使用 handleGatewayTokenButton()
 */
async function fixGatewayTokenFromConsole() {
  console.log('[ConfigStatus] fixGatewayTokenFromConsole 被调用，转发到 handleGatewayTokenButton');
  await handleGatewayTokenButton();
}

/**
 * 获取状态图标
 * @param {string} status - 状态值
 * @returns {string} 状态图标
 */
function getStatusIcon(status) {
  const iconMap = {
    normal: '✅',
    success: '✅',
    passed: '✅',
    warning: '⚠️',
    error: '❌',
    failed: '❌',
    empty: 'ℹ️',
    info: 'ℹ️',
    safe: '🛡️',
    missing: '❌'
  };
  return iconMap[status] || '❓';
}

/**
 * 初始化配置状态总览模块
 */
function initConfigStatusModal() {
  console.log('[ConfigStatus] 初始化配置状态总览模块');
  
  // 绑定查看详情按钮
  const viewDetailsBtn = document.getElementById('btn-view-config-details');
  if (viewDetailsBtn) {
    // 鼠标悬停显示提示
    viewDetailsBtn.addEventListener('mouseenter', () => {
      setGlobalStatus('查看详细配置状态，包括程序配置、OpenClaw配置和当前AI模型信息', 'info');
    });
    
    // 点击打开弹窗（先执行完整检测）
    viewDetailsBtn.addEventListener('click', async () => {
      console.log('[ConfigStatus] 查看详情按钮被点击，开始执行完整检测...');
      setGlobalStatus('🔍 正在执行完整配置检测...', 'info');
      
      try {
        // 执行完整检测
        await runFullConfigCheck();
        
        // 检测完成后打开弹窗
        await openConfigStatusModal();
      } catch (error) {
        console.error('[ConfigStatus] 完整检测失败:', error);
        setGlobalStatus('❌ 配置检测失败: ' + error.message, 'error');
        // 即使检测失败也打开弹窗，显示当前状态
        await openConfigStatusModal();
      }
    });
    console.log('[ConfigStatus] 已绑定查看详情按钮（带完整检测）');
  }
  
  // 绑定关闭按钮
  const closeBtn = document.getElementById('btn-close-config-status');
  const closeBtn2 = document.getElementById('btn-config-status-close');
  const overlay = document.getElementById('config-status-overlay');
  
  if (closeBtn) closeBtn.addEventListener('click', closeConfigStatusModal);
  if (closeBtn2) closeBtn2.addEventListener('click', closeConfigStatusModal);
  if (overlay) overlay.addEventListener('click', closeConfigStatusModal);
  
  // 绑定 ESC 键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('config-status-modal');
      if (modal && modal.classList.contains('show')) {
        closeConfigStatusModal();
      }
    }
  });
  
  console.log('[ConfigStatus] 配置状态总览模块初始化完成');
}
