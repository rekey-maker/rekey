// OpenClaw API Switcher - UI 组件模块
// 处理全局状态栏、模态框、通知等 UI 组件

// 状态栏显示时间（毫秒）
const GLOBAL_STATUS_DISPLAY_TIME = 5000;

// 全局状态栏定时器
let globalStatusBarTimer = null;

// 类型标签映射
const TYPE_LABELS = {
  info: 'INFO',
  success: 'SUCCESS',
  warning: 'WARN',
  error: 'ERROR'
};

// 类型图标映射
const TYPE_ICONS = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌'
};

/**
 * 设置全局状态栏消息
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型 (info | success | warning | error)
 */
function setGlobalStatus(message, type = 'info') {
  const statusBar = document.getElementById('global-status-bar');
  if (!statusBar) return;

  // 清除之前的定时器
  if (globalStatusBarTimer) {
    clearTimeout(globalStatusBarTimer);
  }

  // 移除所有状态类
  statusBar.classList.remove('status-info', 'status-success', 'status-warning', 'status-error', 'has-message');
  
  // 添加对应的状态类
  statusBar.classList.add('status-' + type, 'has-message');

  statusBar.innerHTML = 
    '<div class="status-content">' +
      '<span class="status-label">' + (TYPE_LABELS[type] || 'INFO') + '</span>' +
      '<span class="status-icon">' + (TYPE_ICONS[type] || 'ℹ️') + '</span>' +
      '<span class="status-message">' + escapeHtml(message) + '</span>' +
    '</div>';

  // 5秒后恢复默认状态
  globalStatusBarTimer = setTimeout(() => {
    resetGlobalStatusBar();
  }, GLOBAL_STATUS_DISPLAY_TIME);
}

/**
 * 重置全局状态栏
 */
function resetGlobalStatusBar() {
  const statusBar = document.getElementById('global-status-bar');
  if (!statusBar) return;

  // 清除之前的定时器
  if (globalStatusBarTimer) {
    clearTimeout(globalStatusBarTimer);
    globalStatusBarTimer = null;
  }

  // 移除所有状态类
  statusBar.classList.remove('status-info', 'status-success', 'status-warning', 'status-error', 'has-message');

  // 恢复默认状态
  statusBar.innerHTML = 
    '<div class="status-content">' +
      '<span class="status-idle">就绪</span>' +
    '</div>';
}

/**
 * 【v2.7.5 删除】showNotification 已移至 stopManager.js
 * 注意：此函数现在由 stopManager.js 提供，支持两种调用方式：
 * 1. showNotification(title, message, type) - 字符串参数
 * 2. showNotification({title, message, type}) - 对象参数
 */

/**
 * 打开添加模态框
 */
function openModal() {
  document.getElementById('add-modal').classList.add('show');
  document.getElementById('modal-overlay').classList.add('show');
}

/**
 * 关闭添加模态框
 */
function closeModal() {
  document.getElementById('add-modal')?.classList.remove('show');
  document.getElementById('modal-overlay')?.classList.remove('show');
  
  // 清空表单
  const customName = document.getElementById('custom-name');
  const customUrl = document.getElementById('custom-url');
  const customKey = document.getElementById('custom-key');
  if (customName) customName.value = '';
  if (customUrl) customUrl.value = '';
  if (customKey) customKey.value = '';
  
  // 重置状态
  selectedPresetKey = null;
  document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('selected'));
  
  const modelGrid = document.getElementById('add-model-grid');
  if (modelGrid) modelGrid.innerHTML = '<div class="model-select-hint">先输入 Provider 名称或选择预设</div>';
  
  // 重置为添加模式
  if (typeof resetToAddMode === 'function') resetToAddMode();
  
  // 重置状态栏
  if (typeof EditPageStatusBar !== 'undefined') EditPageStatusBar.reset('add-modal');
}

/**
 * 关闭编辑模态框
 */
function closeEditModal() {
  document.getElementById('edit-modal')?.classList.remove('show');
  document.getElementById('modal-overlay')?.classList.remove('show');
  StateManager.setEditingProvider(null);
  editModalModels = [];
  editModalSelectedModelId = null;
}

/**
 * 切换密码输入框显示
 * @param {string} inputId - 输入框ID
 * @param {HTMLElement} btn - 按钮元素
 */
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

/**
 * 设置标签页切换
 */
function setupTabSwitching() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      if (!tabId) return;

      // 切换标签页激活状态
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // 切换内容区域
      document.querySelectorAll('.tab-panel').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById('panel-' + tabId)?.classList.add('active');

      // 【v2.7.5 新增】切换到诊断页面时，执行 Token 状态检测
      if (tabId === 'diagnostics') {
        console.log('[TabSwitch] 切换到诊断页面，执行 Token 状态检测');
        // 延迟执行，确保页面已渲染
        setTimeout(() => {
          if (typeof checkGatewayServiceStatus === 'function') {
            checkGatewayServiceStatus();
          }
        }, 100);
      }
    });
  });
}

/**
 * 更新连接状态显示
 * @param {string} status - 状态 (connected | disconnected | testing)
 * @param {string} text - 显示文本
 */
