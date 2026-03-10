// OpenClaw API Switcher - 备份管理模块
// 处理备份的加载、恢复、创建和分页显示

// 每页显示的备份数量
const BACKUPS_PER_PAGE = 10;

// 当前备份页码
let backupPage = 1;

// 备份进度条定时器
let backupProgressInterval = null;

// 当前编辑的备份索引
let currentEditingBackupIndex = null;

// 当前选中的备份索引（用于侧边详情面板）
let currentSelectedBackupIndex = null;

/**
 * 加载备份列表（旧版，简单列表）
 */
async function loadBackups() {
  try {
    const backups = await window.electronAPI.listBackups();
    const container = document.getElementById('backup-list');
    if (!container) return;
    
    if (backups.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:20px">暂无备份</div>';
      return;
    }
    
    container.innerHTML = backups.map(b => 
      '<div class="backup-item"><div><div class="backup-name">' + escapeHtml(b.name) + '</div><div class="backup-time">' + new Date(b.time).toLocaleString() + '</div></div><div class="backup-actions"><button class="btn btn-sm btn-restore" data-path="' + escapeHtml(b.path) + '">恢复</button></div></div>'
    ).join('');
    
    container.querySelectorAll('.btn-restore').forEach(btn => 
      btn.addEventListener('click', () => restoreBackup(btn.dataset.path))
    );
  } catch (e) {
    console.error('[BackupManager] 加载备份失败:', e);
  }
}

/**
 * 加载备份列表（分页版）
 */
async function loadBackupsPaginated() {
  try {
    const backupList = await window.electronAPI.listBackups();
    StateManager.setBackupList(backupList);
    renderBackupList();
  } catch (e) {
    console.error('[BackupManager] 加载备份失败:', e);
  }
}

/**
 * 渲染备份分页列表（分类显示）
 * 新设计：顶部完整备份区域 + 管理菜单 + 侧边详情面板
 */
function renderBackupList() {
  const container = document.getElementById('backup-list');
  const pagination = document.getElementById('backup-pagination');
  if (!container) return;

  const backupList = StateManager.getBackupList();

  if (backupList.length === 0) {
    let html = renderEmptyState();
    container.innerHTML = html;
    if (pagination) pagination.innerHTML = '';
    return;
  }

  // 计算分页
  const totalPages = Math.ceil(backupList.length / BACKUPS_PER_PAGE);
  const startIndex = (backupPage - 1) * BACKUPS_PER_PAGE;
  const endIndex = Math.min(startIndex + BACKUPS_PER_PAGE, backupList.length);

  // 获取当前页的备份列表
  const pageBackups = backupList.slice(startIndex, endIndex);

  // 分类：完整备份 vs 单供应商备份（只针对当前页）
  const fullBackups = pageBackups.filter(b => b.dataType !== 'single');
  const singleBackups = pageBackups.filter(b => b.dataType === 'single');

  let html = '';

  // 完整备份区域
  if (fullBackups.length > 0) {
    html += '<div class="backup-category">';
    html += '<div class="backup-category-header"><span class="backup-category-icon">🗂️</span><span class="backup-category-title">完整备份</span><span class="backup-category-count">(' + fullBackups.length + ')</span></div>';
    html += '<div class="backup-category-items">';
    fullBackups.forEach((b) => {
      const globalIndex = backupList.indexOf(b);
      html += renderBackupItem(b, globalIndex);
    });
    html += '</div></div>';
  }

  // 单供应商备份区域
  if (singleBackups.length > 0) {
    html += '<div class="backup-category">';
    html += '<div class="backup-category-header"><span class="backup-category-icon">🔌</span><span class="backup-category-title">单供应商备份</span><span class="backup-category-count">(' + singleBackups.length + ')</span></div>';
    html += '<div class="backup-category-items">';
    singleBackups.forEach((b) => {
      const globalIndex = backupList.indexOf(b);
      html += renderBackupItem(b, globalIndex);
    });
    html += '</div></div>';
  }
  
  // 显示分页信息
  html += '<div class="backup-page-info">显示第 ' + (startIndex + 1) + ' - ' + endIndex + ' 个，共 ' + backupList.length + ' 个备份</div>';
  
  container.innerHTML = html;
  
  // 渲染分页控件（不含清空全部按钮）
  if (pagination) {
    pagination.innerHTML = 
      '<button class="btn btn-sm" onclick="changeBackupPage(' + (backupPage - 1) + ')" ' + (backupPage <= 1 ? 'disabled' : '') + '>上一页</button>' +
      '<span class="page-info">' + backupPage + ' / ' + totalPages + ' 页</span>' +
      '<button class="btn btn-sm" onclick="changeBackupPage(' + (backupPage + 1) + ')" ' + (backupPage >= totalPages ? 'disabled' : '') + '>下一页</button>';
  }
  
  // 绑定事件
  bindBackupItemEvents(container, backupList);
  bindManagementMenuEvents();
}

/**
 * 渲染顶部完整备份区域（精简版）
 */
function renderFullBackupSection() {
  return `
    <div class="full-backup-section">
      <button class="btn-full-backup-compact" onclick="createFullBackup()" data-desc="备份所有供应商配置到本地" data-risk="low">
        <span class="backup-icon">💾</span>
        <span class="backup-text">完整备份</span>
      </button>
    </div>
  `;
}

/**
 * 渲染空状态
 */
function renderEmptyState() {
  return `
    <div class="backup-empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-title">暂无备份</div>
      <div class="empty-desc">点击上方"立即备份全部"创建第一个备份</div>
      <div class="empty-hint">或者去API配置面板点击"保存配置"创建单供应商备份</div>
    </div>
  `;
}

