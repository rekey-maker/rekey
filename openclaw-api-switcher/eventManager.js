// OpenClaw API Switcher - 事件管理模块
// 处理所有 DOM 事件监听和绑定

// 自定义确认对话框的 Promise 回调
let customConfirmResolve = null;

/**
 * 显示自定义确认对话框
 * @param {Object} options - 配置选项
 * @param {string} options.title - 标题
 * @param {Array} options.providers - 供应商列表
 * @param {string} options.infoTitle - 提示标题
 * @param {string} options.infoText - 提示内容
 * @param {string} options.guideTitle - 引导标题
 * @param {string} options.guideText - 引导内容
 * @param {string} options.question - 确认问题
 * @param {string} options.okText - 确定按钮文字
 * @param {string} options.cancelText - 取消按钮文字
 * @returns {Promise<boolean>} - 用户点击确定返回 true，取消返回 false
 */
function showCustomConfirm(options) {
  return new Promise((resolve) => {
    customConfirmResolve = resolve;
    
    const modal = document.getElementById('custom-confirm-modal');
    const overlay = document.getElementById('custom-confirm-overlay');
    const titleEl = document.getElementById('custom-confirm-title');
    const contentEl = document.getElementById('custom-confirm-content');
    const okBtn = document.getElementById('btn-custom-confirm-ok');
    const cancelBtn = document.getElementById('btn-custom-confirm-cancel');
    const closeBtn = document.getElementById('btn-close-custom-confirm');
    
    // 设置标题
    titleEl.textContent = options.title || '⚠️ 提示';
    
    // 构建内容 HTML
    let contentHtml = '';
    
    // 供应商列表
    if (options.providers && options.providers.length > 0) {
      contentHtml += `
        <div class="confirm-provider-list">
          <div class="list-title">📦 当前已有 ${options.providers.length} 个供应商配置</div>
          <div class="provider-items">
            ${options.providers.map(p => `<span class="provider-tag">${p.icon || '⚙️'} ${p.name}</span>`).join('')}
          </div>
        </div>
      `;
    }
    
    // 提示信息
    if (options.infoText) {
      contentHtml += `
        <div class="confirm-info-box">
          <div class="info-title">${options.infoTitle || 'ℹ️ 说明'}</div>
          <div class="info-text">${options.infoText}</div>
        </div>
      `;
    }
    
    // 引导操作
    if (options.guideText) {
      contentHtml += `
        <div class="confirm-guide">
          <div class="guide-title">${options.guideTitle || '💡 建议'}</div>
          <div class="guide-text">${options.guideText}</div>
        </div>
      `;
    }
    
    // 确认问题
    if (options.question) {
      contentHtml += `<div class="confirm-question">${options.question}</div>`;
    }
    
    contentEl.innerHTML = contentHtml;
    
    // 设置按钮文字
    okBtn.textContent = options.okText || '确定';
    cancelBtn.textContent = options.cancelText || '取消';
    
    // 显示对话框
    modal.style.display = 'block';
    overlay.style.display = 'block';
    
    // 绑定按钮事件
    const handleOk = () => {
      closeCustomConfirm();
      resolve(true);
    };
    
    const handleCancel = () => {
      closeCustomConfirm();
      resolve(false);
    };
    
    okBtn.onclick = handleOk;
    cancelBtn.onclick = handleCancel;
    closeBtn.onclick = handleCancel;
    overlay.onclick = handleCancel;
    
    // ESC 键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeCustomConfirm();
        resolve(false);
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  });
}

/**
 * 关闭自定义确认对话框
 */
