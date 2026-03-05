// OpenClaw API Switcher - 日志管理模块
// 处理日志的加载、渲染、筛选和清理

// 日志级别图标映射
const LEVEL_ICONS = {
  success: '✅',
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌'
};

// 空状态消息
const EMPTY_MESSAGES = {
  all: '暂无日志',
  user: '暂无用户操作日志',
  system: '暂无系统日志',
  error: '暂无错误日志 ✅'
};

/**
 * 加载日志
 */
async function loadLogs() {
  try {
    const logs = await window.electronAPI.getLogs();
    StateManager.setLogs(logs);
    renderLogs();
  } catch (e) {
    console.error('[LogManager] 加载日志失败:', e);
  }
}

/**
 * 渲染日志列表
 */
function renderLogs() {
  const container = document.getElementById('logs-container');
  if (!container) return;
  
  const logs = StateManager.getLogs();
  const currentLogFilter = StateManager.getLogFilter();
  
  // 根据筛选器分类日志
  let filteredLogs = filterLogs(logs, currentLogFilter);
  
  // 限制显示 160 条
  filteredLogs = filteredLogs.slice(0, 160);
  
  if (filteredLogs.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:40px 20px"><div class="empty-state-icon">📝</div><div class="empty-state-title">' + EMPTY_MESSAGES[currentLogFilter] + '</div></div>';
    return;
  }
  
  container.innerHTML = filteredLogs.map(log => renderLogItem(log)).join('');
}

/**
 * 筛选日志
 * @param {Array} logs - 日志数组
 * @param {string} filter - 筛选器类型
 * @returns {Array} 筛选后的日志
 */
function filterLogs(logs, filter) {
  if (filter === 'all') return logs;
  
  if (filter === 'user') {
    return logs.filter(log => {
      // 优先显示用户操作日志
      if (log.logType === 'user') return true;
      
      // 排除各类调试日志
      if (shouldExcludeLog(log)) return false;
      
      return true;
    });
  } else if (filter === 'error') {
    return logs.filter(log => log.level === 'error' || log.level === 'warning');
  }
  
  return logs;
}

/**
 * 判断是否应该排除某条日志
 * @param {object} log - 日志对象
 * @returns {boolean} 是否排除
 */
function shouldExcludeLog(log) {
  if (!log.message) return false;
  const msg = log.message;
  
  // 排除 Gateway 状态检测等高频调试日志
  if (msg.includes('[Gateway] WebSocket 检测结果') ||
      msg.includes('[Gateway] 开始 WebSocket 检测') ||
      msg.includes('[Gateway] WebSocket 错误')) {
    return true;
  }
  
  // 排除备份列表扫描日志
  if (msg.includes('[list-backups]')) return true;
  
  // 排除备份操作的详细日志
  if (msg.includes('[Backup] 开始备份') ||
      msg.includes('[Backup] 当前模型') ||
      msg.includes('[Backup] 读取源文件')) {
    return true;
  }
  
  // 排除恢复备份的详细日志
  if (msg.includes('[restore-backup]')) return true;
  
  // 排除恢复初始化的详细日志
  if (msg.includes('[恢复初始化]')) return true;
  
  // 排除 OpenClaw 检测日志
  if (msg.includes('[OpenClaw]')) return true;
  
  // 排除 Debug 日志
  if (msg.includes('[Debug]')) return true;
  
  // 排除 Doctor 检查日志
  if (msg.includes('Doctor 检查完成')) return true;
  
  // 排除检查更新日志
  if (msg.includes('检查更新')) return true;
  
  return false;
}

/**
 * 渲染单条日志
 * @param {object} log - 日志对象
 * @returns {string} HTML字符串
 */
function renderLogItem(log) {
  const level = log.level || log.type || 'info';
  const logType = log.logType || 'system';
  const icon = LEVEL_ICONS[level] || 'ℹ️';
  const sourceLabel = '<span class="log-source">[' + (logType === 'user' ? '用户' : '系统') + ']</span>';
  
  // 格式化 details
  let detailsStr = formatLogDetails(log.details);
  
  return '<div class="log-item ' + level + ' ' + logType + '">' +
    '<span class="log-icon">' + icon + '</span>' +
    '<div class="log-content">' +
      '<div class="log-line">' +
        sourceLabel +
        '<span class="log-message">' + escapeHtml(log.message) + '</span>' +
        '<span class="log-time">' + formatTime(log.timestamp) + '</span>' +
      '</div>' +
      (detailsStr ? '<div class="log-details">' + escapeHtml(detailsStr) + '</div>' : '') +
    '</div>' +
  '</div>';
}