/**
 * 渲染备份列表头部
 */
function renderBackupListHeader(totalCount) {
  return `
    <div class="backup-list-header">
      <div class="backup-list-title">
        <span>备份列表</span>
        <span class="backup-count">(${totalCount})</span>
      </div>
      <div class="backup-management">
        <button class="btn btn-sm btn-management" onclick="toggleBackupManagementMenu(event)" data-desc="备份管理操作">
          <span>⋯</span>
          <span>管理</span>
        </button>
        <div class="backup-management-menu" id="backup-management-menu" style="display: none;">
          <div class="menu-item" onclick="exportAllBackups()">
            <span class="menu-icon">📤</span>
            <span>导出全部备份</span>
          </div>
          <div class="menu-item" onclick="importBackups()">
            <span class="menu-icon">📥</span>
            <span>导入备份</span>
          </div>
          <div class="menu-divider"></div>
          <div class="menu-item menu-item-danger" onclick="clearAllBackupsWithConfirm()">
            <span class="menu-icon">🗑️</span>
            <span>清空全部备份</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染单个备份项（无操作按钮，点击打开侧边详情）
 */
function renderBackupItem(b, index) {
  const date = new Date(b.time);
  const isFullBackup = b.dataType !== 'single';
  const icon = isFullBackup ? '🗂️' : '🔌';
  const providerName = isFullBackup ? 'API列表备份' : (b.provider || 'unknown');
  const summary = isFullBackup
    ? (b.providerCount ? `${b.providerCount}个供应商` : '完整配置')
    : (b.modelName || '单供应商配置');
  const hasNote = b.note && b.note.trim();
  const noteDisplay = hasNote
    ? `<span class="backup-note-icon" title="${escapeHtml(b.note)}">📝</span>`
    : '';
  const isSelected = currentSelectedBackupIndex === index;

  let html = `<div class="backup-item ${isSelected ? 'selected' : ''}" data-backup-index="${index}" data-backup-path="${escapeHtml(b.path)}">`;

  // 左侧信息区域
  html += `<div class="backup-info">`;
  html += `<div class="backup-header">`;
  html += `<span class="backup-provider">${icon} ${escapeHtml(providerName)}</span>`;
  html += noteDisplay;
  html += `</div>`;
  html += `<div class="backup-name-row">`;
  html += `<span class="backup-name" style="color: rgba(255,255,255,0.5);">${escapeHtml(b.name)}</span>`;
  html += `</div>`;
  html += `<div class="backup-meta">`;
  html += `<span class="backup-time">${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>`;
  html += `</div>`;
  html += `</div>`;

  // 右侧：仅显示箭头
  html += `<div class="backup-arrow">▶</div>`;

  html += `</div>`;
  return html;
}

/**
 * 显示备份详情弹窗（定位在备份区域右侧）
 */
function showBackupDetailPopup(index) {
  const popup = document.getElementById('backup-detail-popup');
  const content = document.getElementById('backup-detail-popup-content');
  if (!popup || !content) return;

  const backupList = StateManager.getBackupList();
  if (index < 0 || index >= backupList.length) return;

  const backup = backupList[index];
  currentSelectedBackupIndex = index;

  // 渲染内容
  content.innerHTML = renderBackupDetailPopupContent(backup);

  // 定位弹窗 - 在备份区域右侧
  const backupSection = document.getElementById('api-backup-section');
  if (backupSection) {
    const rect = backupSection.getBoundingClientRect();
    // 使用固定定位，相对于视口
    popup.style.left = (rect.right + 10) + 'px';
    popup.style.top = rect.top + 'px';
    
    // 确保弹窗不超出视口右边界
    const popupWidth = 320;
    const viewportWidth = window.innerWidth;
    if (rect.right + 10 + popupWidth > viewportWidth) {
      // 如果右侧空间不足，显示在左侧
      popup.style.left = (rect.left - popupWidth - 10) + 'px';
    }
    
    // 确保弹窗不超出视口底部
    const popupHeight = Math.min(500, window.innerHeight * 0.8);
    if (rect.top + popupHeight > window.innerHeight) {
      popup.style.top = Math.max(10, window.innerHeight - popupHeight - 10) + 'px';
    }
  }

  popup.style.display = 'block';

  // 更新列表选中状态（仅更新选中样式，不重新渲染）
  updateBackupItemSelection(index);
}

/**
 * 关闭备份详情弹窗
 */
function closeBackupDetailPopup() {
  const popup = document.getElementById('backup-detail-popup');
  if (popup) {
    popup.style.display = 'none';
  }
  currentSelectedBackupIndex = null;
  // 清除所有选中状态
  document.querySelectorAll('.backup-item').forEach(item => {
    item.classList.remove('selected');
  });
}

/**
 * 更新备份项选中状态（仅更新样式，不重新渲染）
 */
function updateBackupItemSelection(selectedIndex) {
  document.querySelectorAll('.backup-item').forEach(item => {
    const index = parseInt(item.dataset.backupIndex);
    if (index === selectedIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

/**
 * 渲染备份详情弹窗内容 - 精致版
 */
function renderBackupDetailPopupContent(backup) {
  if (!backup) return '';

  const date = new Date(backup.time);
  const isFullBackup = backup.dataType !== 'single';
  const providerName = isFullBackup ? 'API供应商列表备份' : (backup.provider || 'unknown');
  const modelName = backup.modelName || '';
  const noteValue = backup.note || '';

  let html = `<div class="popup-detail-content">`;

  // 主标题 - 13px，淡白色，不显示模型名（因为是多供应商备份）
  html += `<div style="font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.5); margin-bottom: 4px;">`;
  html += `${escapeHtml(providerName)}`;
  html += `</div>`;

  // 备份时间
  html += `<div class="backup-detail-time">`;
  html += `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  html += `</div>`;

  // 分隔线
  html += `<div class="detail-divider"></div>`;

  // 文件名（仅显示，无路径信息）
  html += `<div class="detail-row-with-label">`;
  html += `<div class="detail-row-label">📄 文件名</div>`;
  html += `<div class="filename-text" style="color: rgba(255,255,255,0.5);">${escapeHtml(backup.name)}</div>`;

  // 备份类型标签
  const typeLabel = isFullBackup ? '完整备份' : '单供应商备份';
  html += `<div class="backup-type-tag" style="color: #666680;">${typeLabel}</div>`;
  html += `</div>`;

  // 备份位置
  html += `<div class="detail-row-with-label">`;
  html += `<div class="detail-row-label backup-path-link" data-status-hint="点击在 Finder 中打开备份所在目录" onclick="openBackupFolder('${escapeHtmlAttr(backup.path)}')">`;
  html += `📁 备份位置`;
  html += `</div>`;
  html += `<div class="backup-path-text" style="color: rgba(255,255,255,0.4); font-size: 11px; word-break: break-all; line-height: 1.4;">${escapeHtml(backup.path)}</div>`;
  html += `</div>`;

  // 完整备份：合并显示供应商信息
  if (isFullBackup && backup.providers && Array.isArray(backup.providers) && backup.providers.length > 0) {
    html += `<div class="detail-row-with-label">`;
    html += `<div class="detail-row-label">📊 供应商 (${backup.providers.length}个)</div>`;
    html += `<div style="display: flex; flex-direction: column; gap: 5px; margin-top: 6px;">`;

    backup.providers.forEach(provider => {
      const providerName = provider.provider || provider.name || '未知';
      const modelCount = provider.models ? provider.models.length : 0;
      html += `<div style="display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; background: rgba(255,255,255,0.03); border-radius: 5px;">`;
      html += `<span style="color: #a0a0b0; font-size: 12px;">${escapeHtml(providerName)}</span>`;
      html += `<span style="color: #666680; font-size: 11px;">${modelCount}个模型</span>`;
      html += `</div>`;
    });

    html += `</div>`;
    html += `</div>`;
  }

  // 备注区域
  html += `<div class="detail-row-with-label">`;
  html += `<div class="detail-row-label">📝 备注</div>`;
  html += `<textarea class="note-input" id="backup-note-input" placeholder="点击输入备注，关闭后自动保存" maxlength="200" `;
  html += `onchange="saveBackupNoteInline('${escapeHtmlAttr(backup.path)}', this.value)">${escapeHtml(noteValue)}</textarea>`;
  html += `</div>`;

  // 分隔线
  html += `<div class="detail-divider"></div>`;

  // 操作按钮 - 精致小巧
  html += `<div class="detail-actions-row" style="gap: 8px;">`;
  html += `<button class="btn-action btn-restore-action" data-status-hint="恢复此备份：将备份中的配置恢复到程序中" onclick="restoreBackup('${escapeHtmlAttr(backup.path)}')" style="padding: 7px 12px; font-size: 11px;">`;
  html += `<span>💾</span> 恢复此备份`;
  html += `</button>`;
  html += `<button class="btn-action btn-delete-action" data-status-hint="删除此备份：永久删除此备份文件，不可恢复" onclick="deleteBackupFromPopup('${escapeHtmlAttr(backup.path)}')" style="padding: 7px 12px; font-size: 11px;">`;
  html += `<span>🗑️</span> 删除此备份`;
  html += `</button>`;
  html += `</div>`;

  html += `</div>`;
  return html;
}

/**
 * 从弹窗删除备份
 */
async function deleteBackupFromPopup(backupPath) {
  if (!confirm('确定要删除此备份吗？\n此操作不可恢复！')) return;

  try {
    const result = await window.electronAPI.deleteBackup(backupPath);
    if (result.success) {
      setGlobalStatus('备份已删除', 'success');
      closeBackupDetailPopup();
      await loadBackupsPaginated();
    } else {
      setGlobalStatus('删除失败: ' + result.error, 'error');
    }
  } catch (e) {
    console.error('[BackupManager] 删除备份失败:', e);
    setGlobalStatus('删除失败', 'error');
  }
}

/**
 * 在文件夹中显示备份
 */
async function openBackupFolder(backupPath) {
  try {
    const result = await window.electronAPI.openBackupDirectory(backupPath);
    if (!result.success) {
      setGlobalStatus('打开文件夹失败: ' + result.error, 'error');
    }
  } catch (e) {
    console.error('[BackupManager] 打开文件夹失败:', e);
    setGlobalStatus('打开文件夹失败', 'error');
  }
}

/**
 * 绑定备份项事件（点击打开详情弹窗）
 */
function bindBackupItemEvents(container, backupList) {
  // 点击备份项打开详情弹窗
  container.querySelectorAll('.backup-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡，避免触发外部点击关闭
      const index = parseInt(item.dataset.backupIndex);
      showBackupDetailPopup(index);
    });
  });
}