function closeCustomConfirm() {
  const modal = document.getElementById('custom-confirm-modal');
  const overlay = document.getElementById('custom-confirm-overlay');
  
  if (modal) modal.style.display = 'none';
  if (overlay) overlay.style.display = 'none';
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
  // 添加 Provider 按钮 - 使用新的 API 配置模态框
  document.getElementById('btn-add-provider')?.addEventListener('click', () => {
    if (typeof openNewProviderModal === 'function') {
      openNewProviderModal();
    } else {
      console.error('[EventManager] openNewProviderModal 函数未定义');
      // 降级到旧的 openModal
      openModal();
    }
  });

  // 关闭按钮悬停提示
  setupCloseButtonHints();

  // 模态框关闭
  document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', () => {
    closeModal();
    closeEditModal();
    closeRequestDetail();
  });

  // 添加自定义 Provider
  document.getElementById('btn-add-custom')?.addEventListener('click', addCustomProvider);

  // 检查 Gateway - 执行完整的系统健康检查
  document.getElementById('btn-check-gateway')?.addEventListener('click', () => {
    // 执行完整的系统健康检查
    if (typeof performSystemHealthCheck === 'function') {
      performSystemHealthCheck();
    } else {
      // 降级：只检查 Gateway 状态
      setGlobalStatus('正在检查 Gateway...', 'info');
      checkGatewayStatus();
      if (typeof checkGatewayServiceStatus === 'function') {
        checkGatewayServiceStatus();
      }
    }
  });

  // 【v2.7.5】修复 Gateway 按钮 - 一键修复 Gateway 服务（后台自动执行）
  document.getElementById('btn-repair-gateway')?.addEventListener('click', async () => {
    // 显示确认对话框
    const confirmMessage = `🔧 修复 Gateway 服务

即将执行以下操作：
1. 重新安装 Gateway 服务
2. 启动 Gateway 服务
3. 验证服务状态

💡 提示：
• 此操作将在后台自动执行
• 修复过程可能需要 1-2 分钟
• 请留意顶部状态栏和日志输出

是否继续修复？`;

    const confirmed = confirm(confirmMessage);
    if (!confirmed) {
      setGlobalStatus('修复已取消', 'info');
      await window.electronAPI.addLog('info', '[Gateway修复] 用户取消修复操作', {}, 'system');
      return;
    }

    setGlobalStatus('正在后台修复 Gateway，请稍候...', 'info');
    await window.electronAPI.addLog('info', '[Gateway修复] 开始一键修复 Gateway 服务', {}, 'system');

    try {
      // 【v2.7.5】使用 autoRepairGateway 在后台自动执行修复
      const result = await window.electronAPI.autoRepairGateway();

      if (result.success) {
        setGlobalStatus('Gateway 修复成功！', 'success');
        await window.electronAPI.addLog('success', '[Gateway修复] Gateway 服务修复成功', {
          install: result.install?.success,
          start: result.start?.success,
          verified: result.verified
        }, 'system');
        // 刷新 Gateway 状态显示
        checkGatewayStatus();
        if (typeof checkGatewayServiceStatus === 'function') {
          checkGatewayServiceStatus();
        }
      } else {
        const errorMsg = result.error || '修复失败，请查看日志';
        setGlobalStatus(`修复失败: ${errorMsg}`, 'error');
        await window.electronAPI.addLog('error', `[Gateway修复] 修复失败: ${errorMsg}`, {
          install: result.install,
          start: result.start,
          verified: result.verified
        }, 'system');
      }
    } catch (error) {
      setGlobalStatus(`修复异常: ${error.message}`, 'error');
      await window.electronAPI.addLog('error', `[Gateway修复] 修复异常: ${error.message}`, {}, 'system');
    }
  });

  // 打开开发者工具按钮
  document.getElementById('btn-devtools')?.addEventListener('click', () => {
    window.electronAPI.openDevTools();
  });

  // API Key 显示/隐藏切换
  setupApiKeyToggle();

  // Gateway 相关悬停提示
  setupGatewayHoverHints();

  // API 备份按钮悬停提示
  setupBackupButtonHints();

  // Gateway 控制台快捷命令悬停提示
  setupCommandHints();

  // 诊断页状态指示器悬停提示
  setupDiagnosticStatusHints();

  // 会话操作按钮
  setupSessionButtons();

  // 主要功能按钮悬停提示
  setupMainButtonHints();

  // 移除应用配置按钮的默认 title 提示（防止浏览器显示默认 tooltip）
  const applyBtn = document.getElementById('btn-apply-config');
  if (applyBtn) {
    applyBtn.removeAttribute('title');
    // 监听鼠标进入事件，确保 title 不会被动态添加
    applyBtn.addEventListener('mouseenter', () => {
      applyBtn.removeAttribute('title');
    });
  }

  // 日志相关按钮
  document.getElementById('btn-clear-logs')?.addEventListener('click', clearLogs);
  setupLogFilterTabs();

  // 其他按钮
  document.getElementById('btn-test-connection')?.addEventListener('click', testConnection);
  document.getElementById('btn-toggle-key')?.addEventListener('click', toggleApiKey);
  document.getElementById('btn-backup-now')?.addEventListener('click', backupNow);
  document.getElementById('btn-check-config-health')?.addEventListener('click', checkConfigHealth);
  document.getElementById('btn-migrate-openclaw')?.addEventListener('click', () => {
    // 始终使用新的引导式迁移向导
    if (typeof MigrationWizard !== 'undefined') {
      setGlobalStatus('正在打开配置迁移向导...', 'info');
      MigrationWizard.init();
    } else {
      setGlobalStatus('✗ 迁移向导加载失败：MigrationWizard 未定义，请刷新页面重试', 'error');
    }
  });
  document.getElementById('btn-manage-migration')?.addEventListener('click', async () => {
    // 检查程序中是否已有供应商配置
    const apiConfig = await window.electronAPI.loadApiConfig();
    const hasProgramProviders = apiConfig && apiConfig.providers && Object.keys(apiConfig.providers).length > 0;
    
    if (hasProgramProviders) {
      // 程序中已有供应商，使用自定义对话框提示用户
      const providers = Object.entries(apiConfig.providers).map(([id, p]) => ({
        name: p.name || id,
        icon: p.icon || '⚙️'
      }));
      
      // 显示自定义确认对话框
      const userWantsToProceed = await showCustomConfirm({
        title: '⚠️ 配置提示',
        providers: providers,
        infoTitle: 'ℹ️ 迁移功能说明',
        infoText: '迁移功能主要用于从 OpenClaw 导入已有配置。如果您已经在程序中配置了供应商，通常无需再次迁移。',
        guideTitle: '💡 添加新供应商',
        guideText: '如需添加新的 API 供应商，请使用界面上的【添加】按钮，操作更直接便捷。',
        question: '确定仍要打开迁移向导吗？',
        okText: '仍要打开',
        cancelText: '取消'
      });
      
      if (!userWantsToProceed) {
        setGlobalStatus('已取消，如需添加供应商请使用【添加】按钮', 'info');
        return;
      }
    }
    
    // 打开迁移向导（管理配置模式）
    if (typeof MigrationWizard !== 'undefined') {
      setGlobalStatus('正在打开配置管理向导...', 'info');
      MigrationWizard.init();
    } else {
      setGlobalStatus('✗ 配置管理向导加载失败：MigrationWizard 未定义，请刷新页面重试', 'error');
    }
  });
  
  // 关闭迁移提醒按钮
  document.getElementById('btn-dismiss-migration')?.addEventListener('click', () => {
    if (typeof dismissMigrationReminder === 'function') {
      dismissMigrationReminder();
    }
    // 隐藏迁移区域
    const migrateSection = document.getElementById('migrate-section');
    const healthActionSection = document.getElementById('health-action-section');
    if (migrateSection) migrateSection.style.display = 'none';
    if (healthActionSection) healthActionSection.style.display = 'none';
  });
  document.getElementById('btn-cleanup-openclaw')?.addEventListener('click', cleanupOpenClawRedundant);

  // 添加 Provider 模态框按钮
  document.getElementById('btn-add-custom-model')?.addEventListener('click', () => {
    if (typeof addCustomModel === 'function') {
      addCustomModel();
    }
  });
  document.getElementById('btn-test-api-connection')?.addEventListener('click', () => {
    if (typeof testApiConnection === 'function') {
      testApiConnection();
    }
  });
  // 【v2.7.5】保存按钮事件已在 newApiConfigManager.js 中绑定，此处移除避免重复

  // 编辑 Provider 模态框按钮
  document.getElementById('btn-close-edit')?.addEventListener('click', closeEditModal);
  document.getElementById('btn-cancel-edit')?.addEventListener('click', closeEditModal);
  document.getElementById('btn-edit-add-model')?.addEventListener('click', () => {
    if (typeof addCustomModelToEditModal === 'function') {
      addCustomModelToEditModal();
    }
  });
  document.getElementById('btn-save-edit')?.addEventListener('click', () => {
    if (typeof saveEditProvider === 'function') {
      saveEditProvider();
    }
  });

  // 打开 OpenClaw 配置目录
  document.getElementById('btn-open-openclaw-config')?.addEventListener('click', () => {
    window.electronAPI.openOpenClawConfigDir();
    setGlobalStatus('已打开 OpenClaw 配置目录', 'success');
  });

  // 重启 Gateway
  document.getElementById('btn-restart-gateway')?.addEventListener('click', () => {
    if (typeof restartGateway === 'function') {
      restartGateway();
    }
  });

  // 应用配置按钮（安全切换功能）
  const btnApplyConfig = document.getElementById('btn-apply-config');
  btnApplyConfig?.addEventListener('click', () => {
    const pendingProvider = StateManager.getPendingProvider();
    if (pendingProvider && !StateManager.getIsApplying()) {
      if (typeof applyConfiguration === 'function') {
        applyConfiguration();
      } else {
        setGlobalStatus('应用配置功能不可用', 'error');
      }
    }
  });
  
  // 应用配置按钮悬停提示
  btnApplyConfig?.addEventListener('mouseenter', () => {
    const pendingProvider = StateManager.getPendingProvider();
    const apiTestingStatus = StateManager.getApiTestingStatus();
    
    if (apiTestingStatus === 'testing') {
      setGlobalStatus('正在检测 API 连接，请稍候...', 'info');
    } else if (pendingProvider) {
      setGlobalStatus('点击将 ' + pendingProvider + ' 同步到 OpenClaw', 'info');
    } else {
      setGlobalStatus('选择供应商后可同步到 OpenClaw', 'info');
    }
  });
  
  btnApplyConfig?.addEventListener('mouseleave', () => {
    // 恢复默认状态或保持当前重要状态
    const pendingProvider = StateManager.getPendingProvider();
    if (!pendingProvider) {
      setGlobalStatus('就绪', 'info');
    }
  });
  
  // 右上角状态标签悬停提示
  const currentStatusEl = document.getElementById('current-status');
  currentStatusEl?.addEventListener('mouseenter', () => {
    const pendingProvider = StateManager.getPendingProvider();
    const appliedProvider = StateManager.getAppliedProvider();
    const selectedProvider = StateManager.getSelectedProvider();
    
    if (pendingProvider) {
      setGlobalStatus('配置待同步：已选择 ' + pendingProvider + '，点击【应用配置】同步到 OpenClaw', 'warning');
    } else if (appliedProvider && appliedProvider === selectedProvider) {
      setGlobalStatus('配置已同步：' + appliedProvider + ' 已激活，Gateway 运行正常', 'success');
    } else {
      setGlobalStatus('配置未同步：请选择供应商并应用配置', 'info');
    }
  });
  
  currentStatusEl?.addEventListener('mouseleave', () => {
    // 恢复默认状态
    const pendingProvider = StateManager.getPendingProvider();
    if (!pendingProvider) {
      setGlobalStatus('就绪', 'info');
    }
  });

  // 安装 Gateway 服务
  document.getElementById('btn-install-gateway')?.addEventListener('click', () => {
    if (typeof runDangerousCommand === 'function') {
      // 确认安装
      if (confirm('⚠️ 安装 Gateway 服务\n\n这将安装 Gateway 为系统服务（LaunchAgent），开机自动启动。\n\n是否继续？')) {
        runDangerousCommand('gateway install');
      }
    }
  });

  // 检查更新
  document.getElementById('btn-check-updates')?.addEventListener('click', () => {
    if (typeof checkUpdates === 'function') {
      checkUpdates();
    }
  });

  // 请求相关
  document.getElementById('btn-clear-requests')?.addEventListener('click', clearRequests);
  document.getElementById('btn-export-logs')?.addEventListener('click', exportLogs);
  document.getElementById('btn-open-logs-dir')?.addEventListener('click', openLogsDirectory);

  // 自定义名称输入
  document.getElementById('custom-name')?.addEventListener('input', (e) => {
    renderAddModalModelGrid(e.target.value);
  });

  // ESC 键关闭模态框
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeEditModal();
      closeRequestDetail();
    }
  });

  // 页面卸载时清理定时器
  window.addEventListener('beforeunload', () => {
    StateManager.clearAutoConnectionInterval();
  });

  // ==================== 紧急停止模块按钮事件绑定 ====================
  
  // 普通停止按钮
  document.getElementById('btn-normal-stop')?.addEventListener('click', () => {
    if (typeof showNormalStopModal === 'function') {
      showNormalStopModal();
    } else {
      setGlobalStatus('✗ 停止功能不可用：showNormalStopModal 未定义', 'error');
    }
  });

  // 紧急停止按钮
  document.getElementById('btn-emergency-stop')?.addEventListener('click', () => {
    if (typeof showEmergencyStopModal === 'function') {
      showEmergencyStopModal();
    } else {
      setGlobalStatus('✗ 紧急停止功能不可用：showEmergencyStopModal 未定义', 'error');
    }
  });

  // 普通恢复按钮
  document.getElementById('btn-normal-restore')?.addEventListener('click', () => {
    if (typeof showNormalRestoreConfirm === 'function') {
      showNormalRestoreConfirm();
    } else {
      setGlobalStatus('✗ 恢复功能不可用：showNormalRestoreConfirm 未定义', 'error');
    }
  });

  // 紧急恢复按钮
  document.getElementById('btn-emergency-restore')?.addEventListener('click', () => {
    if (typeof showEmergencyRestoreConfirm === 'function') {
      showEmergencyRestoreConfirm();
    } else {
      setGlobalStatus('✗ 紧急恢复功能不可用：showEmergencyRestoreConfirm 未定义', 'error');
    }
  });

  // 停止/恢复按钮悬停提示
  const stopRestoreButtons = [
    { id: 'btn-normal-stop', hint: '临时停用 OpenClaw，保留配置，可随时恢复' },
    { id: 'btn-emergency-stop', hint: '安全阻断 OpenClaw，清空配置并破坏 Token' },
    { id: 'btn-normal-restore', hint: '恢复 OpenClaw 配置并继续使用' },
    { id: 'btn-emergency-restore', hint: '从紧急备份恢复所有配置和 Token' }
  ];

  stopRestoreButtons.forEach(({ id, hint }) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('mouseenter', () => {
        setGlobalStatus(hint, 'info');
      });
      btn.addEventListener('mouseleave', () => {
        resetGlobalStatusBar();
      });
    }
  });
  
}

