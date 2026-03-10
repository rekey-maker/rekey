// OpenClaw API Switcher - 停止管理模块
// 处理普通停止、紧急停止、恢复功能

// 停止状态
let stopState = {
  normalStopped: false,
  emergencyStopped: false,
  backupId: null,
  backupFileName: null
};

// 恢复流程状态
let restoreFlowState = {
  isRestoring: false,
  currentType: null,
  startTime: null,
  timerInterval: null,
  verificationResults: []
};

/**
 * 轮询等待函数
 * @param {Function} checkFn - 检测函数，返回 { success: boolean }
 * @param {number} maxWaitTime - 最大等待时间（毫秒）
 * @param {number} interval - 轮询间隔（毫秒）
 * @param {Function} onPoll - 每次轮询回调(attempt, elapsed)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function pollWithTimeout(checkFn, maxWaitTime, interval, onPoll) {
  const startTime = Date.now();
  let attempt = 0;
  
  while (Date.now() - startTime < maxWaitTime) {
    attempt++;
    const elapsed = Date.now() - startTime;
    
    // 执行检测
    const result = await checkFn();
    
    if (result.success) {
      return result;
    }
    
    // 回调通知
    if (onPoll) {
      onPoll(attempt, elapsed);
    }
    
    // 等待后重试
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  // 超时
  return {
    success: false,
    error: `等待超时（${maxWaitTime / 1000}秒），服务未能正常启动`
  };
}

/**
 * 初始化停止管理器
 * 检查是否有未完成的停止状态（应用重启后）
 * 修复：同时检查配置文件实际状态，避免与Gateway实际状态不一致
 */
async function initStopManager() {
  console.log('[StopManager] 初始化停止管理器');
  
  try {
    // 【关键修复】先检查 openclaw.json 实际配置状态
    // 如果配置中有供应商数据，说明不是停止状态，应该显示正常状态
    const configCheck = await window.electronAPI.verifyOpenclawConfig?.();
    const hasProviders = configCheck?.success && 
                         configCheck?.config?.models?.providers && 
                         Object.keys(configCheck.config.models.providers).length > 0;
    
    if (hasProviders) {
      console.log('[StopManager] 检测到配置中有供应商数据，显示正常状态');
      // 重置状态为正常
      stopState.normalStopped = false;
      stopState.emergencyStopped = false;
      stopState.backupFileName = null;
      stopState.backupId = null;
      updateStopButtonsVisibility();
      console.log('[StopManager] 状态已重置为正常（配置中有供应商数据）');
      
      // 【v2.7 修复】如果配置已恢复，删除临时备份文件，避免恢复按钮重复显示
      try {
        if (window.electronAPI?.clearTempBackup) {
          await window.electronAPI.clearTempBackup();
          console.log('[StopManager] 已清理临时备份文件');
        }
        if (window.electronAPI?.clearEmergencyStopState) {
          await window.electronAPI.clearEmergencyStopState();
          console.log('[StopManager] 已清理紧急停止状态');
        }
      } catch (e) {
        console.warn('[StopManager] 清理备份文件失败:', e);
      }
      
      return;
    }
    
    // 检查是否有临时备份（普通停止）
    const tempBackupCheck = await window.electronAPI.checkTempBackup?.();
    if (tempBackupCheck?.exists) {
      console.log('[StopManager] 发现临时备份，普通停止状态', tempBackupCheck);
      stopState.normalStopped = true;
      stopState.backupFileName = tempBackupCheck.fileName;
      updateStopButtonsVisibility();
      setGlobalStatus(`⏹ OpenClaw 处于停止状态，点击恢复可继续使用`, 'info');
    }
    
    // 检查是否有紧急停止状态
    const emergencyState = await window.electronAPI.getEmergencyStopState?.();
    if (emergencyState?.stopped) {
      console.log('[StopManager] 发现紧急停止状态', emergencyState);
      stopState.emergencyStopped = true;
      stopState.backupId = emergencyState.backupId;
      updateStopButtonsVisibility();
      setGlobalStatus(`🛑 OpenClaw 已被紧急停止，点击一键恢复可还原`, 'warning');
    }
    
    // 如果没有停止状态，也要调用更新按钮显示（显示停止按钮）
    if (!stopState.normalStopped && !stopState.emergencyStopped) {
      console.log('[StopManager] 未检测到停止状态，显示停止按钮');
      updateStopButtonsVisibility();
    }
  } catch (error) {
    console.error('[StopManager] 初始化失败:', error);
  }
}

/**
 * 更新停止按钮的显示/隐藏
 * 同时控制应用配置按钮的可用状态
 */
function updateStopButtonsVisibility() {
  console.log('[StopManager] ========== 更新按钮显示状态 ==========');
  console.log('[StopManager] 当前状态:', JSON.stringify(stopState));
  
  const btnNormalStop = document.getElementById('btn-normal-stop');
  const btnEmergencyStop = document.getElementById('btn-emergency-stop');
  const btnNormalRestore = document.getElementById('btn-normal-restore');
  const btnEmergencyRestore = document.getElementById('btn-emergency-restore');
  const btnApplyConfig = document.getElementById('btn-apply-config');
  
  console.log('[StopManager] 按钮元素存在:', {
    btnNormalStop: !!btnNormalStop,
    btnEmergencyStop: !!btnEmergencyStop,
    btnNormalRestore: !!btnNormalRestore,
    btnEmergencyRestore: !!btnEmergencyRestore,
    btnApplyConfig: !!btnApplyConfig
  });
  
  if (stopState.emergencyStopped) {
    console.log('[StopManager] 进入紧急停止状态分支');
    // 紧急停止状态：只显示紧急恢复，禁用应用配置
    btnNormalStop?.style.setProperty('display', 'none');
    btnEmergencyStop?.style.setProperty('display', 'none');
    btnNormalRestore?.style.setProperty('display', 'none');
    btnEmergencyRestore?.style.setProperty('display', 'inline-block');
    
    console.log('[StopManager] 紧急恢复按钮显示:', btnEmergencyRestore?.style.display);
    
    // 禁用应用配置按钮（紧急停止后必须先恢复才能应用配置）
    if (btnApplyConfig) {
      btnApplyConfig.style.setProperty('display', 'none');
      btnApplyConfig.disabled = true;
      console.log('[StopManager] 应用配置按钮已隐藏');
    }
  } else if (stopState.normalStopped) {
    console.log('[StopManager] 进入普通停止状态分支');
    // 普通停止状态：只显示普通恢复，禁用应用配置
    btnNormalStop?.style.setProperty('display', 'none');
    btnEmergencyStop?.style.setProperty('display', 'none');
    btnNormalRestore?.style.setProperty('display', 'inline-block');
    btnEmergencyRestore?.style.setProperty('display', 'none');
    
    console.log('[StopManager] 普通恢复按钮显示:', btnNormalRestore?.style.display);
    
    // 禁用应用配置按钮（停止后必须先恢复才能应用配置）
    if (btnApplyConfig) {
      btnApplyConfig.style.setProperty('display', 'none');
      btnApplyConfig.disabled = true;
      console.log('[StopManager] 应用配置按钮已隐藏');
    }
  } else {
    // 正常状态：显示停止按钮，恢复应用配置按钮
    console.log('[StopManager] 进入正常状态分支');
    btnNormalStop?.style.setProperty('display', 'inline-block');
    btnEmergencyStop?.style.setProperty('display', 'inline-block');
    btnNormalRestore?.style.setProperty('display', 'none');
    btnEmergencyRestore?.style.setProperty('display', 'none');
    
    console.log('[StopManager] 停止按钮显示:', {
      normalStop: btnNormalStop?.style.display,
      emergencyStop: btnEmergencyStop?.style.display
    });
    
    // 恢复应用配置按钮（但保持原来的显示逻辑，由StateManager控制）
    if (btnApplyConfig) {
      btnApplyConfig.disabled = false;
      // 显示逻辑由 StateManager 控制，这里不强制显示
    }
  }
  
  console.log('[StopManager] ========== 按钮更新完成 ==========');
}

/**
 * 显示普通停止确认对话框
 */