/**
 * 绑定管理菜单事件
 */
function bindManagementMenuEvents() {
  // 点击外部关闭管理菜单和详情弹窗
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('backup-management-menu');
    const btn = document.querySelector('.btn-management-menu');
    if (menu && !menu.contains(e.target) && !(btn && btn.contains(e.target))) {
      menu.classList.remove('show');
      setTimeout(() => {
        if (!menu.classList.contains('show')) {
          menu.style.display = 'none';
        }
      }, 200);
    }

    // 点击外部关闭详情弹窗
    const popup = document.getElementById('backup-detail-popup');
    const backupList = document.getElementById('backup-list');
    if (popup && popup.style.display === 'block') {
      // 检查点击是否在弹窗内部或备份列表内部
      if (!popup.contains(e.target) && !backupList.contains(e.target)) {
        closeBackupDetailPopup();
      }
    }
  });

  // 设置菜单项全局提示
  setupMenuItemHints();
}

/**
 * 设置菜单项全局提示
 */
function setupMenuItemHints() {
  const menuItems = document.querySelectorAll('.backup-management-dropdown .menu-item');

  menuItems.forEach(item => {
    item.addEventListener('mouseenter', () => {
      const desc = item.getAttribute('data-desc') || '';
      const risk = item.getAttribute('data-risk') || 'low';

      if (desc && typeof setGlobalStatus === 'function') {
        let message = desc;
        if (risk === 'high') {
          message += ' [高风险操作]';
          setGlobalStatus(message, 'error');
        } else if (risk === 'medium') {
          message += ' [中风险操作]';
          setGlobalStatus(message, 'warning');
        } else {
          setGlobalStatus(message, 'info');
        }
      }
    });

    item.addEventListener('mouseleave', () => {
      if (typeof resetGlobalStatusBar === 'function') {
        resetGlobalStatusBar();
      }
    });
  });

  // 管理按钮全局提示
  const manageBtn = document.querySelector('.btn-management-menu');
  if (manageBtn) {
    manageBtn.addEventListener('mouseenter', () => {
      const desc = manageBtn.getAttribute('data-desc') || '备份管理操作';
      if (typeof setGlobalStatus === 'function') {
        setGlobalStatus(desc, 'info');
      }
    });

    manageBtn.addEventListener('mouseleave', () => {
      if (typeof resetGlobalStatusBar === 'function') {
        resetGlobalStatusBar();
      }
    });
  }
}