/**
 * 设置关闭按钮悬停提示
 */
function setupCloseButtonHints() {
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCloseEdit = document.getElementById('btn-close-edit');

  [btnCloseModal, btnCloseEdit].forEach(btn => {
    if (btn) {
      btn.addEventListener('mouseenter', () => {
        const hint = btn.getAttribute('data-status-hint');
        if (hint) {
          setGlobalStatus(hint, 'info');
        }
      });
      btn.addEventListener('mouseleave', () => {
        resetGlobalStatusBar();
      });
    }
  });
}

/**
 * 设置 API Key 切换
 */
function setupApiKeyToggle() {
  document.body.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btn-toggle-api-key') {
      const apiKeyInput = document.getElementById('config-api-key');
      if (apiKeyInput) {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        e.target.textContent = isPassword ? '🙈' : '👁️';
        e.target.title = isPassword ? '隐藏 API Key' : '显示 API Key';
      }
    }
  });
}

/**
 * 设置 Gateway 悬停提示
 */
function setupGatewayHoverHints() {
  const gatewayLabel = document.querySelector('.gateway-service-label');
  const gatewayStatusDot = document.getElementById('gateway-status-dot');
  const gatewayStatusText = document.getElementById('gateway-status-text');
  const btnCheckGateway = document.getElementById('btn-check-gateway');
  const btnOpenConfig = document.getElementById('btn-open-openclaw-config');
  
  // 【修复】检测平台
  const isWin = navigator.platform.toLowerCase().includes('win');
  const defaultCmd = isWin ? 'node openclaw.mjs' : 'openclaw';

  // 系统检查标签 - 配置文件（OpenClaw 配置完整性）
  const configCheckLabel = document.querySelector('#check-config .check-label');
  configCheckLabel?.addEventListener('mouseenter', () => {
    setGlobalStatus('OpenClaw 配置文件：检查 ~/.openclaw/ 目录下的配置文件是否完整', 'info');
  });
  configCheckLabel?.addEventListener('mouseleave', () => {
    resetGlobalStatusBar();
  });

  // 系统检查标签 - 程序配置
  const programCheckLabel = document.querySelector('#check-program .check-label');
  programCheckLabel?.addEventListener('mouseenter', () => {
    setGlobalStatus('程序配置：检查本程序的 API 供应商配置', 'info');
  });
  programCheckLabel?.addEventListener('mouseleave', () => {
    resetGlobalStatusBar();
  });

  // 系统检查标签 - Gateway
  const gatewayCheckLabel = document.querySelector('#check-gateway .check-label');
  gatewayCheckLabel?.addEventListener('mouseenter', () => {
    setGlobalStatus('Gateway：本地 API 代理服务，用于转发请求到各 AI 提供商', 'info');
  });
  gatewayCheckLabel?.addEventListener('mouseleave', () => {
    resetGlobalStatusBar();
  });

  // Gateway 服务标签
  gatewayLabel?.addEventListener('mouseenter', () => {
    setGlobalStatus('Gateway 服务：本地 API 代理，用于连接 OpenAI、Kimi 等 AI 服务', 'info');
  });
  gatewayLabel?.addEventListener('mouseleave', () => {
    resetGlobalStatusBar();
  });

  // 检查按钮
  btnCheckGateway?.addEventListener('mouseenter', () => {
    setGlobalStatus('点击检查 Gateway 服务运行状态', 'info');
  });
  btnCheckGateway?.addEventListener('mouseleave', () => {
    resetGlobalStatusBar();
  });

  // 目录按钮
  btnOpenConfig?.addEventListener('mouseenter', () => {
    setGlobalStatus('点击打开 OpenClaw 配置目录', 'info');
  });
  btnOpenConfig?.addEventListener('mouseleave', () => {
    resetGlobalStatusBar();
  });

  // 【v2.7.5】修复 Gateway 按钮
  const btnRepairGateway = document.getElementById('btn-repair-gateway');
  btnRepairGateway?.addEventListener('mouseenter', () => {
    setGlobalStatus('🔧 修复 Gateway：后台自动重新安装并启动 Gateway 服务（适用于 Gateway 无法启动的情况）', 'warning');
  });
  btnRepairGateway?.addEventListener('mouseleave', () => {
    resetGlobalStatusBar();
  });

  // 重启 Gateway 按钮
  const btnRestartGateway = document.getElementById('btn-restart-gateway');
  btnRestartGateway?.addEventListener('mouseenter', () => {
    setGlobalStatus('🔄 重启 Gateway：安全地停止并重新启动 Gateway 服务（约需 1 分钟）', 'warning');
  });
  btnRestartGateway?.addEventListener('mouseleave', () => {
    resetGlobalStatusBar();
  });
}