/**
 * 格式化日志详情
 * @param {any} details - 详情数据
 * @returns {string} 格式化后的字符串
 */
function formatLogDetails(details) {
  if (!details || details === '') return '';

  if (typeof details === 'object' && Object.keys(details).length > 0) {
    // 简化显示：只显示关键信息
    if (details.path) return details.path;
    if (details.backupPath) return details.backupPath;
    if (details.error) return '错误: ' + details.error;

    // 格式化对象，处理 output 字段中的转义字符
    let formatted = JSON.stringify(details, null, 2);

    // 处理 output 字段中的 \n 转义字符，将其转换为真正的换行
    if (details.output && typeof details.output === 'string') {
      // 提取关键信息，而不是显示完整输出
      const output = details.output;
      const lines = output.split('\\n').filter(line => line.trim());

      // 提取关键错误信息
      const keyInfo = [];
      if (output.includes('Service is loaded but not running')) {
        keyInfo.push('服务已加载但未运行');
      }
      if (output.includes('stopped')) {
        keyInfo.push('服务已停止');
      }
      if (output.includes('failed')) {
        keyInfo.push('服务启动失败');
      }
      if (output.includes('not installed')) {
        keyInfo.push('服务未安装');
      }

      if (keyInfo.length > 0) {
        return '状态: ' + keyInfo.join('，');
      }
    }

    // 如果对象有 code 字段，显示退出码
    if (details.code !== undefined) {
      return '退出码: ' + details.code;
    }

    return formatted;
  } else if (typeof details === 'string' && details.trim() !== '') {
    return details;
  }

  return '';
}

/**
 * 清空日志
 */
async function clearLogs() {
  if (!confirm('确定要清空所有日志吗？')) return;
  
  try {
    await window.electronAPI.clearLogs();
    StateManager.setLogs([]);
    renderLogs();
    setGlobalStatus('日志已清空', 'success');
  } catch (e) {
    console.error('[LogManager] 清空日志失败:', e);
    setGlobalStatus('清空日志失败', 'error');
  }
}

/**
 * 设置实时日志监听
 */
function setupRealtimeLogs() {
  window.electronAPI.onLogUpdated((log) => {
    const logs = StateManager.getLogs();
    logs.unshift(log);
    if (logs.length > 600) logs.length = 600; // 保持数组长度
    StateManager.setLogs(logs);
    renderLogs();
  });
}

/**
 * 添加日志
 * @param {string} level - 日志级别 (success | info | warning | error)
 * @param {string} message - 日志消息
 * @param {any} details - 详情
 * @param {string} logType - 日志类型 (user | system)
 */
function addLog(level, message, details, logType = 'system') {
  const log = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    level,
    logType,
    message,
    details: details || ''
  };
  
  const logs = StateManager.getLogs();
  logs.unshift(log);
  if (logs.length > 600) logs.length = 600;
  StateManager.setLogs(logs);
  
  renderLogs();
}

/**
 * 导出日志
 */
function exportLogs() {
  const logs = StateManager.getLogs();
  const exportData = {
    exportTime: new Date().toISOString(),
    totalLogs: logs.length,
    logs: logs
  };
  
  downloadJSON(exportData, 'api-switcher-logs-' + new Date().toISOString().slice(0, 10) + '.json');
  setGlobalStatus('日志已导出', 'success');
  addLog('info', '导出日志: ' + logs.length + ' 条', '', 'user');
}

/**
 * 设置日志筛选器
 * @param {string} filter - 筛选器类型 (all | user | system | error)
 */
function setLogFilter(filter) {
  StateManager.setLogFilter(filter);
  renderLogs();
}

/**
 * 打开日志目录
 */
async function openLogsDirectory() {
  try {
    const result = await window.electronAPI.openLogsDirectory();
    if (result.success) {
      addLog('info', '已打开日志目录', '', 'user');
    } else {
      addLog('error', '打开日志目录失败: ' + result.message, '', 'system');
      setGlobalStatus('打开日志目录失败: ' + result.message, 'error');
    }
  } catch (e) {
    console.error('[LogManager] 打开日志目录失败:', e);
    addLog('error', '打开日志目录失败: ' + e.message, '', 'system');
    setGlobalStatus('打开日志目录失败', 'error');
  }
}