/**
 * 切换管理菜单显示
 */
function toggleBackupManagementMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('backup-management-menu');
  if (menu) {
    if (menu.style.display === 'none' || !menu.style.display) {
      menu.style.display = 'block';
      // 强制重绘以确保动画生效
      menu.offsetHeight;
      menu.classList.add('show');
    } else {
      menu.classList.remove('show');
      setTimeout(() => {
        if (!menu.classList.contains('show')) {
          menu.style.display = 'none';
        }
      }, 200);
    }
  }
}

/**
 * 保存备份备注（内联版）
 */
async function saveBackupNoteInline(backupPath, note) {
  try {
    // 更新内存中的备份列表
    const backupList = StateManager.getBackupList();
    const backup = backupList.find(b => b.path === backupPath);
    if (backup) {
      backup.note = note.trim();
      StateManager.setBackupList(backupList);
    }
    
    // 保存到文件
    const result = await window.electronAPI.updateBackupNote(backupPath, note.trim());
    if (result.success) {
      setGlobalStatus(note.trim() ? '备注已保存' : '备注已清除', 'success');
      // 刷新显示但不重新渲染整个列表（保持展开状态）
      renderBackupList();
    } else {
      setGlobalStatus('保存备注失败: ' + result.error, 'error');
    }
  } catch (e) {
    console.error('[BackupManager] 保存备注失败:', e);
    setGlobalStatus('保存备注失败', 'error');
  }
}

/**
 * 创建完整备份
 */
async function createFullBackup() {
  showBackupProgress('blue');
  
  try {
    // 调用主进程创建完整备份
    const result = await window.electronAPI.backupConfig(true); // true = full backup
    
    if (result.success) {
      hideBackupProgress(true);
      
      // 构建新备份对象
      const newBackup = {
        name: result.fileName || 'full-backup.json',
        path: result.path,
        relativePath: result.relativePath,
        provider: '完整备份',
        providerCount: result.providerCount || 0,
        time: new Date().toISOString(),
        size: result.size || 0,
        dataType: 'full',
        backupType: 'manual'
      };
      
      // 添加到列表头部
      const backupList = StateManager.getBackupList();
      backupList.unshift(newBackup);
      StateManager.setBackupList(backupList);
      
      // 重置到第一页并刷新
      backupPage = 1;
      renderBackupList();
      
      // 显示成功提示
      setGlobalStatus(`完整备份创建成功，包含 ${newBackup.providerCount} 个供应商`, 'success');
      
      // 显示详细通知
      if (typeof showNotification === 'function') {
        showNotification({
          type: 'success',
          title: '备份成功',
          message: `已创建完整备份，包含 ${newBackup.providerCount} 个供应商配置`,
          duration: 3000
        });
      }
      
      // 记录日志
      addLog('success', `创建完整备份成功: ${newBackup.name}`, {
        providerCount: newBackup.providerCount,
        size: newBackup.size,
        path: newBackup.path
      }, 'user');
      
      // 检查 OpenClaw 配置
      if (typeof autoCheckOpenClawConfig === 'function') {
        autoCheckOpenClawConfig('backup');
      }
    } else {
      hideBackupProgress(false);
      setGlobalStatus('完整备份创建失败: ' + result.message, 'error');
    }
  } catch (error) {
    hideBackupProgress(false);
    console.error('[BackupManager] 创建完整备份失败:', error);
    setGlobalStatus('完整备份创建失败', 'error');
  }
}

/**
 * 初始化 OpenClaw 配置（带确认对话框）
 * 强制融合模板字段，重建完整配置结构
 */