/**
 * 设置 API 备份按钮悬停提示
 */
function setupBackupButtonHints() {
  const btnInitBackup = document.getElementById('btn-initialize-config');
  const btnBackupNow = document.getElementById('btn-backup-now');

  // 初始化按钮
  btnInitBackup?.addEventListener('mouseenter', () => {
    setGlobalStatus('初始化：重置所有配置为默认状态，将删除现有配置（危险操作）', 'warning');
  });
  btnInitBackup?.addEventListener('mouseleave', () => {
    resetGlobalStatusBar();
  });

  // 立即备份按钮
  btnBackupNow?.addEventListener('mouseenter', () => {
    setGlobalStatus('💾 立即备份：创建当前配置的备份文件', 'info');
  });
  btnBackupNow?.addEventListener('mouseleave', () => {
    resetGlobalStatusBar();
  });
}

/**
 * 设置诊断页状态指示器悬停提示
 */
function setupDiagnosticStatusHints() {
  const commandStatusBar = document.getElementById('command-status-bar');
  const commandStatusContent = commandStatusBar?.querySelector('.status-content');

  if (!commandStatusBar || !commandStatusContent) return;

  // Gateway 运行状态
  const diagGatewayRunning = document.getElementById('diag-gateway-running');
  const diagRunningText = document.getElementById('diag-running-text');

  const handleGatewayRunningHover = () => {
    const statusText = diagRunningText?.textContent || '未知';
    let desc = 'Gateway 服务运行状态';
    if (statusText.includes('运行中') || statusText.includes('在线')) {
      desc += '：服务正常运行中';
    } else if (statusText.includes('停止') || statusText.includes('离线')) {
      desc += '：服务未运行，点击"检查"或运行 start 命令启动';
    } else if (statusText.includes('检测中') || statusText.includes('检查中')) {
      desc += '：正在检测...';
    }
    commandStatusContent.innerHTML = `
      <code class="status-cmd">Gateway</code>
      <span class="status-separator">|</span>
      <span class="status-desc">${desc}</span>
      <span class="status-risk low">状态</span>
    `;
    commandStatusBar?.classList.add('active');
  };

  const handleGatewayRunningLeave = () => {
    commandStatusContent.innerHTML = `
      <code class="status-cmd">${defaultCmd}</code>
      <span class="status-separator">|</span>
      <span class="status-desc">悬停在上方命令按钮查看详情</span>
      <span class="status-risk low">提示</span>
    `;
    commandStatusBar?.classList.remove('active');
  };

  diagGatewayRunning?.addEventListener('mouseenter', handleGatewayRunningHover);
  diagGatewayRunning?.addEventListener('mouseleave', handleGatewayRunningLeave);
  diagRunningText?.addEventListener('mouseenter', handleGatewayRunningHover);
  diagRunningText?.addEventListener('mouseleave', handleGatewayRunningLeave);

  // Gateway 连接状态
  const diagGatewayConnection = document.getElementById('diag-gateway-connection');
  const diagConnectionText = document.getElementById('diag-connection-text');

  const handleGatewayConnectionHover = () => {
    const statusText = diagConnectionText?.textContent || '未知';
    let desc = 'Gateway 连接状态';
    if (statusText.includes('正常') || statusText.includes('成功')) {
      desc += '：端口 18789 可访问';
    } else if (statusText.includes('失败') || statusText.includes('错误')) {
      desc += '：端口 18789 无法访问';
    } else if (statusText.includes('检测中') || statusText.includes('检查中')) {
      desc += '：正在检测...';
    } else {
      desc += '：' + statusText;
    }
    commandStatusContent.innerHTML = `
      <code class="status-cmd">Gateway</code>
      <span class="status-separator">|</span>
      <span class="status-desc">${desc}</span>
      <span class="status-risk low">连接</span>
    `;
    commandStatusBar?.classList.add('active');
  };

  const handleGatewayConnectionLeave = () => {
    commandStatusContent.innerHTML = `
      <code class="status-cmd">${defaultCmd}</code>
      <span class="status-separator">|</span>
      <span class="status-desc">悬停在上方命令按钮查看详情</span>
      <span class="status-risk low">提示</span>
    `;
    commandStatusBar?.classList.remove('active');
  };

  diagGatewayConnection?.addEventListener('mouseenter', handleGatewayConnectionHover);
  diagGatewayConnection?.addEventListener('mouseleave', handleGatewayConnectionLeave);
  diagConnectionText?.addEventListener('mouseenter', handleGatewayConnectionHover);
  diagConnectionText?.addEventListener('mouseleave', handleGatewayConnectionLeave);

  // 最后检查时间
  const diagGatewayLastcheck = document.getElementById('diag-gateway-lastcheck');
  const diagLastcheckText = document.getElementById('diag-lastcheck-text');

  const handleLastcheckHover = () => {
    const timeText = diagLastcheckText?.textContent || '--:--:--';
    commandStatusContent.innerHTML = `
      <code class="status-cmd">时间</code>
      <span class="status-separator">|</span>
      <span class="status-desc">最后检查时间：${timeText}</span>
      <span class="status-risk low">记录</span>
    `;
    commandStatusBar?.classList.add('active');
  };

  const handleLastcheckLeave = () => {
    commandStatusContent.innerHTML = `
      <code class="status-cmd">${defaultCmd}</code>
      <span class="status-separator">|</span>
      <span class="status-desc">悬停在上方命令按钮查看详情</span>
      <span class="status-risk low">提示</span>
    `;
    commandStatusBar?.classList.remove('active');
  };

  diagGatewayLastcheck?.addEventListener('mouseenter', handleLastcheckHover);
  diagGatewayLastcheck?.addEventListener('mouseleave', handleLastcheckLeave);
  diagLastcheckText?.addEventListener('mouseenter', handleLastcheckHover);
  diagLastcheckText?.addEventListener('mouseleave', handleLastcheckLeave);

  // 【v2.7.5 新增】Token 状态按钮悬停提示
  const tokenStatusBtn = document.getElementById('btn-fix-gateway-token');
  const tokenStatusText = document.getElementById('token-status-text');

  const handleTokenStatusHover = () => {
    const statusText = tokenStatusText?.textContent || '未知';
    let desc = 'Gateway Token 状态';
    let risk = 'low';

    if (statusText.includes('正常')) {
      desc += '：配置正常，点击查看详情';
      risk = 'low';
    } else if (statusText.includes('修复')) {
      desc += '：配置异常，点击修复 Token';
      risk = 'medium';
    } else {
      desc += '：正在检测...';
      risk = 'low';
    }

    commandStatusContent.innerHTML = `
      <code class="status-cmd">Token</code>
      <span class="status-separator">|</span>
      <span class="status-desc">${desc}</span>
      <span class="status-risk ${risk}">${risk === 'medium' ? '注意' : '安全'}</span>
    `;
    commandStatusBar?.classList.add('active');
  };

  const handleTokenStatusLeave = () => {
    commandStatusContent.innerHTML = `
      <code class="status-cmd">${defaultCmd}</code>
      <span class="status-separator">|</span>
      <span class="status-desc">悬停在上方命令按钮查看详情</span>
      <span class="status-risk low">提示</span>
    `;
    commandStatusBar?.classList.remove('active');
  };

  tokenStatusBtn?.addEventListener('mouseenter', handleTokenStatusHover);
  tokenStatusBtn?.addEventListener('mouseleave', handleTokenStatusLeave);
  tokenStatusText?.addEventListener('mouseenter', handleTokenStatusHover);
  tokenStatusText?.addEventListener('mouseleave', handleTokenStatusLeave);
}