function updateConnectionStatus(status, text) {
  // 只更新右侧 actions 区域的状态（自动检测）
  const statusDot = document.getElementById('connection-status-dot');
  const statusText = document.getElementById('connection-status-text');
  
  if (statusDot) {
    statusDot.className = 'status-dot ' + status;
  }
  if (statusText) {
    statusText.textContent = text;
  }
}

// 更新手动检测状态（API Key上方的指示器）
function updateManualConnectionStatus(status, text) {
  const el = document.getElementById('connection-status');
  const txt = document.getElementById('connection-text');
  
  if (el) {
    el.className = 'connection-status ' + status;
  }
  
  if (txt) {
    txt.textContent = text;
  }
}

// 编辑页面状态栏控制
const EditPageStatusBar = {
  /**
   * 设置状态栏内容和样式
   * @param {string} modalId - 模态框ID
   * @param {string} message - 消息内容
   * @param {string} type - 状态类型 (idle | info | success | warning | error)
   */
  setStatus(modalId, message, type = 'idle') {
    const statusBar = document.getElementById(modalId + '-status-bar');
    if (!statusBar) return;
    
    const statusText = statusBar.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = message;
    }
    
    // 移除所有状态类
    statusBar.classList.remove('status-info', 'status-success', 'status-warning', 'status-error');
    
    // 添加新状态类
    if (type !== 'idle') {
      statusBar.classList.add('status-' + type);
    }
  },
  
  /**
   * 重置状态栏
   * @param {string} modalId - 模态框ID
   */
  reset(modalId) {
    this.setStatus(modalId, '准备就绪', 'idle');
  },
  
  /**
   * 显示信息状态
   * @param {string} modalId - 模态框ID
   * @param {string} message - 消息内容
   */
  showInfo(modalId, message) {
    this.setStatus(modalId, message, 'info');
  },
  
  /**
   * 显示成功状态
   * @param {string} modalId - 模态框ID
   * @param {string} message - 消息内容
   */
  showSuccess(modalId, message) {
    this.setStatus(modalId, message, 'success');
  },
  
  /**
   * 显示警告状态
   * @param {string} modalId - 模态框ID
   * @param {string} message - 消息内容
   */
  showWarning(modalId, message) {
    this.setStatus(modalId, message, 'warning');
  },
  
  /**
   * 显示错误状态
   * @param {string} modalId - 模态框ID
   * @param {string} message - 消息内容
   */
  showError(modalId, message) {
    this.setStatus(modalId, message, 'error');
  }
};

/**
 * 更新备份按钮状态栏
 * @param {HTMLElement} btn - 按钮元素
 */
function updateBackupButtonStatusBar(btn) {
  const desc = btn.dataset.desc || '';
  const risk = btn.dataset.risk || '';
  
  const statusBar = document.getElementById('global-status-bar');
  if (!statusBar) return;
  
  const riskLabels = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
    critical: '危险操作'
  };
  
  const riskColors = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#dc2626'
  };
  
  statusBar.innerHTML = 
    '<div class="status-content">' +
      '<span style="color: ' + (riskColors[risk] || '#94a3b8') + '; font-weight: 600;">[' + (riskLabels[risk] || '操作') + ']</span>' +
      '<span style="color: #e2e8f0; margin-left: 8px;">' + desc + '</span>' +
    '</div>';
}

/**
 * 更新命令按钮状态栏
 * @param {HTMLElement} btn - 按钮元素
 */
function updateCommandStatusBar(btn) {
  const cmd = btn.dataset.cmd || '';
  const desc = btn.dataset.desc || '';
  
  const statusBar = document.getElementById('global-status-bar');
  if (!statusBar) return;
  
  statusBar.innerHTML = 
    '<div class="status-content">' +
      '<span style="color: #06b6d4; font-weight: 600;">[' + cmd + ']</span>' +
      '<span style="color: #e2e8f0; margin-left: 8px;">' + desc + '</span>' +
    '</div>';
}

/**
 * 更新检查项状态栏
 * @param {HTMLElement} item - 检查项元素
 */
function updateCheckItemStatusBar(item) {
  const name = item.dataset.name || '';
  const desc = item.dataset.desc || '';
  
  const statusBar = document.getElementById('global-status-bar');
  if (!statusBar) return;
  
  statusBar.innerHTML = 
    '<div class="status-content">' +
      '<span style="color: #8b5cf6; font-weight: 600;">[' + name + ']</span>' +
      '<span style="color: #e2e8f0; margin-left: 8px;">' + desc + '</span>' +
    '</div>';
}

/**
 * 更新备份项状态栏
 * @param {object} backup - 备份对象
 */
function updateBackupItemStatusBar(backup) {
  if (!backup) return;
  
  const statusBar = document.getElementById('global-status-bar');
  if (!statusBar) return;
  
  const date = new Date(backup.time);
  const size = backup.size ? (backup.size / 1024).toFixed(1) + ' KB' : '未知';
  
  statusBar.innerHTML = 
    '<div class="status-content">' +
      '<span style="color: #06b6d4; font-weight: 600;">[' + backup.provider + ']</span>' +
      '<span style="color: #e2e8f0; margin-left: 8px;">' + date.toLocaleString() + ' · ' + size + '</span>' +
    '</div>';
}