async function initializeOpenClawConfigWithConfirm() {
  // 显示确认对话框
  const confirmed = confirm('⚠️ 初始化 OpenClaw 配置\n\n此操作将：\n• 清空所有供应商配置\n• 保留 gateway、wizard 等关键参数\n• 重置为干净的初始状态\n\n确定要继续吗？');
  
  if (!confirmed) {
    return;
  }
  
  showBackupProgress('blue');
  
  try {
    // 调用主进程初始化配置
    const result = await window.electronAPI.initializeOpenClawConfig();
    
    if (result.success) {
      hideBackupProgress(true);
      
      // 显示成功提示
      setGlobalStatus('OpenClaw 配置初始化成功', 'success');
      
      // 显示详细通知
      if (typeof showNotification === 'function') {
        showNotification({
          type: 'success',
          title: '初始化成功',
          message: '已强制融合模板字段，OpenClaw 配置结构已重建',
          duration: 3000
        });
      }
      
      // 记录日志
      addLog('success', 'OpenClaw 配置初始化成功', {
        fieldsAdded: result.fieldsAdded || []
      }, 'user');
      
      // 检查 OpenClaw 配置
      if (typeof autoCheckOpenClawConfig === 'function') {
        autoCheckOpenClawConfig('init');
      }
    } else {
      hideBackupProgress(false);
      setGlobalStatus('配置初始化失败: ' + result.message, 'error');
      
      if (typeof showNotification === 'function') {
        showNotification({
          type: 'error',
          title: '初始化失败',
          message: result.message || '未知错误',
          duration: 5000
        });
      }
    }
  } catch (error) {
    hideBackupProgress(false);
    console.error('[BackupManager] 初始化配置失败:', error);
    setGlobalStatus('配置初始化失败: ' + error.message, 'error');
    
    if (typeof showNotification === 'function') {
      showNotification({
        type: 'error',
        title: '初始化失败',
        message: error.message || '未知错误',
        duration: 5000
      });
    }
  }
}

/**
 * 创建初始化备份（立即备份）
 * 备份所有供应商配置到 init-backups 目录
 */
async function createInitBackup() {
  // 关闭菜单
  const menu = document.getElementById('backup-management-menu');
  if (menu) menu.style.display = 'none';
  
  showBackupProgress('green');
  
  try {
    // 调用主进程创建初始化备份（isInitBackup = true）
    const result = await window.electronAPI.backupConfig(true);
    
    if (result.success) {
      hideBackupProgress(true);
      
      // 解析备份文件名
      const pathParts = result.path.replace(/\\/g, '/').split('/');
      const backupName = pathParts[pathParts.length - 1];
      
      // 创建备份对象
      const newBackup = {
        name: backupName,
        path: result.path,
        relativePath: result.relativePath,
        provider: result.provider,
        time: new Date().toISOString(),
        size: result.size || 0,
        fileCount: result.fileCount || 0,
        dataType: result.type || 'full'
      };
      
      // 更新备份列表
      const backupList = StateManager.getBackupList();
      backupList.unshift(newBackup);
      StateManager.setBackupList(backupList);
      
      // 刷新显示
      renderBackupList();
      
      // 显示全局状态
      setGlobalStatus('立即备份成功: ' + backupName, 'success');
      
      // 显示通知
      if (typeof showNotification === 'function') {
        showNotification({
          type: 'success',
          title: '备份成功',
          message: `已备份所有供应商配置到 init-backups`,
          duration: 3000
        });
      }
      
      // 记录日志
      addLog('success', '立即备份成功（所有供应商）', {
        backupName: backupName,
        path: result.path,
        providerCount: result.providerCount || 1
      }, 'user');
      
      // 刷新备份列表
      setTimeout(async () => {
        await loadBackupsPaginated();
      }, 500);
      
    } else {
      hideBackupProgress(false);
      setGlobalStatus('立即备份失败: ' + result.message, 'error');
      
      if (typeof showNotification === 'function') {
        showNotification({
          type: 'error',
          title: '备份失败',
          message: result.message || '未知错误',
          duration: 5000
        });
      }
    }
  } catch (error) {
    hideBackupProgress(false);
    console.error('[BackupManager] 立即备份失败:', error);
    setGlobalStatus('立即备份失败: ' + error.message, 'error');
    
    if (typeof showNotification === 'function') {
      showNotification({
        type: 'error',
        title: '备份失败',
        message: error.message || '未知错误',
        duration: 5000
      });
    }
  }
}

/**
 * 导出选中的备份
 * 【v2.7.5】实现导出功能 - 导出当前列表中的所有备份
 */