/**
 * 设置 Gateway 控制台快捷命令悬停提示
 */
function setupCommandHints() {
  const cmdButtons = document.querySelectorAll('.cmd-btn');
  const statusBar = document.getElementById('command-status-bar');
  const statusContent = statusBar?.querySelector('.status-content');

  if (!statusBar || !statusContent) return;

  // 【修复】检测平台
  const isWin = navigator.platform.toLowerCase().includes('win');

  cmdButtons.forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      let cmd = btn.dataset.cmd || '';
      const desc = btn.dataset.desc || '';
      const risk = btn.dataset.risk || 'low';
      const isInteractive = btn.dataset.interactive === 'true';

      // 【修复】Windows 上显示正确的命令格式
      if (isWin && cmd.startsWith('openclaw')) {
        cmd = cmd.replace('openclaw', 'node openclaw.mjs');
      }

      // 构建提示文本
      let html = '';
      if (cmd) html += `<code class="status-cmd">${cmd}</code>`;
      if (desc) {
        if (html) html += ' <span class="status-separator">|</span> ';
        html += `<span class="status-desc">${desc}</span>`;
      }

      // 添加交互式警示（黄色）
      if (isInteractive) {
        html += ' <span class="status-risk interactive">⚠️ 交互式命令</span>';
      }

      // 添加风险警示
      if (risk === 'critical') {
        html += ' <span class="status-risk critical">⚠️ 危险</span>';
      } else if (risk === 'high') {
        html += ' <span class="status-risk high">⚠️ 警告</span>';
      } else if (risk === 'medium') {
        html += ' <span class="status-risk medium">注意</span>';
      } else {
        html += ' <span class="status-risk low">安全</span>';
      }

      statusContent.innerHTML = html;
      statusBar.classList.add('active');
    });

    // 鼠标离开时不立即恢复默认状态，保持提示显示
    // 当鼠标移动到其他非命令区域时再恢复
  });

  // 添加全局点击事件，当点击其他地方时恢复默认状态
  document.addEventListener('click', (e) => {
    const isCmdArea = e.target.closest('.gateway-console');
    if (!isCmdArea && statusBar.classList.contains('active')) {
      // 【修复】根据平台显示默认命令
      const defaultCmd = isWin ? 'node openclaw.mjs' : 'openclaw';
      statusContent.innerHTML = `
        <code class="status-cmd">${defaultCmd}</code>
        <span class="status-separator">|</span>
        <span class="status-desc">悬停在上方命令按钮查看详情</span>
        <span class="status-risk low">提示</span>
      `;
      statusBar.classList.remove('active');
    }
  });
}