function showNormalStopModal() {
  console.log('[StopManager] 显示普通停止确认对话框');
  
  const modal = document.getElementById('normal-stop-modal');
  const overlay = document.getElementById('normal-stop-overlay');
  
  console.log('[StopManager] 对话框元素:', { modal: !!modal, overlay: !!overlay });
  
  if (!modal || !overlay) {
    console.error('[StopManager] 找不到普通停止对话框元素');
    return;
  }
  
  modal.style.display = 'block';
  overlay.style.display = 'block';
  
  console.log('[StopManager] 对话框已显示');
  
  // 点击遮罩层关闭
  overlay.onclick = closeNormalStopModal;
  
  // ESC键关闭
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeNormalStopModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * 关闭普通停止确认对话框
 */
function closeNormalStopModal() {
  const modal = document.getElementById('normal-stop-modal');
  const overlay = document.getElementById('normal-stop-overlay');
  
  if (modal) modal.style.display = 'none';
  if (overlay) overlay.style.display = 'none';
}

/**
 * 显示紧急停止确认对话框
 */
function showEmergencyStopModal() {
  console.log('[StopManager] 显示紧急停止确认对话框');
  
  const modal = document.getElementById('emergency-stop-modal');
  const overlay = document.getElementById('emergency-stop-overlay');
  
  if (!modal || !overlay) {
    console.error('[StopManager] 找不到紧急停止对话框元素');
    return;
  }
  
  modal.style.display = 'block';
  overlay.style.display = 'block';
  
  // 点击遮罩层关闭
  overlay.onclick = closeEmergencyStopModal;
  
  // ESC键关闭
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeEmergencyStopModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * 关闭紧急停止确认对话框
 */
function closeEmergencyStopModal() {
  const modal = document.getElementById('emergency-stop-modal');
  const overlay = document.getElementById('emergency-stop-overlay');
  
  if (modal) modal.style.display = 'none';
  if (overlay) overlay.style.display = 'none';
}

/**
 * 确认普通停止
 */
async function confirmNormalStop() {
  console.log('[StopManager] 执行普通停止');
  closeNormalStopModal();

  // 【v2.7 新增】显示执行进度弹窗
  showNormalStopProgressModal();

  setGlobalStatus('⏹ 正在执行普通停止...', 'info');
  addLog('info', '[普通停止] 开始执行停止操作', '', 'system');

  try {
    // 更新进度
    updateNormalStopProgress(10, '开始停止流程...');
    addNormalStopLog('info', '开始停止流程...');

    await new Promise(resolve => setTimeout(resolve, 300));

    updateNormalStopProgress(30, '正在创建配置备份...');
    addNormalStopLog('info', '创建配置备份...');

    await new Promise(resolve => setTimeout(resolve, 300));

    updateNormalStopProgress(50, '正在停止 Gateway 服务...');
    addNormalStopLog('info', '停止 Gateway 服务...');

    const result = await window.electronAPI.normalStop?.();

    if (result?.success) {
      updateNormalStopProgress(80, '正在保存停止状态...');
      addNormalStopLog('success', `配置已备份: ${result.backupFileName}`);

      await new Promise(resolve => setTimeout(resolve, 200));

      updateNormalStopProgress(100, '普通停止完成');
      addNormalStopLog('success', '普通停止执行成功');

      // 【v2.7.5 新增】启用关闭按钮
      enableNormalStopCloseButton();

      // 【v2.7 修改】延迟关闭弹窗，让用户有足够时间看到完成状态
      await new Promise(resolve => setTimeout(resolve, 2000));

      stopState.normalStopped = true;
      stopState.backupFileName = result.backupFileName;
      updateStopButtonsVisibility();

      // 更新UI状态
      updateCurrentUsePanel('stopped');

      setGlobalStatus(`⏹ OpenClaw 已停止，上次使用：${result.previousProvider || '未设置'}，点击恢复可继续`, 'info');
      addLog('info', `[普通停止] OpenClaw 已停止，备份文件：${result.backupFileName}`, {
        backupFileName: result.backupFileName,
        previousProvider: result.previousProvider
      }, 'system');

      showNotification('普通停止成功', `OpenClaw 已停止，点击"恢复"可继续使用`, 'info');

      // 【v2.6 新增】停止后检测 API 状态，确认已不可用
      addLog('info', '[普通停止] 正在检测 API 状态...', '', 'system');
      await checkAPIStatusAfterStop();
    } else {
      throw new Error(result?.error || '停止失败');
    }
  } catch (error) {
    updateNormalStopProgress(0, '普通停止失败');
    addNormalStopLog('error', `错误: ${error.message}`);

    // 【v2.7.5 新增】启用关闭按钮（失败状态）
    enableNormalStopCloseButton();

    console.error('[StopManager] 普通停止失败:', error);
    setGlobalStatus(`⏹ 普通停止失败：${error.message}`, 'error');
    addLog('error', `[普通停止] 停止失败：${error.message}`, '', 'system');
    showNotification('普通停止失败', error.message, 'error');
  }
}

/**
 * 确认紧急停止
 */
async function confirmEmergencyStop() {
  console.log('[StopManager] 执行紧急停止');
  closeEmergencyStopModal();

  // 【v2.6 新增】显示执行进度弹窗
  showEmergencyStopProgressModal();

  setGlobalStatus('🛑 正在执行紧急停止...', 'warning');
  addLog('warning', '[紧急停止] 开始执行紧急停止操作', '', 'system');

  try {
    // 更新进度
    updateEmergencyStopProgress(10, '正在创建紧急备份...');
    addEmergencyStopLog('info', '创建紧急备份...');

    await new Promise(resolve => setTimeout(resolve, 300));

    updateEmergencyStopProgress(30, '正在清空配置...');
    addEmergencyStopLog('info', '清空供应商配置...');

    const result = await window.electronAPI.emergencyStop?.();

    if (result?.success) {
      updateEmergencyStopProgress(60, '正在破坏 Gateway Token...');
      addEmergencyStopLog('info', 'Gateway Token 已破坏');

      await new Promise(resolve => setTimeout(resolve, 200));

      updateEmergencyStopProgress(80, '正在保存停止状态...');
      addEmergencyStopLog('success', `配置已备份: ${result.backupFileName}`);

      await new Promise(resolve => setTimeout(resolve, 200));

      updateEmergencyStopProgress(100, '紧急停止完成');
      addEmergencyStopLog('success', '紧急停止执行成功');

      // 【v2.7.5 新增】启用关闭按钮
      enableEmergencyStopCloseButton();

      // 【v2.7 修改】延迟关闭弹窗，让用户有足够时间看到完成状态
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('[StopManager] 紧急停止成功', result);
      stopState.emergencyStopped = true;
      stopState.backupId = result.backupId;
      stopState.backupFileName = result.backupFileName;
      updateStopButtonsVisibility();

      // 更新UI状态
      updateCurrentUsePanel('emergencyStopped');

      setGlobalStatus(`🛑 OpenClaw 已被紧急停止，配置已备份至 ${result.backupFileName}，点击"一键恢复"可还原`, 'warning');
      addLog('warning', `[紧急停止] OpenClaw 已被紧急停止，备份文件：${result.backupFileName}`, {
        backupId: result.backupId,
        backupFileName: result.backupFileName,
        clearedProviders: result.clearedProviders,
        filesCleared: result.filesCleared
      }, 'system');

      showNotification('紧急停止成功', `配置已备份，点击"一键恢复"可还原`, 'warning');

      // 【v2.6 新增】停止后检测 API 状态，确认已不可用
      addEmergencyStopLog('info', '正在检测 API 状态...');
      await checkAPIStatusAfterStop();
    } else {
      throw new Error(result?.error || '紧急停止失败');
    }
  } catch (error) {
    updateEmergencyStopProgress(0, '紧急停止失败');
    addEmergencyStopLog('error', `错误: ${error.message}`);

    // 【v2.7.5 新增】启用关闭按钮（失败状态）
    enableEmergencyStopCloseButton();

    console.error('[StopManager] 紧急停止失败:', error);
    setGlobalStatus(`🛑 紧急停止失败：${error.message}`, 'error');
    addLog('error', `[紧急停止] 停止失败：${error.message}`, '', 'system');
    showNotification('紧急停止失败', error.message, 'error');
  }
}

/**
 * 显示普通停止进度弹窗
 */
function showNormalStopProgressModal() {
  const modal = document.getElementById('normal-stop-progress-modal');
  const overlay = document.getElementById('normal-stop-progress-overlay');
  const closeBtn = document.getElementById('btn-normal-stop-close-x');
  const progressBtn = document.getElementById('btn-normal-stop-progress');
  const logsStatus = document.getElementById('normal-stop-logs-status');

  if (modal) modal.classList.add('show');
  if (overlay) overlay.classList.add('show');

  // 禁用关闭按钮
  if (closeBtn) {
    closeBtn.disabled = true;
    closeBtn.setAttribute('data-status-hint', '停止进行中，无法关闭');
  }
  if (progressBtn) {
    progressBtn.disabled = true;
    progressBtn.textContent = '停止中...';
  }
  if (logsStatus) {
    logsStatus.textContent = '进行中';
    logsStatus.className = 'restore-logs-status';
  }

  // 重置进度
  updateNormalStopProgress(0, '准备停止...');
  clearNormalStopLogs();
}

/**
 * 隐藏普通停止进度弹窗
 */
function hideNormalStopProgressModal() {
  const modal = document.getElementById('normal-stop-progress-modal');
  const overlay = document.getElementById('normal-stop-progress-overlay');

  if (modal) modal.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
}

/**
 * 更新普通停止进度
 */
function updateNormalStopProgress(percent, status) {
  const progressBar = document.getElementById('normal-stop-progress-bar');
  const progressText = document.getElementById('normal-stop-progress-text');
  const currentStep = document.getElementById('normal-stop-current-step');

  if (progressBar) progressBar.style.width = percent + '%';
  if (progressText) progressText.textContent = percent + '%';
  if (currentStep) currentStep.textContent = status;
}

/**
 * 添加普通停止日志
 * @param {string} type - 日志类型: info, success, warning, error
 * @param {string} message - 日志内容
 */
function addNormalStopLog(type, message) {
  const logsContainer = document.getElementById('normal-stop-logs-content');
  if (!logsContainer) return;

  const logItem = document.createElement('div');
  logItem.className = 'restore-log-entry';

  // 根据类型设置图标
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  else if (type === 'warning') icon = '⚠️';
  else if (type === 'error') icon = '❌';

  logItem.innerHTML = `<span class="restore-log-icon">${icon}</span><span class="restore-log-text">${message}</span>`;

  logsContainer.appendChild(logItem);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

/**
 * 清空普通停止日志
 */
function clearNormalStopLogs() {
  const logsContainer = document.getElementById('normal-stop-logs-content');
  if (logsContainer) logsContainer.innerHTML = '';
}

/**
 * 启用普通停止关闭按钮
 */
function enableNormalStopCloseButton() {
  const closeBtn = document.getElementById('btn-normal-stop-close-x');
  const progressBtn = document.getElementById('btn-normal-stop-progress');
  const logsStatus = document.getElementById('normal-stop-logs-status');

  if (closeBtn) {
    closeBtn.disabled = false;
    closeBtn.setAttribute('data-status-hint', '点击关闭');
    closeBtn.onclick = () => hideNormalStopProgressModal();
  }
  if (progressBtn) {
    progressBtn.disabled = false;
    progressBtn.textContent = '关闭';
    progressBtn.onclick = () => hideNormalStopProgressModal();
  }
  if (logsStatus) {
    logsStatus.textContent = '已完成';
    logsStatus.className = 'restore-logs-status status-success';
  }
}

/**
 * 显示紧急停止进度弹窗
 */
function showEmergencyStopProgressModal() {
  const modal = document.getElementById('emergency-stop-progress-modal');
  const overlay = document.getElementById('emergency-stop-progress-overlay');
  const closeBtn = document.getElementById('btn-emergency-stop-close-x');
  const progressBtn = document.getElementById('btn-emergency-stop-progress');
  const logsStatus = document.getElementById('emergency-stop-logs-status');

  if (modal) modal.classList.add('show');
  if (overlay) overlay.classList.add('show');

  // 禁用关闭按钮
  if (closeBtn) {
    closeBtn.disabled = true;
    closeBtn.setAttribute('data-status-hint', '停止进行中，无法关闭');
  }
  if (progressBtn) {
    progressBtn.disabled = true;
    progressBtn.textContent = '停止中...';
  }
  if (logsStatus) {
    logsStatus.textContent = '进行中';
    logsStatus.className = 'restore-logs-status';
  }

  // 重置进度
  updateEmergencyStopProgress(0, '准备紧急停止...');
  clearEmergencyStopLogs();
}

/**
 * 隐藏紧急停止进度弹窗
 */
function hideEmergencyStopProgressModal() {
  const modal = document.getElementById('emergency-stop-progress-modal');
  const overlay = document.getElementById('emergency-stop-progress-overlay');

  if (modal) modal.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
}

/**
 * 更新紧急停止进度
 */
function updateEmergencyStopProgress(percent, status) {
  const progressBar = document.getElementById('emergency-stop-progress-bar');
  const progressText = document.getElementById('emergency-stop-progress-text');
  const currentStep = document.getElementById('emergency-stop-current-step');

  if (progressBar) progressBar.style.width = percent + '%';
  if (progressText) progressText.textContent = percent + '%';
  if (currentStep) currentStep.textContent = status;
}

/**
 * 添加紧急停止日志
 * @param {string} type - 日志类型: info, success, warning, error
 * @param {string} message - 日志内容
 */
function addEmergencyStopLog(type, message) {
  const logsContainer = document.getElementById('emergency-stop-logs-content');
  if (!logsContainer) return;

  const logItem = document.createElement('div');
  logItem.className = 'restore-log-entry';

  // 根据类型设置图标
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  else if (type === 'warning') icon = '⚠️';
  else if (type === 'error') icon = '❌';

  logItem.innerHTML = `<span class="restore-log-icon">${icon}</span><span class="restore-log-text">${message}</span>`;

  logsContainer.appendChild(logItem);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

/**
 * 清空紧急停止日志
 */
function clearEmergencyStopLogs() {
  const logsContainer = document.getElementById('emergency-stop-logs-content');
  if (logsContainer) logsContainer.innerHTML = '';
}

/**
 * 启用紧急停止关闭按钮
 */
function enableEmergencyStopCloseButton() {
  const closeBtn = document.getElementById('btn-emergency-stop-close-x');
  const progressBtn = document.getElementById('btn-emergency-stop-progress');
  const logsStatus = document.getElementById('emergency-stop-logs-status');

  if (closeBtn) {
    closeBtn.disabled = false;
    closeBtn.setAttribute('data-status-hint', '点击关闭');
    closeBtn.onclick = () => hideEmergencyStopProgressModal();
  }
  if (progressBtn) {
    progressBtn.disabled = false;
    progressBtn.textContent = '关闭';
    progressBtn.onclick = () => hideEmergencyStopProgressModal();
  }
  if (logsStatus) {
    logsStatus.textContent = '已完成';
    logsStatus.className = 'restore-logs-status status-success';
  }
}

/**
 * 【v2.6 新增】停止后检测 API 状态
 * 检测 API 是否已变为不可用状态
 */
async function checkAPIStatusAfterStop() {
  try {
    // 最多检测 3 次，每次间隔 1 秒
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 检测 Gateway 状态
      const gatewayStatus = await window.electronAPI.verifyGatewayProcess?.();

      if (!gatewayStatus?.running) {
        addLog('info', `[停止检测] API 已不可用（Gateway 未运行）`, {}, 'system');
        return { success: true, available: false };
      }

      // 检测 AI 连接
      const aiStatus = await window.electronAPI.verifyAIConnection?.();

      if (!aiStatus?.success) {
        addLog('info', `[停止检测] API 已不可用（AI 连接失败）`, {}, 'system');
        return { success: true, available: false };
      }
    }

    // 如果 3 次检测后 API 仍然可用，记录警告
    addLog('warning', `[停止检测] API 仍然可用，可能需要手动检查`, {}, 'system');
    return { success: true, available: true };
  } catch (error) {
    addLog('error', `[停止检测] 检测失败: ${error.message}`, {}, 'system');
    return { success: false, error: error.message };
  }
}

/**
 * 【v2.6 新增】恢复后检测 API 状态
 * 检测 API 是否已恢复可用状态
 * 进行多次检测，确保服务真正可用
 */
async function checkAPIStatusAfterRestore() {
  try {
    // 最多检测 5 次，每次间隔 2 秒
    for (let i = 0; i < 5; i++) {
      addLog('info', `[恢复检测] 第 ${i + 1}/5 次检测 API 状态...`, {}, 'system');

      // 检测 Gateway 状态
      const gatewayStatus = await window.electronAPI.verifyGatewayProcess?.();

      if (!gatewayStatus?.running) {
        addLog('info', `[恢复检测] Gateway 未运行，等待...`, {}, 'system');
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      // 检测 AI 连接
      const aiStatus = await window.electronAPI.verifyAIConnection?.();

      if (aiStatus?.success) {
        addLog('success', `[恢复检测] API 已恢复可用`, {}, 'system');
        return { success: true, available: true };
      }

      addLog('info', `[恢复检测] AI 连接未就绪，等待...`, {}, 'system');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 5 次检测后 API 仍然不可用
    addLog('warning', `[恢复检测] API 仍未恢复可用`, {}, 'system');
    return { success: true, available: false };
  } catch (error) {
    addLog('error', `[恢复检测] 检测失败: ${error.message}`, {}, 'system');
    return { success: false, error: error.message };
  }
}

// ==================== 恢复流程管理器 ====================



/**
 * 关闭所有恢复相关弹窗
 */
function closeAllRestoreModals() {
  console.log('[StopManager] 关闭所有恢复弹窗');
  
  const modalIds = [
    'normal-restore-confirm-modal',
    'emergency-restore-confirm-modal',
    'restore-progress-modal',
    'restore-verify-modal',
    'restore-success-modal',
    'restore-failure-modal'
  ];
  
  const overlayIds = [
    'normal-restore-confirm-overlay',
    'emergency-restore-confirm-overlay',
    'restore-progress-overlay',
    'restore-verify-overlay',
    'restore-success-overlay',
    'restore-failure-overlay'
  ];
  
  modalIds.forEach(id => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show');
  });
  
  overlayIds.forEach(id => {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.remove('show');
  });
}

/**
 * 显示普通恢复确认弹窗
 */
function showNormalRestoreConfirm() {
  console.log('[StopManager] 显示普通恢复确认弹窗');
  
  // 先关闭所有其他弹窗
  closeAllRestoreModals();
  
  const modal = document.getElementById('normal-restore-confirm-modal');
  const overlay = document.getElementById('normal-restore-confirm-overlay');
  
  if (!modal || !overlay) {
    console.error('[StopManager] 找不到普通恢复确认弹窗元素');
    // 降级到直接恢复
    startNormalRestoreFlow();
    return;
  }
  
  modal.classList.add('show');
  overlay.classList.add('show');
  
  // 绑定按钮事件
  const btnConfirm = document.getElementById('btn-normal-restore-confirm');
  const btnCancel = document.getElementById('btn-normal-restore-cancel');
  const btnClose = modal.querySelector('.btn-close-restore');
  
  const confirmHandler = () => {
    hideNormalRestoreConfirm();
    startNormalRestoreFlow();
  };
  
  const cancelHandler = () => {
    hideNormalRestoreConfirm();
  };
  
  btnConfirm?.addEventListener('click', confirmHandler, { once: true });
  btnCancel?.addEventListener('click', cancelHandler, { once: true });
  btnClose?.addEventListener('click', cancelHandler, { once: true });
  
  // 点击遮罩层关闭
  overlay.onclick = cancelHandler;
  
  // ESC键关闭
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      hideNormalRestoreConfirm();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * 隐藏普通恢复确认弹窗
 */
function hideNormalRestoreConfirm() {
  const modal = document.getElementById('normal-restore-confirm-modal');
  const overlay = document.getElementById('normal-restore-confirm-overlay');
  
  if (modal) modal.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
}

/**
 * 显示紧急恢复确认弹窗
 */
function showEmergencyRestoreConfirm() {
  console.log('[StopManager] 显示紧急恢复确认弹窗');
  
  // 先关闭所有其他弹窗
  closeAllRestoreModals();
  
  const modal = document.getElementById('emergency-restore-confirm-modal');
  const overlay = document.getElementById('emergency-restore-confirm-overlay');
  
  if (!modal || !overlay) {
    console.error('[StopManager] 找不到紧急恢复确认弹窗元素');
    // 降级到直接恢复
    startEmergencyRestoreFlow();
    return;
  }
  
  modal.classList.add('show');
  overlay.classList.add('show');
  
  // 绑定按钮事件
  const btnConfirm = document.getElementById('btn-emergency-restore-confirm');
  const btnCancel = document.getElementById('btn-emergency-restore-cancel');
  const btnClose = modal.querySelector('.btn-close-restore');
  
  const confirmHandler = () => {
    hideEmergencyRestoreConfirm();
    startEmergencyRestoreFlow();
  };
  
  const cancelHandler = () => {
    hideEmergencyRestoreConfirm();
  };
  
  btnConfirm?.addEventListener('click', confirmHandler, { once: true });
  btnCancel?.addEventListener('click', cancelHandler, { once: true });
  btnClose?.addEventListener('click', cancelHandler, { once: true });
  
  // 点击遮罩层关闭
  overlay.onclick = cancelHandler;
  
  // ESC键关闭
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      hideEmergencyRestoreConfirm();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * 隐藏紧急恢复确认弹窗
 */
function hideEmergencyRestoreConfirm() {
  const modal = document.getElementById('emergency-restore-confirm-modal');
  const overlay = document.getElementById('emergency-restore-confirm-overlay');
  
  if (modal) modal.classList.remove('show');
  if (overlay) overlay.classList.remove('show');
}

/**
 * 开始普通恢复流程
 */
async function startNormalRestoreFlow() {
  console.log('[StopManager] 开始普通恢复流程');
  restoreFlowState.currentType = 'normal';
  await executeRestoreFlow('normal');
}

/**
 * 开始紧急恢复流程
 */
async function startEmergencyRestoreFlow() {
  console.log('[StopManager] 开始紧急恢复流程');
  restoreFlowState.currentType = 'emergency';
  await executeRestoreFlow('emergency');
}

/**
 * 执行恢复流程
 * @param {string} type - 'normal' 或 'emergency'
 */
async function executeRestoreFlow(type) {
  restoreFlowState.isRestoring = true;
  restoreFlowState.startTime = Date.now();
  restoreFlowState.verificationResults = [];
  
  // 显示进度弹窗
  showRestoreProgressModal(type);
  
  // 开始计时器
  startRestoreTimer();
  
  try {
    // 执行恢复步骤
    const restoreResult = await executeRestoreSteps(type);
    
    if (!restoreResult.success) {
      throw new Error(restoreResult.error || '恢复失败');
    }
    
    // 更新进度到检测阶段
    updateRestoreProgress(70, '正在执行恢复后验证...');
    addRestoreLog('info', '恢复步骤完成，开始验证...');
    
    // 执行 Gateway 检测
    hideRestoreProgressModal();
    const verificationResult = await executeVerificationFlow(type);
    
    if (verificationResult.success) {
      // 【v2.6 新增】恢复成功后进行多次 API 可用性检测
      addLog('info', '[恢复流程] 正在进行 API 可用性检测...', {}, 'system');
      const apiCheckResult = await checkAPIStatusAfterRestore();

      if (apiCheckResult.success && apiCheckResult.available) {
        // 检测通过，更新状态并启用功能
        console.log('[StopManager] 恢复成功，重置停止状态');
        if (type === 'normal') {
          stopState.normalStopped = false;
          stopState.backupFileName = null;
        } else {
          stopState.emergencyStopped = false;
          stopState.backupId = null;
          stopState.backupFileName = null;
        }
        console.log('[StopManager] 状态已重置:', JSON.stringify(stopState));

        // 【关键修复】清除停止状态文件，避免重启后仍显示恢复按钮
        try {
          if (type === 'normal' && window.electronAPI?.clearTempBackup) {
            await window.electronAPI.clearTempBackup();
            console.log('[StopManager] 已清理临时备份文件');
          }
          if (type === 'emergency' && window.electronAPI?.clearEmergencyStopState) {
            await window.electronAPI.clearEmergencyStopState();
            console.log('[StopManager] 已清理紧急停止状态文件');
          }
        } catch (e) {
          console.warn('[StopManager] 清理状态文件失败:', e);
        }

        // 启用所有功能
        await enableAllFeaturesAfterRestore();

        // 显示成功弹窗
        showRestoreSuccessModal(verificationResult);
      } else {
        // API 仍然不可用，显示失败
        showRestoreFailureModal({
          ...verificationResult,
          success: false,
          error: 'API 检测未通过，服务尚未完全恢复',
          reasons: ['配置文件已恢复，但 API 仍不可用', 'Gateway 可能需要更多时间启动', '请稍后重试或手动检查'],
          suggestions: ['点击"重新检测"再次检查', '等待 1-2 分钟后重试', '如多次失败可点击"重装 Gateway"']
        });
      }
    } else {
      // 检测未通过，Gateway 还没准备好，不能继续使用
      // 保持停止状态，不启用功能
      showRestoreFailureModal({
        ...verificationResult,
        error: 'Gateway 检测未通过，服务尚未就绪',
        reasons: ['Gateway 启动需要 1-2 分钟时间', '配置文件已恢复，但 Gateway 还在启动中', '必须等待 Gateway 就绪才能使用'],
        suggestions: ['点击"重新检测"再次检查 Gateway 状态', '等待 1-2 分钟后重试', '如多次失败可点击"重装 Gateway"']
      });
    }
    
  } catch (error) {
    console.error('[StopManager] 恢复流程失败:', error);
    hideRestoreProgressModal();
    showRestoreFailureModal({
      success: false,
      error: error.message,
      failedStep: '恢复执行',
      reasons: ['恢复过程中发生错误'],
      suggestions: ['查看日志了解详细错误信息', '尝试重新恢复', '如多次失败请重装 Gateway']
    });
  } finally {
    restoreFlowState.isRestoring = false;
    stopRestoreTimer();
  }
}

/**
 * 显示恢复进度弹窗
 * 【v2.5 更新】执行过程中禁用所有关闭方式
 */
function showRestoreProgressModal(type) {
  // 先关闭所有其他弹窗
  closeAllRestoreModals();

  const modal = document.getElementById('restore-progress-modal');
  const overlay = document.getElementById('restore-progress-overlay');

  if (!modal || !overlay) {
    console.error('[StopManager] 找不到进度弹窗元素');
    return;
  }

  // 重置状态
  const timer = document.getElementById('restore-timer');
  const progressBar = document.getElementById('restore-progress-bar');
  const progressText = document.getElementById('restore-progress-text');
  const currentStep = document.getElementById('restore-current-step');
  const logsContent = document.getElementById('restore-logs-content');

  if (timer) timer.textContent = '0:00';
  if (progressBar) progressBar.style.width = '0%';
  if (progressText) progressText.textContent = '0%';
  if (currentStep) currentStep.textContent = '准备恢复...';
  if (logsContent) logsContent.innerHTML = '';

  // 设置标题
  const title = document.getElementById('restore-progress-title');
  if (title) {
    title.textContent = type === 'emergency' ? '🔄 正在恢复 OpenClaw 配置' : '▶ 正在恢复 OpenClaw 运行';
  }

  modal.classList.add('show');
  overlay.classList.add('show');

  // 【v2.5】禁用所有关闭方式
  // 1. 禁用 X 按钮
  const closeBtn = modal.querySelector('.btn-close-restore');
  if (closeBtn) {
    closeBtn.disabled = true;
    closeBtn.style.opacity = '0.3';
    closeBtn.style.cursor = 'not-allowed';
  }

  // 2. 禁用点击遮罩层关闭
  overlay.onclick = null;

  // 3. 禁用 ESC 键
  document.addEventListener('keydown', preventEscDuringRestore);

  // 4. 禁用 Alt+F4（通过阻止 beforeunload）
  window.addEventListener('beforeunload', preventUnloadDuringRestore);
}

/**
 * 隐藏恢复进度弹窗
 * 【v2.5 更新】恢复关闭功能
 */
function hideRestoreProgressModal() {
  const modal = document.getElementById('restore-progress-modal');
  const overlay = document.getElementById('restore-progress-overlay');

  if (modal) modal.classList.remove('show');
  if (overlay) overlay.classList.remove('show');

  // 【v2.5】恢复 X 按钮
  const closeBtn = modal?.querySelector('.btn-close-restore');
  if (closeBtn) {
    closeBtn.disabled = false;
    closeBtn.style.opacity = '1';
    closeBtn.style.cursor = 'pointer';
  }

  // 移除 ESC 阻止
  document.removeEventListener('keydown', preventEscDuringRestore);

  // 移除 beforeunload 阻止
  window.removeEventListener('beforeunload', preventUnloadDuringRestore);
}

/**
 * 阻止恢复过程中的 ESC 键
 */
function preventEscDuringRestore(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
  }
}

/**
 * 阻止恢复过程中的页面关闭
 */
function preventUnloadDuringRestore(e) {
  e.preventDefault();
  e.returnValue = '恢复正在进行中，确定要退出吗？';
  return e.returnValue;
}

/**
 * 开始恢复计时器
 */
function startRestoreTimer() {
  const timerEl = document.getElementById('restore-timer');
  if (!timerEl) return;
  
  restoreFlowState.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - restoreFlowState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

/**
 * 停止恢复计时器
 */
function stopRestoreTimer() {
  if (restoreFlowState.timerInterval) {
    clearInterval(restoreFlowState.timerInterval);
    restoreFlowState.timerInterval = null;
  }
}

/**
 * 更新恢复进度
 */
function updateRestoreProgress(percent, stepText) {
  const bar = document.getElementById('restore-progress-bar');
  const text = document.getElementById('restore-progress-text');
  const step = document.getElementById('restore-current-step');
  
  if (bar) bar.style.width = `${percent}%`;
  if (text) text.textContent = `${percent}%`;
  if (step) step.textContent = stepText;
}

/**
 * 添加恢复日志
 */
function addRestoreLog(type, message) {
  const logsContainer = document.getElementById('restore-logs-content');
  if (!logsContainer) return;
  
  const logItem = document.createElement('div');
  logItem.className = 'restore-log-item';
  
  let icon = '⏳';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'info') icon = 'ℹ️';
  
  logItem.innerHTML = `
    <span class="restore-log-icon ${type}">${icon}</span>
    <span class="restore-log-text">${message}</span>
  `;
  
  logsContainer.appendChild(logItem);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

/**
 * 执行恢复步骤
 * @param {string} type - 'normal' 或 'emergency'
 * 
 * 普通停止恢复：只恢复配置文件，不重启 Gateway（Gateway 本来就没停）
 * 紧急停止恢复：恢复配置文件 + 安装/启动 Gateway
 */
async function executeRestoreSteps(type) {
  addRestoreLog('info', '开始恢复流程...');
  updateRestoreProgress(5, '准备恢复配置...');
  
  try {
    // 延迟一下让用户看到初始进度
    await new Promise(resolve => setTimeout(resolve, 300));
    
    updateRestoreProgress(15, '正在恢复配置文件...');
    console.log(`[StopManager] 调用 ${type}Restore...`);
    addRestoreLog('info', `调用 ${type === 'normal' ? '普通' : '紧急'}恢复...`);
    
    // 检查 API 是否可用
    const api = type === 'normal' 
      ? window.electronAPI?.normalRestore
      : window.electronAPI?.emergencyRestore;
    
    if (!api) {
      const errorMsg = `${type === 'normal' ? '普通' : '紧急'}恢复 API 不可用`;
      console.error('[StopManager]', errorMsg);
      addRestoreLog('error', errorMsg);
      return { success: false, error: errorMsg };
    }
    
    updateRestoreProgress(25, '正在调用恢复接口...');
    
    // 调用主进程恢复（只恢复配置文件）
    const result = await api();
    
    console.log('[StopManager] 恢复结果:', result);
    
    if (result?.success) {
      updateRestoreProgress(40, '配置文件恢复成功');
      addRestoreLog('success', '配置文件恢复成功');
      
      // Gateway 会自动检测配置文件变化并启动/重新加载
      // 只需要等待一段时间让 Gateway 自动处理
      updateRestoreProgress(50, '等待 Gateway 自动启动...');
      addRestoreLog('info', '配置文件已恢复，Gateway 将自动检测并启动（预计需要 1-2 分钟）...');
      
      // 给 Gateway 时间来检测配置文件并自动启动（紧急停止需要更长时间）
      const waitTime = type === 'emergency' ? 10000 : 5000;
      const startWait = Date.now();
      
      // 分段更新进度条，让用户看到动态效果
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startWait;
        const progress = Math.min(68, 50 + Math.floor((elapsed / waitTime) * 18));
        updateRestoreProgress(progress, `等待 Gateway 自动启动... (${Math.floor(elapsed/1000)}s)`);
      }, 500);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      clearInterval(progressInterval);
      
      updateRestoreProgress(70, '准备检测...');
      
      return { success: true, data: result };
    } else {
      const errorMsg = result?.error || '恢复失败';
      console.error('[StopManager] 恢复失败:', errorMsg, '完整结果:', result);
      addRestoreLog('error', `恢复失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    console.error('[StopManager] 恢复异常:', error);
    addRestoreLog('error', `恢复异常: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 执行检测流程
 * @param {string} type - 'normal' 或 'emergency'
 * 
 * 简化逻辑：配置文件已在恢复步骤中恢复
 * 只需要检测 Gateway 是否正常运行（通过 status 命令或 WebSocket）
 * Gateway 正常 = 恢复成功
 */
async function executeVerificationFlow(type) {
  console.log('[StopManager] 开始执行检测流程，类型:', type);
  
  showVerifyModal();
  
  const verifyStartTime = Date.now();
  const verifyTimerEl = document.getElementById('restore-verify-timer');
  const verifyTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - verifyStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    if (verifyTimerEl) {
      verifyTimerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }, 1000);
  
  // 添加检测项目
  addVerifyItem('检测 Gateway 状态', 'pending');
  
  try {
    // 使用轮询检测 Gateway 状态（最多等待90秒）
    const result = await pollWithTimeout(
      verifyGatewayStatus, 
      90000, // 90秒
      3000,  // 每3秒检测一次
      (attempt, elapsed) => {
        updateVerifyItem('检测 Gateway 状态', 'waiting', `等待 Gateway 启动... (${Math.floor(elapsed/1000)}s)`);
        // 动态更新进度条：从0%到90%，根据时间进度
        const progress = Math.min(90, Math.floor((elapsed / 90000) * 100));
        updateVerifyProgress(progress);
      }
    );
    
    updateVerifyItem('检测 Gateway 状态', result.success ? 'success' : 'error', result.error);
    updateVerifyProgress(result.success ? 100 : 50);
    
    if (!result.success) {
      // 【v2.5 新增】自动修复 Gateway
      addLog('info', '[恢复流程] Gateway 检测失败，尝试自动修复...', {}, 'system');
      updateVerifyItem('检测 Gateway 状态', 'waiting', '正在自动修复...');
      
      try {
        const repairResult = await window.electronAPI.autoRepairGateway?.();
        addLog('info', '[恢复流程] 自动修复结果', { success: repairResult?.success }, 'system');
        
        if (repairResult?.success) {
          // 修复成功，再次检测
          updateVerifyItem('检测 Gateway 状态', 'waiting', '修复成功，重新检测...');
          await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 Gateway 启动
          
          const retryResult = await verifyGatewayStatus();
          if (retryResult.success) {
            updateVerifyItem('检测 Gateway 状态', 'success');
            updateVerifyProgress(100);
            clearInterval(verifyTimerInterval);
            hideVerifyModal();
            return {
              success: true,
              results: [{ name: 'Gateway 状态', success: true }],
              totalTime: Date.now() - restoreFlowState.startTime
            };
          }
        }
      } catch (repairError) {
        addLog('error', '[恢复流程] 自动修复失败', { error: repairError.message }, 'system');
      }
      
      // 自动修复失败或仍然检测失败
      clearInterval(verifyTimerInterval);
      hideVerifyModal();
      return {
        success: false,
        failedStep: 'Gateway 状态检测',
        error: result.error,
        reasons: ['Gateway 服务未能正常启动', '配置文件可能有问题', '系统资源不足'],
        suggestions: ['点击"重装 Gateway"按钮重新安装', '重启电脑后再次尝试', '检查 Gateway 日志'],
        results: [{ name: 'Gateway 状态', success: false }],
        totalTime: Date.now() - restoreFlowState.startTime
      };
    }
    
    clearInterval(verifyTimerInterval);
    hideVerifyModal();
    
    return {
      success: true,
      results: [{ name: 'Gateway 状态', success: true }],
      totalTime: Date.now() - restoreFlowState.startTime
    };
    
  } catch (error) {
    clearInterval(verifyTimerInterval);
    hideVerifyModal();
    return {
      success: false,
      failedStep: 'Gateway 状态检测',
      error: error.message,
      reasons: ['检测过程发生异常'],
      suggestions: ['查看日志了解详细错误', '尝试重新恢复'],
      results: [{ name: 'Gateway 状态', success: false }],
      totalTime: Date.now() - restoreFlowState.startTime
    };
  }
}

/**
 * 显示检测弹窗
 * 【v2.5 更新】执行过程中禁用所有关闭方式
 */
function showVerifyModal() {
  // 先关闭所有其他弹窗
  closeAllRestoreModals();

  const modal = document.getElementById('restore-verify-modal');
  const overlay = document.getElementById('restore-verify-overlay');

  if (!modal || !overlay) return;

  // 重置检测列表
  const list = document.getElementById('restore-verify-list');
  if (list) list.innerHTML = '';

  // 重置进度条
  const progressBar = document.getElementById('restore-verify-bar');
  const progressText = document.getElementById('restore-verify-text');
  if (progressBar) progressBar.style.width = '0%';
  if (progressText) progressText.textContent = '0%';

  modal.classList.add('show');
  overlay.classList.add('show');

  // 【v2.5】禁用所有关闭方式
  // 1. 禁用 X 按钮
  const closeBtn = modal.querySelector('.btn-close-restore');
  if (closeBtn) {
    closeBtn.disabled = true;
    closeBtn.style.opacity = '0.3';
    closeBtn.style.cursor = 'not-allowed';
  }

  // 2. 禁用点击遮罩层关闭
  overlay.onclick = null;

  // 3. 禁用 ESC 键
  document.addEventListener('keydown', preventEscDuringRestore);
}

/**
 * 隐藏检测弹窗
 * 【v2.5 更新】恢复关闭功能
 */
function hideVerifyModal() {
  const modal = document.getElementById('restore-verify-modal');
  const overlay = document.getElementById('restore-verify-overlay');

  if (modal) modal.classList.remove('show');
  if (overlay) overlay.classList.remove('show');

  // 【v2.5】恢复 X 按钮
  const closeBtn = modal?.querySelector('.btn-close-restore');
  if (closeBtn) {
    closeBtn.disabled = false;
    closeBtn.style.opacity = '1';
    closeBtn.style.cursor = 'pointer';
  }

  // 移除 ESC 阻止
  document.removeEventListener('keydown', preventEscDuringRestore);
}

/**
 * 添加检测项目
 */
function addVerifyItem(name, status) {
  const list = document.getElementById('restore-verify-list');
  if (!list) return;
  
  const item = document.createElement('div');
  item.className = 'restore-verify-item';
  item.id = `verify-item-${name.replace(/\s+/g, '-')}`;
  
  let icon = '⏳';
  let statusText = '检测中';
  let statusClass = 'pending';
  
  item.innerHTML = `
    <span class="restore-verify-icon ${statusClass}">${icon}</span>
    <span class="restore-verify-name">${name}</span>
    <span class="restore-verify-status ${statusClass}">${statusText}</span>
  `;
  
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

/**
 * 更新检测项目状态
 */
function updateVerifyItem(name, status, error) {
  const itemId = `verify-item-${name.replace(/\s+/g, '-')}`;
  const item = document.getElementById(itemId);
  if (!item) return;
  
  const iconEl = item.querySelector('.restore-verify-icon');
  const statusEl = item.querySelector('.restore-verify-status');
  
  if (status === 'success') {
    iconEl.textContent = '✅';
    iconEl.className = 'restore-verify-icon success';
    statusEl.textContent = '通过';
    statusEl.className = 'restore-verify-status success';
  } else if (status === 'error') {
    iconEl.textContent = '❌';
    iconEl.className = 'restore-verify-icon error';
    statusEl.textContent = error || '失败';
    statusEl.className = 'restore-verify-status error';
  }
}

/**
 * 更新检测进度
 */
function updateVerifyProgress(percent) {
  const bar = document.getElementById('restore-verify-bar');
  const text = document.getElementById('restore-verify-text');
  
  if (bar) bar.style.width = `${percent}%`;
  if (text) text.textContent = `${Math.round(percent)}%`;
}

// ==================== 检测函数 ====================

async function verifyOpenclawConfig() {
  try {
    const result = await window.electronAPI.verifyOpenclawConfig?.();
    return result || { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function verifyModelsConfig() {
  try {
    const result = await window.electronAPI.verifyModelsConfig?.();
    return result || { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function verifyAuthConfig() {
  try {
    const result = await window.electronAPI.verifyAuthConfig?.();
    return result || { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 验证 Gateway 状态
 * 使用 openclaw gateway status 命令或 WebSocket 检测
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function verifyGatewayStatus() {
  try {
    // 优先使用 verifyGatewayProcess 检测
    const result = await window.electronAPI.verifyGatewayProcess?.();
    
    // 【修复】检查 running 字段，而不仅仅是 success
    if (result?.success && result?.running) {
      return { success: true };
    }
    
    // 如果进程检测不可用，尝试 WebSocket 连接检测
    const wsResult = await window.electronAPI.verifyGatewayHealth?.();
    if (wsResult?.success) {
      return { success: true };
    }
    
    return { 
      success: false, 
      error: result?.error || wsResult?.error || 'Gateway 未运行' 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function verifyGatewayPort() {
  try {
    const result = await window.electronAPI.verifyGatewayPort?.();
    return result || { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function verifyGatewayToken() {
  try {
    const result = await window.electronAPI.verifyGatewayToken?.();
    return result || { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function verifyGatewayHealth() {
  try {
    const result = await window.electronAPI.verifyGatewayHealth?.();
    return result || { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function verifyAIConnection() {
  try {
    const result = await window.electronAPI.verifyAIConnection?.();
    return result || { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 成功/失败弹窗 ====================

/**
 * 显示恢复成功弹窗
 * @param {Object} verificationResult - 验证结果
 */
function showRestoreSuccessModal(verificationResult) {
  console.log('[StopManager] 显示恢复成功弹窗', verificationResult);
  
  // 先关闭所有其他弹窗
  closeAllRestoreModals();

  const modal = document.getElementById('restore-success-modal');
  const overlay = document.getElementById('restore-success-overlay');

  if (!modal || !overlay) {
    console.error('[StopManager] 找不到恢复成功弹窗元素');
    return;
  }

  // 计算总用时
  const totalTimeEl = document.getElementById('restore-success-time');
  let totalTimeStr = '0分0秒';
  if (totalTimeEl && restoreFlowState.startTime) {
    const elapsed = Math.floor((Date.now() - restoreFlowState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    totalTimeStr = `${minutes}分${seconds.toString().padStart(2, '0')}秒`;
    totalTimeEl.textContent = `总用时：${totalTimeStr}`;
  }

  // 更新检测结果列表
  const listEl = document.getElementById('restore-success-list');
  if (listEl && verificationResult?.details) {
    listEl.innerHTML = verificationResult.details.map(item => `
      <div class="restore-result-item">
        <span class="restore-result-icon">✅</span>
        <span class="restore-result-text">${item.name}</span>
        <span class="restore-result-status">${item.status || '正常'}</span>
      </div>
    `).join('');
  }

  // 显示弹窗
  modal.classList.add('show');
  overlay.classList.add('show');

  // 记录日志
  addLog('success', '[恢复流程] 恢复成功，所有检测通过', {
    totalTime: totalTimeStr,
    verificationDetails: verificationResult?.details,
    restoreType: restoreFlowState.currentType
  }, 'system');

  // 绑定确定按钮
  const btnOk = document.getElementById('btn-restore-success-ok');
  const btnClose = document.getElementById('btn-close-success');

  const closeHandler = () => {
    modal.classList.remove('show');
    overlay.classList.remove('show');
    console.log('[StopManager] 恢复成功弹窗已关闭');
  };

  btnOk?.addEventListener('click', closeHandler, { once: true });
  btnClose?.addEventListener('click', closeHandler, { once: true });

  // 点击遮罩层关闭
  overlay.onclick = closeHandler;

  // ESC键关闭
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeHandler();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * 显示恢复失败弹窗
 * @param {Object} failureInfo - 失败信息
 */
function showRestoreFailureModal(failureInfo) {
  console.log('[StopManager] 显示恢复失败弹窗', failureInfo);
  
  // 先关闭所有其他弹窗
  closeAllRestoreModals();

  const modal = document.getElementById('restore-failure-modal');
  const overlay = document.getElementById('restore-failure-overlay');

  if (!modal || !overlay) {
    console.error('[StopManager] 找不到恢复失败弹窗元素');
    // 降级到通知
    showNotification('恢复失败', failureInfo.error, 'error');
    return;
  }

  // 更新错误信息
  const errorEl = document.getElementById('restore-failure-error');
  if (errorEl) {
    errorEl.textContent = failureInfo.error || 'Gateway 状态检测';
    console.log('[StopManager] 更新错误信息:', errorEl.textContent);
  }

  // 更新原因列表
  const reasonsEl = document.getElementById('restore-failure-reasons');
  if (reasonsEl && failureInfo.reasons) {
    reasonsEl.innerHTML = failureInfo.reasons.map(r => `<li>${r}</li>`).join('');
  }

  // 更新建议列表
  const suggestionsEl = document.getElementById('restore-failure-suggestions');
  if (suggestionsEl && failureInfo.suggestions) {
    suggestionsEl.innerHTML = failureInfo.suggestions.map(s => `<li>${s}</li>`).join('');
  }

  // 显示弹窗
  modal.classList.add('show');
  overlay.classList.add('show');

  // 记录日志
  addLog('error', '[恢复流程] 恢复失败', {
    error: failureInfo.error,
    reasons: failureInfo.reasons,
    suggestions: failureInfo.suggestions,
    restoreType: restoreFlowState.currentType
  }, 'system');

  // 绑定关闭按钮
  const btnClose = document.getElementById('btn-close-failure');
  const btnRetry = document.getElementById('btn-restore-retry');
  const btnViewLogs = document.getElementById('btn-view-logs');
  const btnReinstall = document.getElementById('btn-reinstall-gateway');
  const btnRepair = document.getElementById('btn-repair-gateway');

  const closeHandler = () => {
    modal.classList.remove('show');
    overlay.classList.remove('show');
    console.log('[StopManager] 恢复失败弹窗已关闭');
  };

  const retryHandler = () => {
    console.log('[StopManager] 用户点击重新检测');
    modal.classList.remove('show');
    overlay.classList.remove('show');
    // 重新执行验证流程
    executeVerificationFlow(restoreFlowState.currentType).then(result => {
      if (result.success) {
        showRestoreSuccessModal(result);
      } else {
        showRestoreFailureModal({
          ...result,
          error: result.error || 'Gateway 检测未通过',
          reasons: result.reasons || ['Gateway 启动需要 1-2 分钟时间', '配置文件已恢复，但 Gateway 还在启动中'],
          suggestions: result.suggestions || ['点击"重新检测"再次检查 Gateway 状态', '等待 1-2 分钟后重试', '如多次失败可点击"重装 Gateway"']
        });
      }
    });
  };

  const viewLogsHandler = () => {
    console.log('[StopManager] 用户点击查看日志');
    // 切换到日志标签页
    const logsTab = document.querySelector('[data-tab="logs"]');
    if (logsTab) {
      logsTab.click();
      closeHandler();
    }
  };

  const reinstallHandler = () => {
    console.log('[StopManager] 用户点击重装 Gateway');
    // 显示确认对话框
    if (confirm('确定要重装 Gateway 吗？这将重新安装 Gateway 服务。')) {
      closeHandler();
      // 调用重装 Gateway 的 API
      window.electronAPI?.reinstallGateway?.().then(result => {
        if (result?.success) {
          showNotification('Gateway 重装成功', '请稍后重新尝试恢复', 'success');
        } else {
          showNotification('Gateway 重装失败', result?.error || '未知错误', 'error');
        }
      });
    }
  };

  // 【v2.7 新增】自动修复按钮处理
  const repairHandler = async () => {
    console.log('[StopManager] 用户点击自动修复 Gateway');

    if (!confirm('确定要自动修复 Gateway 吗？\n\n这将：\n1. 从备份中恢复有效的 Gateway 配置\n2. 自动启动 Gateway 服务\n\n请确保已备份重要数据。')) {
      return;
    }

    try {
      // 显示修复中状态
      if (btnRepair) {
        btnRepair.disabled = true;
        btnRepair.textContent = '🔧 修复中...';
        btnRepair.style.opacity = '0.7';
      }

      addLog('info', '[恢复失败修复] 开始从备份恢复 Gateway 配置', {}, 'system');

      // 调用修复接口
      if (window.electronAPI?.repairGatewayFromBackup) {
        const result = await window.electronAPI.repairGatewayFromBackup();

        if (result.success) {
          addLog('success', `[恢复失败修复] 配置已恢复: ${result.backup}`, {}, 'system');

          // 等待 Gateway 启动
          await new Promise(resolve => setTimeout(resolve, 3000));

          // 验证修复结果
          const tokenStatus = await window.electronAPI.checkGatewayTokenStatus?.();
          const healthStatus = await window.electronAPI.verifyGatewayHealth?.();

          if (tokenStatus?.valid && healthStatus?.running) {
            addLog('success', '[恢复失败修复] Gateway 已正常运行', {}, 'system');
            showNotification('Gateway 修复成功', 'Gateway 配置已恢复并正常运行', 'success');

            // 关闭失败弹窗，重新执行恢复流程验证
            closeHandler();

            // 重新执行验证流程
            const verificationResult = await executeVerificationFlow(restoreFlowState.currentType);
            if (verificationResult.success) {
              showRestoreSuccessModal(verificationResult);
            } else {
              showRestoreFailureModal({
                ...verificationResult,
                error: 'Gateway 修复后仍未能通过检测',
                reasons: ['配置已恢复，但 Gateway 可能需要更多时间启动'],
                suggestions: ['点击"重新检测"再次检查', '等待 1-2 分钟后重试']
              });
            }
          } else {
            addLog('warning', '[恢复失败修复] Gateway 可能未完全启动', {}, 'system');
            showNotification('Gateway 修复完成', '配置已恢复，请稍后重新检测', 'warning');

            // 恢复按钮状态
            if (btnRepair) {
              btnRepair.disabled = false;
              btnRepair.textContent = '🔧 自动修复';
              btnRepair.style.opacity = '1';
            }
          }
        } else {
          throw new Error(result.error || '修复失败');
        }
      } else {
        throw new Error('repairGatewayFromBackup 接口未实现');
      }
    } catch (error) {
      console.error('[StopManager] 自动修复 Gateway 失败:', error);
      addLog('error', `[恢复失败修复] 修复失败: ${error.message}`, {}, 'system');
      showNotification('Gateway 修复失败', error.message, 'error');

      // 恢复按钮状态
      if (btnRepair) {
        btnRepair.disabled = false;
        btnRepair.textContent = '🔧 自动修复';
        btnRepair.style.opacity = '1';
      }
    }
  };

  btnClose?.addEventListener('click', closeHandler, { once: true });
  btnRetry?.addEventListener('click', retryHandler, { once: true });
  btnViewLogs?.addEventListener('click', viewLogsHandler, { once: true });
  btnReinstall?.addEventListener('click', reinstallHandler, { once: true });
  btnRepair?.addEventListener('click', repairHandler, { once: true });

  // 点击遮罩层关闭
  overlay.onclick = closeHandler;

  // ESC键关闭
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeHandler();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * 恢复成功后启用所有功能
 */
async function enableAllFeaturesAfterRestore() {
  console.log('[StopManager] 恢复成功，启用所有功能');
  
  // 更新停止状态
  updateStopButtonsVisibility();
  
  // 更新UI状态
  updateCurrentUsePanel('active');
  
  // 刷新提供商列表
  if (typeof renderProviderList === 'function') {
    await renderProviderList();
  }
  
  // 触发配置重新加载
  if (typeof refreshConfiguration === 'function') {
    await refreshConfiguration();
  }
  
  // 重新检测配置状态
  if (typeof checkAndUpdateConfigStatus === 'function') {
    await checkAndUpdateConfigStatus();
  }
  
  // 触发 API 自动检测（恢复后需要重新检测 API 连接）
  setTimeout(async () => {
    console.log('[StopManager] 恢复完成，触发 API 自动检测');
    if (typeof autoTestApiConnection === 'function') {
      try {
        await autoTestApiConnection();
      } catch (error) {
        console.error('[StopManager] API 自动检测失败:', error);
      }
    }
  }, 2000); // 延迟2秒，让 Gateway 有时间启动
  
  // 更新全局状态
  setGlobalStatus('✅ OpenClaw 已恢复，所有功能已启用', 'success');
  addLog('success', '[恢复流程] OpenClaw 已完全恢复，所有功能已启用', '', 'system');
}

/**
 * 普通恢复（旧版，保留兼容）
 */
async function normalRestore() {
  console.log('[StopManager] 调用新的普通恢复流程');
  showNormalRestoreConfirm();
}

/**
 * 紧急恢复（旧版，保留兼容）
 */
async function emergencyRestore() {
  console.log('[StopManager] 调用新的紧急恢复流程');
  showEmergencyRestoreConfirm();
}

/**
 * 更新当前使用面板状态
 * @param {string} status - 状态：'active', 'stopped', 'emergencyStopped'
 */
function updateCurrentUsePanel(status) {
  const statusPill = document.getElementById('current-status');
  const connectionStatus = document.getElementById('connection-status');
  const connectionText = document.getElementById('connection-text');
  
  switch (status) {
    case 'stopped':
      if (statusPill) {
        statusPill.textContent = '已停止';
        statusPill.className = 'status-pill status-stopped';
      }
      if (connectionStatus) {
        connectionStatus.className = 'connection-status stopped';
      }
      if (connectionText) {
        connectionText.textContent = '已停止';
      }
      break;
      
    case 'emergencyStopped':
      if (statusPill) {
        statusPill.textContent = '紧急停止';
        statusPill.className = 'status-pill status-emergency';
      }
      if (connectionStatus) {
        connectionStatus.className = 'connection-status emergency';
      }
      if (connectionText) {
        connectionText.textContent = '紧急停止';
      }
      break;
      
    case 'active':
    default:
      if (statusPill) {
        statusPill.textContent = '就绪';
        statusPill.className = 'status-pill';
      }
      if (connectionStatus) {
        connectionStatus.className = 'connection-status untested';
      }
      if (connectionText) {
        connectionText.textContent = '未测试';
      }
      break;
  }
}

/**
 * 显示通知
 * @param {string|object} title - 标题，或包含 title/message/type 的对象
 * @param {string} message - 消息（当第一个参数为字符串时）
 * @param {string} type - 类型：'info', 'success', 'warning', 'error'
 */
function showNotification(title, message, type = 'info') {
  // 兼容对象参数格式：{ type, title, message, duration }
  if (typeof title === 'object' && title !== null) {
    type = title.type || 'info';
    message = title.message || '';
    title = title.title || '通知';
  }

  // 使用全局状态栏显示通知
  setGlobalStatus(`${title}：${message}`, type);

  // 如果系统支持，也显示系统通知
  if (window.electronAPI?.showNotification) {
    window.electronAPI.showNotification({ title, body: message });
  }
}

/**
 * 刷新配置
 * 重新加载程序配置并刷新UI
 */
async function refreshConfiguration() {
  console.log('[StopManager] 刷新配置...');
  try {
    // 重新加载配置
    if (typeof loadConfig === 'function') {
      await loadConfig();
      console.log('[StopManager] 配置已重新加载');
    }
    
    // 刷新提供商列表
    if (typeof renderProviderList === 'function') {
      await renderProviderList();
      console.log('[StopManager] 提供商列表已刷新');
    }
    
    console.log('[StopManager] 配置刷新完成');
  } catch (error) {
    console.error('[StopManager] 刷新配置失败:', error);
  }
}

/**
 * 检查并更新配置状态
 * 触发配置状态检测并更新UI显示
 */
async function checkAndUpdateConfigStatus() {
  console.log('[StopManager] 检查并更新配置状态...');
  try {
    // 检查配置文件状态
    if (typeof checkConfigFileStatus === 'function') {
      await checkConfigFileStatus();
      console.log('[StopManager] 配置文件状态已检查');
    }
    
    // 检查程序配置状态
    if (typeof checkProgramConfigStatus === 'function') {
      await checkProgramConfigStatus();
      console.log('[StopManager] 程序配置状态已检查');
    }
    
    // 更新配置状态总览（如果存在）
    if (typeof renderConfigStatusPanel === 'function') {
      await renderConfigStatusPanel();
      console.log('[StopManager] 配置状态面板已更新');
    }
    
    console.log('[StopManager] 配置状态检查完成');
  } catch (error) {
    console.error('[StopManager] 检查配置状态失败:', error);
  }
}

// 导出函数供其他模块使用
window.StopManager = {
  init: initStopManager,
  showNormalStopModal,
  closeNormalStopModal,
  showEmergencyStopModal,
  closeEmergencyStopModal,
  confirmNormalStop,
  confirmEmergencyStop,
  normalRestore,
  emergencyRestore,
  updateStopButtonsVisibility,
  getState: () => ({ ...stopState }),
  isStopped: () => stopState.normalStopped || stopState.emergencyStopped,
  // 恢复流程新函数
  showNormalRestoreConfirm,
  showEmergencyRestoreConfirm,
  startNormalRestoreFlow,
  startEmergencyRestoreFlow,
  isRestoring: () => restoreFlowState.isRestoring
};

/**
 * 关闭普通恢复弹窗（供 HTML onclick 使用）
 */
function closeNormalRestoreModal() {
  hideNormalRestoreConfirm();
}

/**
 * 关闭紧急恢复弹窗（供 HTML onclick 使用）
 */
function closeEmergencyRestoreModal() {
  hideEmergencyRestoreConfirm();
}

/**
 * 确认普通恢复（供 HTML onclick 使用）
 */
function confirmNormalRestore() {
  console.log('[StopManager] 确认普通恢复');
  hideNormalRestoreConfirm();
  startNormalRestoreFlow();
}

/**
 * 确认紧急恢复（供 HTML onclick 使用）
 */
function confirmEmergencyRestore() {
  console.log('[StopManager] 确认紧急恢复');
  hideEmergencyRestoreConfirm();
  startEmergencyRestoreFlow();
}

// 为了兼容性，也将函数挂载到 window
window.showNormalStopModal = showNormalStopModal;
window.closeNormalStopModal = closeNormalStopModal;
window.showEmergencyStopModal = showEmergencyStopModal;
window.closeEmergencyStopModal = closeEmergencyStopModal;
window.confirmNormalStop = confirmNormalStop;
window.confirmEmergencyStop = confirmEmergencyStop;
window.showNormalStopProgressModal = showNormalStopProgressModal;
window.hideNormalStopProgressModal = hideNormalStopProgressModal;
window.updateNormalStopProgress = updateNormalStopProgress;
window.addNormalStopLog = addNormalStopLog;
window.enableNormalStopCloseButton = enableNormalStopCloseButton;
window.showEmergencyStopProgressModal = showEmergencyStopProgressModal;
window.hideEmergencyStopProgressModal = hideEmergencyStopProgressModal;
window.updateEmergencyStopProgress = updateEmergencyStopProgress;
window.addEmergencyStopLog = addEmergencyStopLog;
window.enableEmergencyStopCloseButton = enableEmergencyStopCloseButton;
window.normalRestore = normalRestore;
window.emergencyRestore = emergencyRestore;
window.showNormalRestoreConfirm = showNormalRestoreConfirm;
window.showEmergencyRestoreConfirm = showEmergencyRestoreConfirm;
window.closeNormalRestoreModal = closeNormalRestoreModal;
window.closeEmergencyRestoreModal = closeEmergencyRestoreModal;
window.confirmNormalRestore = confirmNormalRestore;
window.confirmEmergencyRestore = confirmEmergencyRestore;

console.log('[StopManager] 停止管理模块已加载');