async function exportAllBackups() {
  // 关闭菜单
  const menu = document.getElementById('backup-management-menu');
  if (menu) menu.style.display = 'none';

  const backupList = StateManager.getBackupList();
  if (backupList.length === 0) {
    setGlobalStatus('没有备份可导出', 'warning');
    return;
  }

  // 【v2.7.5】检查依赖是否安装
  const depsCheck = await window.electronAPI.checkDependencies();
  if (!depsCheck.success) {
    const installConfirm = confirm(`📦 缺少必要的依赖\n\n导出功能需要以下依赖：\n• archiver\n• extract-zip\n\n是否现在安装？（需要联网）\n\n提示：安装完成后请重新启动程序。`);
    if (installConfirm) {
      setGlobalStatus('正在安装依赖，请稍候...', 'info');
      const installResult = await window.electronAPI.installDependencies();
      if (installResult.success) {
        alert('✅ 依赖安装成功！\n\n请重新启动程序以使用导出功能。');
        setGlobalStatus('依赖安装成功，请重启程序', 'success');
      } else {
        setGlobalStatus(`依赖安装失败: ${installResult.error}`, 'error');
      }
    }
    return;
  }

  // 【v2.7.5】显示导出确认对话框
  const confirmMessage = `📦 导出全部备份

即将导出 ${backupList.length} 个备份文件（包括完整备份和单供应商备份）。

💡 提示：
• 导出的备份将打包为 ZIP 文件
• 您可以选择保存位置
• 导出的备份可以在其他设备上导入

是否继续导出？`;

  const confirmed = confirm(confirmMessage);
  if (!confirmed) {
    setGlobalStatus('导出已取消', 'info');
    return;
  }

  // 获取所有备份的路径
  const backupPaths = backupList.map(b => b.path);

  setGlobalStatus('正在导出备份...', 'info');

  try {
    const result = await window.electronAPI.exportBackups(backupPaths);
    if (result.success) {
      setGlobalStatus(`导出成功！${result.count} 个备份已导出`, 'success');
    } else if (result.canceled) {
      setGlobalStatus('导出已取消', 'info');
    } else {
      setGlobalStatus(`导出失败: ${result.error}`, 'error');
    }
  } catch (error) {
    setGlobalStatus(`导出异常: ${error.message}`, 'error');
  }
}

/**
 * 导入备份
 * 【v2.7.5】实现导入功能 - 从 ZIP 文件导入备份到相应位置
 */
async function importBackups() {
  // 关闭菜单
  const menu = document.getElementById('backup-management-menu');
  if (menu) menu.style.display = 'none';

  // 【v2.7.5】检查依赖是否安装
  const depsCheck = await window.electronAPI.checkDependencies();
  if (!depsCheck.success) {
    const installConfirm = confirm(`📦 缺少必要的依赖\n\n导入功能需要以下依赖：\n• archiver\n• extract-zip\n\n是否现在安装？（需要联网）\n\n提示：安装完成后请重新启动程序。`);
    if (installConfirm) {
      setGlobalStatus('正在安装依赖，请稍候...', 'info');
      const installResult = await window.electronAPI.installDependencies();
      if (installResult.success) {
        alert('✅ 依赖安装成功！\n\n请重新启动程序以使用导入功能。');
        setGlobalStatus('依赖安装成功，请重启程序', 'success');
      } else {
        setGlobalStatus(`依赖安装失败: ${installResult.error}`, 'error');
      }
    }
    return;
  }

  // 【v2.7.5】显示导入确认对话框
  const confirmMessage = `📥 导入备份

即将从 ZIP 文件导入备份。

⚠️ 重要提示：
• 如果备份列表中已存在同名备份，将会被覆盖
• 建议先导出当前备份作为额外保护
• 导入后无法自动恢复被覆盖的备份

是否继续导入？`;

  const confirmed = confirm(confirmMessage);
  if (!confirmed) {
    setGlobalStatus('导入已取消', 'info');
    return;
  }

  setGlobalStatus('请选择要导入的备份文件...', 'info');

  try {
    const result = await window.electronAPI.importBackups();
    if (result.success) {
      const overwrittenCount = result.importedFiles.filter(f => f.overwritten).length;
      const newCount = result.importedFiles.length - overwrittenCount;
      let message = `导入成功！共 ${result.importedFiles.length} 个备份`;
      if (newCount > 0) message += `，其中 ${newCount} 个为新导入`;
      if (overwrittenCount > 0) message += `，${overwrittenCount} 个已覆盖`;
      setGlobalStatus(message, 'success');
      // 刷新备份列表
      await loadBackupsPaginated();
    } else if (result.canceled) {
      setGlobalStatus('导入已取消', 'info');
    } else {
      setGlobalStatus(`导入失败: ${result.error}`, 'error');
    }
  } catch (error) {
    setGlobalStatus(`导入异常: ${error.message}`, 'error');
  }
}

/**
 * 清空全部备份（带二次确认）
 */
async function clearAllBackupsWithConfirm() {
  // 关闭菜单
  const menu = document.getElementById('backup-management-menu');
  if (menu) menu.style.display = 'none';
  
  const backupList = StateManager.getBackupList();
  const count = backupList.length;
  
  if (count === 0) {
    setGlobalStatus('没有备份需要清空', 'info');
    return;
  }
  
  // 二次确认
  const confirmed = confirm(`⚠️ 确认清空全部备份？\n\n这将永久删除 ${count} 个备份文件，此操作不可恢复！\n\n点击"确定"继续，点击"取消"返回。`);
  
  if (!confirmed) return;
  
  try {
    const result = await window.electronAPI.clearAllBackups();
    if (result.success) {
      const deletedCount = result.deletedCount || count;
      setGlobalStatus(`已清空 ${deletedCount} 个备份`, 'success');
      StateManager.setBackupList([]);
      currentSelectedBackupIndex = null;
      renderBackupList();
      
      // 显示成功通知
      if (typeof showNotification === 'function') {
        showNotification({
          type: 'success',
          title: '清空完成',
          message: `已成功删除 ${deletedCount} 个备份文件`,
          duration: 3000
        });
      }
      
      addLog('success', `清空全部备份成功: ${deletedCount} 个文件已删除`, {
        deletedCount: deletedCount,
        timestamp: new Date().toISOString()
      }, 'user');
    } else {
      setGlobalStatus('清空失败: ' + result.error, 'error');
      addLog('error', '清空备份失败', { error: result.error }, 'user');
    }
  } catch (e) {
    console.error('[BackupManager] 清空备份失败:', e);
    setGlobalStatus('清空失败', 'error');
    addLog('error', '清空备份异常', { error: e.message }, 'user');
  }
}

/**
 * 切换备份页面
 */