/**
 * 设置会话按钮
 */
function setupSessionButtons() {
  // 迷你会话按钮
  document.getElementById('btn-refresh-session-mini')?.addEventListener('click', () => {
    updateMiniSessionInfo();
    setGlobalStatus('会话信息已刷新', 'success');
  });

  document.getElementById('btn-clear-context-mini')?.addEventListener('click', async () => {
    if (confirm('确定要清理飞书会话历史吗？这将释放 Token 空间。')) {
      try {
        const result = await window.electronAPI.clearLarkSessions();
        if (result.success) {
          const countMsg = result.deletedCount > 0 ? `(${result.deletedCount}个会话)` : '';
          setGlobalStatus(`飞书会话已清理${countMsg}，Token 空间已释放`, 'success');
          addLog('info', '清理飞书会话', `${result.message} ${countMsg}`, 'user');
          // 刷新会话信息显示
          if (typeof updateMiniSessionInfo === 'function') {
            await updateMiniSessionInfo();
          }
        } else {
          setGlobalStatus('清理失败: ' + result.message, 'error');
          addLog('error', '清理飞书会话失败', result.message, 'user');
        }
      } catch (error) {
        setGlobalStatus('清理失败: ' + error.message, 'error');
        addLog('error', '清理飞书会话异常', error.message, 'user');
      }
    }
  });

  document.getElementById('btn-new-session-mini')?.addEventListener('click', () => {
    if (confirm('确定要开启新会话吗？这将开始一个全新的对话。')) {
      setGlobalStatus('新会话已开启', 'success');
      addLog('info', '新会话（迷你按钮）', '', 'user');
    }
  });

  document.getElementById('btn-restart-app-mini')?.addEventListener('click', () => {
    if (confirm('⚠️ 确定要重启应用吗？这将重置所有状态并重新加载。')) {
      location.reload();
    }
  });

  // 会话操作按钮悬停提示
  document.querySelectorAll('.session-op-btn-mini').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      const hint = btn.getAttribute('data-status-hint');
      if (hint) {
        setGlobalStatus(hint, 'info');
      }
    });
    btn.addEventListener('mouseleave', () => {
      resetGlobalStatusBar();
    });
  });
}

/**
 * 设置主要功能按钮的悬停提示
 * 为测试连接、扫描配置、迁移配置、检查、会话刷新等按钮添加全局状态栏提示
 */
function setupMainButtonHints() {
  // 测试连接按钮
  const btnTestConnection = document.getElementById('btn-test-connection');
  if (btnTestConnection) {
    btnTestConnection.addEventListener('mouseenter', () => {
      setGlobalStatus('测试连接：手动测试当前选中 Provider 的 API 连接状态', 'info');
    });
    btnTestConnection.addEventListener('mouseleave', () => {
      resetGlobalStatusBar();
    });
  }

  // 扫描配置按钮
  const btnCheckConfigHealth = document.getElementById('btn-check-config-health');
  if (btnCheckConfigHealth) {
    btnCheckConfigHealth.addEventListener('mouseenter', () => {
      setGlobalStatus('扫描配置：检查程序配置和 OpenClaw 配置的差异，查看是否有可迁移的配置', 'info');
    });
    btnCheckConfigHealth.addEventListener('mouseleave', () => {
      resetGlobalStatusBar();
    });
  }

  // 迁移配置按钮
  const btnManageMigration = document.getElementById('btn-manage-migration');
  if (btnManageMigration) {
    btnManageMigration.addEventListener('mouseenter', () => {
      setGlobalStatus('迁移配置：打开迁移向导，将 OpenClaw 中的配置导入到本程序', 'info');
    });
    btnManageMigration.addEventListener('mouseleave', () => {
      resetGlobalStatusBar();
    });
  }

  // 检查按钮（Gateway 检查）
  const btnCheckGateway = document.getElementById('btn-check-gateway');
  if (btnCheckGateway) {
    btnCheckGateway.addEventListener('mouseenter', () => {
      setGlobalStatus('检查：执行完整的系统健康检查，包括 Gateway 服务、OpenClaw 配置、API 密钥等', 'info');
    });
    btnCheckGateway.addEventListener('mouseleave', () => {
      resetGlobalStatusBar();
    });
  }

  // 会话刷新按钮
  const btnRefreshSessionMini = document.getElementById('btn-refresh-session-mini');
  if (btnRefreshSessionMini) {
    btnRefreshSessionMini.addEventListener('mouseenter', () => {
      setGlobalStatus('会话刷新：刷新当前会话的 Token 使用情况和运行时间信息', 'info');
    });
    btnRefreshSessionMini.addEventListener('mouseleave', () => {
      resetGlobalStatusBar();
    });
  }

  // 安全切换标签
  const safeSwitchStatus = document.getElementById('safe-switch-status');
  if (safeSwitchStatus) {
    safeSwitchStatus.addEventListener('mouseenter', () => {
      const hint = safeSwitchStatus.getAttribute('data-status-hint');
      if (hint) {
        setGlobalStatus(hint, 'info');
      }
    });
    safeSwitchStatus.addEventListener('mouseleave', () => {
      resetGlobalStatusBar();
    });
  }

  // 当前状态标签（未激活/就绪等）
  const currentStatus = document.getElementById('current-status');
  if (currentStatus) {
    currentStatus.addEventListener('mouseenter', () => {
      const hint = currentStatus.getAttribute('data-status-hint');
      if (hint) {
        setGlobalStatus(hint, 'info');
      }
    });
    currentStatus.addEventListener('mouseleave', () => {
      resetGlobalStatusBar();
    });
  }

  // 应用配置按钮
  const btnApplyConfig = document.getElementById('btn-apply-config');
  if (btnApplyConfig) {
    btnApplyConfig.addEventListener('mouseenter', () => {
      const hint = btnApplyConfig.getAttribute('data-status-hint');
      if (hint) {
        setGlobalStatus(hint, 'info');
      }
    });
    btnApplyConfig.addEventListener('mouseleave', () => {
      resetGlobalStatusBar();
    });
  }

  // 添加供应商按钮
  const btnAddProvider = document.getElementById('btn-add-provider');
  if (btnAddProvider) {
    btnAddProvider.addEventListener('mouseenter', () => {
      const hint = btnAddProvider.getAttribute('data-status-hint');
      if (hint) {
        setGlobalStatus(hint, 'info');
      }
    });
    btnAddProvider.addEventListener('mouseleave', () => {
      resetGlobalStatusBar();
    });
  }

  // 备份详情弹窗按钮（动态绑定）
  document.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.btn-restore-action, .btn-delete-action');
    if (btn) {
      const hint = btn.getAttribute('data-status-hint');
      if (hint) {
        setGlobalStatus(hint, 'info');
      }
    }
  });
  document.addEventListener('mouseout', (e) => {
    const btn = e.target.closest('.btn-restore-action, .btn-delete-action');
    if (btn) {
      resetGlobalStatusBar();
    }
  });

  // 供应商卡片按钮（动态绑定）
  document.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.provider-actions .btn-edit, .provider-actions .btn-save, .provider-actions .btn-danger, .drag-handle, .provider-url');
    if (btn) {
      const hint = btn.getAttribute('data-status-hint');
      if (hint) {
        setGlobalStatus(hint, 'info');
      }
    }
  });
  document.addEventListener('mouseout', (e) => {
    const btn = e.target.closest('.provider-actions .btn-edit, .provider-actions .btn-save, .provider-actions .btn-danger, .drag-handle, .provider-url');
    if (btn) {
      resetGlobalStatusBar();
    }
  });
}