function changeBackupPage(newPage) {
  const backupList = StateManager.getBackupList();
  const totalPages = Math.ceil(backupList.length / BACKUPS_PER_PAGE);
  
  if (newPage < 1 || newPage > totalPages) return;
  
  backupPage = newPage;
  currentSelectedBackupIndex = null; // 切换页面时关闭详情面板
  renderBackupList();
}

/**
 * 恢复备份
 */
async function restoreBackup(backupPath) {
  const backupList = StateManager.getBackupList();
  const backup = backupList.find(b => b.path === backupPath);
  const backupName = backup ? backup.name : backupPath;
  const backupType = backup?.dataType || 'full';
  const provider = backup?.provider || 'unknown';
  
  // 根据备份类型显示不同的确认对话框
  let confirmMessage = '';
  if (backupType === 'single') {
    confirmMessage = '确定要恢复此单供应商备份吗？\n\n' +
      '供应商: ' + provider + '\n' +
      '备份: ' + backupName + '\n\n' +
      '将恢复 ' + provider + ' 的配置并设为当前选中\n' +
      '其他供应商不受影响';
  } else {
    // 完整备份
    const apiConfig = await window.electronAPI.loadApiConfig();
    const currentProviderCount = Object.keys(apiConfig?.providers || {}).length;
    confirmMessage = '确定要恢复此完整备份吗？\n\n' +
      '备份: ' + backupName + '\n\n' +
      '将覆盖当前 ' + currentProviderCount + ' 个供应商的配置\n' +
      '当前配置将被完全替换！';
  }
  
  if (!confirm(confirmMessage)) return;
  
  showBackupProgress('pink');
  
  const result = await window.electronAPI.restoreBackup(backupPath);
  
  hideBackupProgress(result.success);
  
  if (result.success) {
    await loadConfig();
    await renderProviderList();
    
    // 恢复后默认选择逻辑
    if (backupType === 'single' && result.provider) {
      console.log('[Backup] 单供应商恢复后自动选择:', result.provider);
      await selectProvider(result.provider);
    } else if (result.selectedProvider) {
      console.log('[Backup] 恢复后自动选择 provider:', result.selectedProvider);
      await selectProvider(result.selectedProvider);
    } else {
      const apiConfig = await window.electronAPI.loadApiConfig();
      const providers = Object.keys(apiConfig.providers || {});
      if (providers.length > 0) {
        const firstProvider = providers[0];
        console.log('[Backup] 恢复后默认选择第一个 provider:', firstProvider);
        await selectProvider(firstProvider);
      } else {
        renderCurrentModel();
      }
    }
    
    await loadBackupsPaginated();
    
    // 添加恢复成功日志
    const successMessage = backupType === 'single' 
      ? `单供应商备份恢复成功 [${result.provider}]`
      : `完整备份恢复成功 [${result.selectedProvider || provider}]`;
    addLog('success', successMessage, {
      backupName: backupName,
      backupType: backupType,
      provider: result.provider || result.selectedProvider,
      timestamp: result.timestamp
    }, 'user');
    
    // 显示全局状态
    setGlobalStatus(successMessage, 'success');
    
    // 恢复操作后检查 OpenClaw 配置
    if (typeof autoCheckOpenClawConfig === 'function') {
      setTimeout(() => autoCheckOpenClawConfig('restore'), 500);
    }
  }
}

/**
 * 删除单个备份
 */
async function deleteSingleBackup(backupPath) {
  if (!confirm('确定要删除此备份吗？\n此操作不可恢复！')) return;
  
  try {
    const result = await window.electronAPI.deleteBackup(backupPath);
    if (result.success) {
      setGlobalStatus('备份已删除', 'success');
      // 如果删除的是当前展开的，重置展开状态
      const backupList = StateManager.getBackupList();
      const deletedIndex = backupList.findIndex(b => b.path === backupPath);
      if (deletedIndex === currentExpandedBackupIndex) {
        currentExpandedBackupIndex = null;
      }
      await loadBackupsPaginated();
    } else {
      setGlobalStatus('删除失败: ' + result.error, 'error');
    }
  } catch (e) {
    console.error('[BackupManager] 删除备份失败:', e);
    setGlobalStatus('删除失败', 'error');
  }
}

/**
 * 立即备份（全部供应商）
 */
async function backupNow() {
  showBackupProgress('green');
  
  const result = await window.electronAPI.backupConfig(false);
  
  if (result.success) {
    hideBackupProgress(true);
    
    const pathParts = result.path.replace(/\\/g, '/').split('/');
    const newBackup = {
      name: pathParts[pathParts.length - 1],
      path: result.path,
      relativePath: result.relativePath,
      provider: result.provider,
      time: new Date().toISOString(),
      size: result.size || 0,
      fileCount: result.fileCount || 0,
      dataType: result.type || 'single'
    };
    
    const backupList = StateManager.getBackupList();
    backupList.unshift(newBackup);
    StateManager.setBackupList(backupList);
    renderBackupList();
    
    // 显示全局状态
    setGlobalStatus('备份创建成功: ' + newBackup.name, 'success');
    
    setTimeout(async () => {
      await loadBackupsPaginated();
      
      if (typeof autoCheckOpenClawConfig === 'function') {
        autoCheckOpenClawConfig('backup');
      }
    }, 500);
  } else {
    hideBackupProgress(false);
  }
}

/**
 * 显示备份进度条
 */