/**
 * 设置日志筛选标签
 */
function setupLogFilterTabs() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    // 点击事件
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      setLogFilter(tab.dataset.filter);
    });

    // 悬停提示
    tab.addEventListener('mouseenter', () => {
      const hint = tab.getAttribute('data-status-hint');
      if (hint) {
        setGlobalStatus(hint, 'info');
      }
    });
    tab.addEventListener('mouseleave', () => {
      resetGlobalStatusBar();
    });
  });
}

/**
 * 切换 API Key 显示
 */
async function toggleApiKey() {
  const keyDisplay = document.getElementById('api-key-display');
  const keySpan = document.getElementById('current-api-key');
  const btn = document.getElementById('btn-toggle-key');
  if (!keyDisplay || !keySpan) return;

  const isVisible = !StateManager.isApiKeyVisible();
  StateManager.setApiKeyVisible(isVisible);

  // 从 api-config.json 获取当前配置
  const apiConfig = await window.electronAPI.loadApiConfig();
  const currentModel = apiConfig?.selectedModel || '';
  if (!currentModel) return;

  const [providerName] = currentModel.split('/');
  const provider = apiConfig.providers?.[providerName];
  if (!provider) return;

  if (isVisible) {
    keySpan.textContent = provider.apiKey || '未设置';
    if (btn) btn.textContent = '🙈';
  } else {
    keySpan.textContent = provider.apiKey ? maskKey(provider.apiKey) : '未设置';
    if (btn) btn.textContent = '👁️';
  }
}

/**
 * 清空请求列表
 */
function clearRequests() {
  StateManager.setRequestList([]);
  renderRequests();
  addLog('info', '清空请求列表', '', 'user');
}

/**
 * 初始化全局 data-status-hint 悬停提示
 * 为所有带有 data-status-hint 属性的元素添加悬停提示
 */
function initGlobalStatusHints() {
  // 使用事件委托处理所有 data-status-hint 元素
  document.body.addEventListener('mouseenter', (e) => {
    const target = e.target.closest('[data-status-hint]');
    if (target) {
      const hint = target.getAttribute('data-status-hint');
      if (hint) {
        setGlobalStatus(hint, 'info');
      }
    }
  }, true);

  document.body.addEventListener('mouseleave', (e) => {
    const target = e.target.closest('[data-status-hint]');
    if (target) {
      resetGlobalStatusBar();
    }
  }, true);
}