function showBackupProgress(color = 'blue') {
  const container = document.getElementById('backup-progress-container');
  const bar = document.getElementById('backup-progress-bar');
  if (!container || !bar) return;
  
  const colors = {
    orange: 'linear-gradient(90deg, #f97316, #fb923c)',
    pink: 'linear-gradient(90deg, #ec4899, #f472b6)',
    green: 'linear-gradient(90deg, #22c55e, #4ade80)',
    blue: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-blue))'
  };
  
  bar.style.background = colors[color] || colors.blue;
  container.style.opacity = '1';
  bar.style.width = '0%';
  
  if (backupProgressInterval) {
    clearInterval(backupProgressInterval);
  }
  
  let progress = 10;
  bar.style.width = progress + '%';
  
  backupProgressInterval = setInterval(() => {
    if (progress < 90) {
      progress += 5;
      bar.style.width = progress + '%';
    }
  }, 50);
}

/**
 * 隐藏备份进度条
 */
function hideBackupProgress(success = true) {
  const container = document.getElementById('backup-progress-container');
  const bar = document.getElementById('backup-progress-bar');
  if (!container || !bar) return;
  
  if (backupProgressInterval) {
    clearInterval(backupProgressInterval);
    backupProgressInterval = null;
  }
  
  if (success) {
    bar.style.width = '100%';
    setTimeout(() => {
      container.style.opacity = '0';
      setTimeout(() => {
        bar.style.width = '0%';
      }, 300);
    }, 500);
  } else {
    container.style.opacity = '0';
    setTimeout(() => {
      bar.style.width = '0%';
    }, 300);
  }
}

/**
 * 编辑备份备注（弹窗版，保留兼容）
 */
async function editBackupNote(index, triggerElement) {
  const backupList = StateManager.getBackupList();
  const backup = backupList[index];
  if (!backup) return;
  
  currentEditingBackupIndex = index;
  const modal = document.getElementById('backup-note-modal');
  const input = document.getElementById('backup-note-input');
  const count = document.getElementById('backup-note-count');

  if (!modal || !input || !count) return;

  input.value = backup.note || '';
  count.textContent = (backup.note || '').length + '/50';
  
  if (triggerElement) {
    const rect = triggerElement.getBoundingClientRect();
    const modalWidth = 220;
    const modalHeight = 140;
    
    let left = rect.left + (rect.width / 2) - (modalWidth / 2);
    let top = rect.top - modalHeight - 10;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (left < 10) left = 10;
    if (left + modalWidth > viewportWidth - 10) left = viewportWidth - modalWidth - 10;
    
    if (top < 10) {
      top = rect.bottom + 10;
      modal.classList.add('arrow-top');
    } else {
      modal.classList.remove('arrow-top');
    }
    
    modal.style.left = left + 'px';
    modal.style.top = top + 'px';
  }
  
  modal.style.display = 'block';
  modal.classList.add('show');

  setTimeout(() => input.focus(), 100);
  
  setTimeout(() => {
    document.addEventListener('mousedown', handleNoteModalClickOutside);
  }, 100);
}

/**
 * 关闭备注编辑弹窗
 */
function closeBackupNoteModal() {
  const modal = document.getElementById('backup-note-modal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 200);
  }
  currentEditingBackupIndex = null;
  
  document.removeEventListener('mousedown', handleNoteModalClickOutside);
}

/**
 * 处理备注弹窗点击外部关闭
 */
function handleNoteModalClickOutside(event) {
  const modal = document.getElementById('backup-note-modal');
  if (!modal || modal.style.display === 'none') return;
  
  if (!modal.contains(event.target)) {
    closeBackupNoteModal();
  }
}

/**
 * 保存备份备注（弹窗版）
 */
async function saveBackupNote() {
  if (currentEditingBackupIndex === null) return;
  
  const input = document.getElementById('backup-note-input');
  if (!input) return;
  
  const newNote = input.value.trim();
  
  if (newNote.length > 50) {
    setGlobalStatus('备注不能超过50字', 'error');
    return;
  }
  
  const backupList = StateManager.getBackupList();
  backupList[currentEditingBackupIndex].note = newNote;
  StateManager.setBackupList(backupList);
  
  closeBackupNoteModal();
  renderBackupList();
  
  setGlobalStatus(newNote ? '备注已添加' : '备注已清除', 'success');
}

/**
 * 设置备注输入监听
 */
function setupBackupNoteInput() {
  const input = document.getElementById('backup-note-input');
  const count = document.getElementById('backup-note-count');
  if (!input || !count) return;
  
  input.addEventListener('input', () => {
    count.textContent = input.value.length + '/50';
  });
  
  const modal = document.getElementById('backup-note-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeBackupNoteModal();
      }
    });
  }
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
      closeBackupNoteModal();
    }
  });
}

/**
 * 打开备份所在目录
 */
async function openBackupDirectory(backupPath) {
  try {
    await window.electronAPI.openBackupDirectory(backupPath);
  } catch (e) {
    console.error('[BackupManager] 打开备份目录失败:', e);
    setGlobalStatus('打开目录失败', 'error');
  }
}

/**
 * 提取模型名称（从文件名）
 */
function extractModelName(fileName) {
  if (!fileName) return 'unknown';
  const parts = fileName.split('.');
  if (parts.length >= 2) {
    return parts[1];
  }
  return fileName;
}

/**
 * 更新备份项状态栏提示
 */
function updateBackupItemStatusBar(backup) {
  if (!backup) return;
  const isFullBackup = backup.dataType !== 'single';
  const typeText = isFullBackup ? '完整备份' : '单供应商备份';
  const desc = isFullBackup 
    ? `包含 ${backup.providerCount || '多个'} 个供应商的配置`
    : `${backup.provider || '未知供应商'} 的配置`;
  setGlobalStatus(`${typeText}: ${desc}，点击查看详情`, 'info');
}
