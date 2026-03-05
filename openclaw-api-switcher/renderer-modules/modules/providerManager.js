// OpenClaw API Switcher - 供应商管理模块
// 处理供应商列表渲染、选择、删除、拖拽排序等功能

// 拖拽相关状态
let dragSrcEl = null;
let dragSrcProvider = null;

// 选中的预设key
let selectedPresetKey = null;

// 添加模态框选中的模型
let addModalSelectedModels = [];

// 可用模型列表
let availableModels = [];

// 编辑模态框模型
let editModalModels = [];
let editModalSelectedModelId = null;

// 渲染供应商列表
async function renderProviderList() {
  const apiConfig = await window.electronAPI.loadApiConfig();
  const providers = apiConfig?.providers || {};
  const currentModel = apiConfig?.selectedModel || '';
  const currentProviderName = currentModel.split('/')[0];
  const container = document.getElementById('provider-list');
  if (!container) return;
  
  if (Object.keys(providers).length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:40px 20px"><div class="empty-state-icon">📭</div><div class="empty-state-title">暂无 Provider</div><div class="empty-state-desc">点击上方按钮添加</div></div>';
    return;
  }
  
  const sortedProviders = await getSortedProviders(providers);
  
  container.innerHTML = sortedProviders.map(([name, cfg], index) => {
    const isActive = currentProviderName === name;
    const presetEntry = Object.entries(PROVIDER_PRESETS).find(([key, p]) => 
      p.name === name || 
      p.name.toLowerCase() === name.toLowerCase() ||
      name.toLowerCase().startsWith(p.name.toLowerCase()) ||
      name.toLowerCase().startsWith(key.toLowerCase()) ||
      key.toLowerCase() === name.toLowerCase()
    );
    const preset = presetEntry ? presetEntry[1] : null;
    const icon = cfg.icon || preset?.icon || '⚙️';
    const color = cfg.color || preset?.color || '#666';
    const modelCount = cfg.models?.length || 0;
    // 使用预设的中文名称，如果没有预设则使用原始名称
    const displayName = preset?.name || name;
    // 截断长网址，避免遮挡按钮
    let displayUrl = cfg.baseUrl || '';
    if (displayUrl.length > 28) {
      displayUrl = displayUrl.substring(0, 25) + '...';
    }
    // 【v2.7.5】提取主要颜色（从渐变色中提取第一个颜色）并转换为 rgba
    let primaryColor = color;
    if (color.includes('gradient')) {
      const match = color.match(/#[a-f0-9]{6}/i);
      if (match) primaryColor = match[0];
    }
    // 将 hex 转换为 rgba
    const r = parseInt(primaryColor.slice(1, 3), 16);
    const g = parseInt(primaryColor.slice(3, 5), 16);
    const b = parseInt(primaryColor.slice(5, 7), 16);
    const glowColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
    const borderColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
    return '<div class="provider-card ' + (isActive ? 'active' : '') + '" data-provider="' + name + '" draggable="true" data-index="' + index + '"><div class="provider-icon" style="background:' + color + ';--icon-glow-color:' + glowColor + ';--icon-border-color:' + borderColor + '">' + icon + '</div><div class="provider-info"><div class="provider-name-row"><span class="provider-name">' + displayName + '</span><span class="drag-handle" data-status-hint="拖动调整顺序：拖拽此区域可调整供应商在列表中的顺序">⋮⋮</span></div><div class="provider-url" data-status-hint="API 基础地址：' + (cfg.baseUrl || '') + '">' + displayUrl + '</div><div class="provider-meta"><span class="provider-models-count">' + modelCount + ' models</span></div></div><div class="provider-actions"><button class="btn btn-sm btn-edit" data-provider="' + name + '" data-status-hint="编辑：修改此供应商的配置信息，包括 API Key、基础地址、模型列表等">✏️</button><button class="btn btn-sm btn-save" data-provider="' + name + '" data-status-hint="备份：将此供应商的配置保存到备份列表，方便以后恢复">💾</button><button class="btn btn-sm btn-danger" data-provider="' + name + '" data-status-hint="删除：从程序中移除此供应商配置（不会删除 OpenClaw 中的配置）">🗑️</button></div></div>';
  }).join('');
  
  initDragAndDrop(container);
  
  container.querySelectorAll('.provider-card').forEach(card => {
    card.addEventListener('click', (e) => { if (!e.target.closest('.provider-actions')) selectProvider(card.dataset.provider); });
  });
  container.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(btn.dataset.provider); }));
  container.querySelectorAll('.btn-save').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); saveSingleProviderBackup(btn.dataset.provider); }));
  container.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); deleteProvider(btn.dataset.provider); }));
}

// 获取排序后的 provider 列表
async function getSortedProviders(providers) {
  const entries = Object.entries(providers);
  const apiConfig = await window.electronAPI.loadApiConfig();
  const order = apiConfig?.providerOrder || [];

  if (order.length > 0) {
    entries.sort((a, b) => {
      const indexA = order.indexOf(a[0]);
      const indexB = order.indexOf(b[0]);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }

  return entries;
}

// 保存 provider 顺序
async function saveProviderOrder(order) {
  const config = StateManager.getConfig();
  config.providerOrder = order;
  try {
    await window.electronAPI.saveConfig(config);
    StateManager.setConfig(config);
    setGlobalStatus('供应商顺序已保存', 'success');
    console.log('[Provider Order] Saved:', order);
  } catch (e) {
    setGlobalStatus('保存供应商顺序失败', 'error');
    console.error('[Provider Order] Failed to save:', e);
  }
}

// 初始化拖拽功能
function initDragAndDrop(container) {
  const cards = container.querySelectorAll('.provider-card');
  
  cards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('dragenter', handleDragEnter);
    card.addEventListener('dragleave', handleDragLeave);
    card.addEventListener('drop', handleDrop);
  });
}

function handleDragStart(e) {
  dragSrcEl = this;
  dragSrcProvider = this.dataset.provider;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
  this.classList.add('dragging');
  setTimeout(() => {
    this.classList.add('dragging-transparent');
  }, 0);
  console.log('[Drag] Started:', dragSrcProvider);
}

function handleDragEnd(e) {
  this.classList.remove('dragging', 'dragging-transparent');
  const container = document.getElementById('provider-list');
  container.querySelectorAll('.provider-card').forEach(card => {
    card.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
  });
  dragSrcEl = null;
  dragSrcProvider = null;
  console.log('[Drag] Ended');
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const card = this;
  const rect = card.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  card.classList.remove('drag-over-top', 'drag-over-bottom');
  if (e.clientY < midY) {
    card.classList.add('drag-over-top');
  } else {
    card.classList.add('drag-over-bottom');
  }
  return false;
}

function handleDragEnter(e) {
  this.classList.add('drag-over');
}

function handleDragLeave(e) {
  this.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
}

async function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();

  if (dragSrcEl === this) return;

  const container = document.getElementById('provider-list');
  const cards = Array.from(container.querySelectorAll('.provider-card'));
  const srcIndex = cards.indexOf(dragSrcEl);
  const targetIndex = cards.indexOf(this);

  const rect = this.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const insertBefore = e.clientY < midY;

  if (insertBefore) {
    container.insertBefore(dragSrcEl, this);
  } else {
    container.insertBefore(dragSrcEl, this.nextSibling);
  }

  const newOrder = Array.from(container.querySelectorAll('.provider-card')).map(card => card.dataset.provider);
  saveProviderOrder(newOrder);
  await reorderProviders(newOrder);

  console.log('[Drag] Dropped:', dragSrcProvider, '->', this.dataset.provider, 'before:', insertBefore);
  return false;
}

// 重新排序 providers
async function reorderProviders(order) {
  const apiConfig = await window.electronAPI.loadApiConfig();
  const providers = apiConfig.providers || {};
  const newProviders = {};

  order.forEach(name => {
    if (providers[name]) {
      newProviders[name] = providers[name];
    }
  });

  Object.keys(providers).forEach(name => {
    if (!newProviders[name]) {
      newProviders[name] = providers[name];
    }
  });

  apiConfig.providers = newProviders;
  await window.electronAPI.saveApiConfig(apiConfig);
}

// 保存单个供应商配置到备份列表
async function saveSingleProviderBackup(name) {
  const apiConfig = await window.electronAPI.loadApiConfig();
  const provider = apiConfig?.providers?.[name];
  
  if (!provider) {
    setGlobalStatus('找不到供应商配置: ' + name, 'error');
    return;
  }
  
  try {
    const result = await window.electronAPI.backupSingleProvider(name, provider);
    
    if (result.success) {
      setGlobalStatus('已保存 "' + name + '" 到备份列表', 'success');
      addLog('info', '保存供应商配置到备份: ' + name, '', 'user');
      
      // 刷新备份列表显示
      if (typeof loadBackupsPaginated === 'function') {
        await loadBackupsPaginated();
      }
    } else {
      setGlobalStatus('保存失败: ' + (result.error || result.message), 'error');
    }
  } catch (error) {
    setGlobalStatus('保存失败: ' + error.message, 'error');
    console.error('[ProviderManager] 保存供应商备份失败:', error);
  }
}

// 删除供应商
async function deleteProvider(name) {
  if (!confirm('确定要删除 Provider "' + name + '" 吗？\n\n这将同时删除对应的 API 密钥。')) return;

  const apiConfig = await window.electronAPI.loadApiConfig();
  const currentModel = apiConfig?.selectedModel || '';
  const currentProviderName = currentModel.split('/')[0];

  if (apiConfig.providers[name]) {
    delete apiConfig.providers[name];
  }

  if (apiConfig.providerOrder) {
    apiConfig.providerOrder = apiConfig.providerOrder.filter(id => id !== name);
  }

  if (currentProviderName === name) {
    apiConfig.selectedModel = '';
    apiConfig.activeProvider = '';
    addLog('info', '当前使用的 Provider "' + name + '" 被删除，已清空当前模型', '', 'system');
  }

  try {
    await window.electronAPI.saveApiConfig(apiConfig);
    console.log('[Delete] Provider config removed:', name);
  } catch (e) {
    console.error('[Delete] Failed to save config:', e);
  }

  try {
    console.log('[Delete] Calling removeProviderConfig for:', name);
    const result = await window.electronAPI.removeProviderConfig(name);
    console.log('[Delete] removeProviderConfig result:', result);
  } catch (e) {
    console.error('[Delete] Failed to remove from OpenClaw:', e);
  }

  setGlobalStatus('已删除 Provider: ' + name, 'success');
  addLog('info', '删除 Provider: ' + name, '', 'user');
  await renderProviderList();
  await renderCurrentModel();

  // 【v2.7.5】刷新配置信息显示
  if (typeof updateOpenClawConfigDisplay === 'function') {
    await updateOpenClawConfigDisplay();
    console.log('[Delete] 配置信息已刷新');
  }

  // 检查是否还有供应商，如果没有则重置自动检测指示灯
  const remainingProviders = Object.keys(apiConfig.providers || {});
  if (remainingProviders.length === 0) {
    console.log('[Delete] 所有供应商已删除，重置自动检测指示灯');
    StateManager.setConnectionStatus('unconfigured');
    StateManager.setApiTestingStatus('idle');
    updateConnectionStatus('unconfigured', '未配置');
    setGlobalStatus('所有 API 供应商已删除，请添加新的供应商', 'info');
  }

  await autoCheckOpenClawConfig('delete');
}

// 选择供应商（安全切换版本 - 延迟同步到 OpenClaw）
async function selectProvider(name) {
  StateManager.setSelectedProvider(name);
  document.querySelectorAll('.provider-card').forEach(card => card.classList.toggle('active', card.dataset.provider === name));

  const apiConfig = await window.electronAPI.loadApiConfig();
  const provider = apiConfig.providers[name];
  if (!provider) {
    setGlobalStatus('找不到 Provider 配置: ' + name, 'error');
    addLog('error', '切换 Provider 失败：找不到配置 - ' + name, '', 'user');
    return;
  }
  
  if (provider.models && provider.models.length > 0) {
    const firstModel = provider.models[0];
    const fullModelId = name + '/' + firstModel.id;

    StateManager.setConnectionStatus('configured');
    
    // 重置左侧手动测试状态为"未测试"
    updateManualConnectionStatus('untested', '未测试');

    try {
      // ===== 安全切换：只保存到本地配置，不同步到 OpenClaw =====
      await window.electronAPI.setActiveProvider(name);
      apiConfig.selectedModel = fullModelId;
      await window.electronAPI.saveApiConfig(apiConfig);
      console.log('[Provider] 配置已保存到本地:', fullModelId);

      // 设置待应用状态
      StateManager.setPendingProvider(name);
      
      // 更新 UI 显示待应用状态（但如果是停止状态，按钮会被隐藏）
      updateApplyButtonState('pending', name);
      
      // 全局状态栏提示（根据停止状态调整提示）
      if (typeof StopManager !== 'undefined' && StopManager.isStopped && StopManager.isStopped()) {
        setGlobalStatus('已选择 ' + name + '，但 OpenClaw 处于停止状态，请先恢复', 'warning');
        addLog('info', '选择 Provider: ' + name + '/' + firstModel.id + '（停止状态，无法应用）', '', 'user');
      } else {
        setGlobalStatus('已选择 ' + name + '，点击【应用配置】同步到 OpenClaw', 'warning');
        addLog('info', '选择 Provider: ' + name + '/' + firstModel.id + '（待应用）', '', 'user');
      }
      
      // 渲染当前模型显示（本地预览）
      renderCurrentModel();
      
      // 自动触发连接检测（只更新右侧状态）
      setTimeout(async () => {
        console.log('[Provider] 自动触发连接检测...');
        if (typeof autoTestApiConnection === 'function') {
          try {
            await autoTestApiConnection();
          } catch (error) {
            console.error('[Provider] 自动检测执行失败:', error);
          }
        } else {
          console.error('[Provider] autoTestApiConnection 函数未定义');
        }
      }, 800);
    } catch (e) {
      console.error('选择 Provider 失败:', e);
      setGlobalStatus('选择失败: ' + e.message, 'error');
      addLog('error', '选择 Provider 失败: ' + e.message, '', 'user');
    }
  } else {
    renderCurrentModel();
    setGlobalStatus('已选择 Provider: ' + name + '（无可用模型）', 'warning');
  }
}

// 更新应用配置按钮状态
function updateApplyButtonState(state, providerName) {
  const applyBtn = document.getElementById('btn-apply-config');
  if (!applyBtn) {
    console.log('[ProviderManager] 应用配置按钮不存在，跳过更新');
    return;
  }
  
  // 检查是否处于停止状态（由 StopManager 控制）
  // 如果处于停止状态，不显示应用配置按钮
  const isStopped = typeof StopManager !== 'undefined' && StopManager.isStopped && StopManager.isStopped();
  console.log('[ProviderManager] updateApplyButtonState 被调用:', { state, providerName, isStopped, stopManagerExists: typeof StopManager !== 'undefined' });
  
  if (isStopped) {
    console.log('[ProviderManager] 处于停止状态，强制隐藏应用配置按钮');
    applyBtn.style.display = 'none';
    applyBtn.disabled = true;
    return;
  }
  
  // 移除所有状态类
  applyBtn.classList.remove('applying', 'activated', 'testing');
  
  switch (state) {
    case 'pending':
      applyBtn.style.display = 'inline-flex';
      applyBtn.textContent = '应用配置';
      applyBtn.removeAttribute('title');
      applyBtn.disabled = false;
      break;
    case 'testing':
      // API检测中 - 灰色但可点击
      applyBtn.style.display = 'inline-flex';
      applyBtn.classList.add('testing');
      applyBtn.textContent = '检测中...';
      applyBtn.removeAttribute('title');
      applyBtn.disabled = false;
      break;
    case 'applying':
      // 应用配置中 - 显示状态但可点击（允许重复点击，由 StateManager 防止重复执行）
      applyBtn.style.display = 'inline-flex';
      applyBtn.classList.add('applying');
      applyBtn.textContent = '应用中...';
      applyBtn.removeAttribute('title');
      applyBtn.disabled = false;
      break;
    case 'activated':
      applyBtn.style.display = 'inline-flex';
      applyBtn.classList.add('activated');
      applyBtn.textContent = '已同步';
      applyBtn.removeAttribute('title');
      applyBtn.disabled = false;
      break;
    default:
      // 默认状态：显示灰色不可点击的按钮
      applyBtn.style.display = 'inline-flex';
      applyBtn.textContent = '应用配置';
      applyBtn.removeAttribute('title');
      applyBtn.disabled = true;
  }
}

// API异常警告对话框控制
let apiWarningResolve = null;

function showApiWarningModal(providerName, apiStatus) {
  const modal = document.getElementById('api-warning-modal');
  const overlay = document.getElementById('api-warning-overlay');
  const providerNameEl = document.getElementById('warning-provider-name');
  const apiStatusEl = document.getElementById('warning-api-status');
  
  // 更新内容
  providerNameEl.textContent = providerName || '-';
  apiStatusEl.textContent = apiStatus || 'API 异常';
  
  // 显示对话框
  modal.style.display = 'block';
  overlay.style.display = 'block';
  
  // 添加动画类
  setTimeout(() => {
    modal.classList.add('show');
    overlay.classList.add('show');
  }, 10);
}

function hideApiWarningModal() {
  const modal = document.getElementById('api-warning-modal');
  const overlay = document.getElementById('api-warning-overlay');
  
  modal.classList.remove('show');
  overlay.classList.remove('show');
  
  setTimeout(() => {
    modal.style.display = 'none';
    overlay.style.display = 'none';
  }, 300);
}

// 初始化API警告对话框事件
function initApiWarningModal() {
  const closeBtn = document.getElementById('btn-close-api-warning');
  const cancelBtn = document.getElementById('btn-cancel-apply');
  const forceBtn = document.getElementById('btn-force-apply');
  const overlay = document.getElementById('api-warning-overlay');
  
  // 关闭按钮
  closeBtn?.addEventListener('click', () => {
    hideApiWarningModal();
    if (apiWarningResolve) {
      apiWarningResolve(false);
      apiWarningResolve = null;
    }
  });
  
  // 取消按钮
  cancelBtn?.addEventListener('click', () => {
    hideApiWarningModal();
    if (apiWarningResolve) {
      apiWarningResolve(false);
      apiWarningResolve = null;
    }
  });
  
  // 仍要应用按钮
  forceBtn?.addEventListener('click', () => {
    hideApiWarningModal();
    if (apiWarningResolve) {
      apiWarningResolve(true);
      apiWarningResolve = null;
    }
  });
  
  // 点击遮罩关闭
  overlay?.addEventListener('click', () => {
    hideApiWarningModal();
    if (apiWarningResolve) {
      apiWarningResolve(false);
      apiWarningResolve = null;
    }
  });
  
  // ESC键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('api-warning-modal').style.display === 'block') {
      hideApiWarningModal();
      if (apiWarningResolve) {
        apiWarningResolve(false);
        apiWarningResolve = null;
      }
    }
  });
}

// 检查是否需要显示API警告
async function checkApiWarning(providerName) {
  const apiConfig = await window.electronAPI.loadApiConfig();
  const provider = apiConfig.providers?.[providerName];
  
  if (!provider) {
    console.error(`[checkApiWarning] 找不到 provider: ${providerName}`);
    setGlobalStatus(`找不到供应商配置: ${providerName}`, 'error');
    return false;
  }
  
  // 检查API连接状态
  const connectionStatus = document.getElementById('connection-status-text')?.textContent || '';
  const isApiAvailable = connectionStatus.includes('API 可用') || connectionStatus.includes('可用');
  
  // 如果API不可用，显示警告
  if (!isApiAvailable) {
    return new Promise((resolve) => {
      apiWarningResolve = resolve;
      showApiWarningModal(providerName, connectionStatus || 'API 异常');
    });
  }
  
  return true;
}

// 应用配置到 OpenClaw（安全切换核心函数）
async function applyConfiguration() {
  const pendingProvider = StateManager.getPendingProvider();
  
  if (!pendingProvider) {
    setGlobalStatus('没有待应用的配置', 'warning');
    return;
  }
  
  if (StateManager.getIsApplying()) {
    setGlobalStatus('正在应用配置中，请稍候...', 'warning');
    return;
  }
  
  // 检查API状态，如果不正常显示警告
  const shouldProceed = await checkApiWarning(pendingProvider);
  if (!shouldProceed) {
    // checkApiWarning 已经设置了错误状态，这里不需要重复设置
    addLog('info', '应用配置未继续: ' + pendingProvider, '', 'user');
    return;
  }
  
  // 获取当前已应用的供应商（用于回滚）
  const previousProvider = StateManager.getAppliedProvider();
  
  StateManager.setIsApplying(true);
  updateApplyButtonState('applying', pendingProvider);
  setGlobalStatus('正在应用配置到 OpenClaw...', 'info');
  addLog('info', '开始应用配置: ' + pendingProvider, '', 'user');
  
  try {
    const apiConfig = await window.electronAPI.loadApiConfig();
    const provider = apiConfig.providers[pendingProvider];
    
    if (!provider) {
      throw new Error('找不到 Provider 配置: ' + pendingProvider);
    }
    
    const providerConfig = {
      id: pendingProvider,
      name: provider.name || pendingProvider,
      icon: provider.icon,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey || '',
      apiType: 'openai',
      models: provider.models
    };
    
    // 同步到 OpenClaw（强制同步，确保用户手动点击时一定生效）
    const result = await window.electronAPI.syncToOpenClaw(pendingProvider, providerConfig, true);

    if (result.success) {
      // 【v2.7.5】设置活跃供应商到程序配置
      await window.electronAPI.setActiveProvider(pendingProvider);
      console.log('[Apply] 已设置活跃供应商:', pendingProvider);

      // 同步成功
      StateManager.setAppliedProvider(pendingProvider);
      StateManager.clearPendingProvider();
      updateApplyButtonState('activated', pendingProvider);
      setGlobalStatus('配置已同步，Gateway 运行正常', 'success');
      addLog('success', '配置已应用到 OpenClaw: ' + pendingProvider, '', 'user');
      
      // 按钮保持 [已同步] 状态，不隐藏（根据架构设计）

      // 【v2.7.5】刷新配置信息显示
      if (typeof updateOpenClawConfigDisplay === 'function') {
        await updateOpenClawConfigDisplay();
        console.log('[Apply] 配置信息已刷新');
      }

      // 触发自动检测
      setTimeout(async () => {
        if (typeof autoTestApiConnection === 'function') {
          try {
            await autoTestApiConnection();
          } catch (error) {
            console.error('[Apply] 自动检测失败:', error);
          }
        }
      }, 1000);
      
    } else {
      throw new Error(result.message || '同步失败');
    }
    
  } catch (error) {
    console.error('[Apply] 应用配置失败:', error);
    setGlobalStatus('应用配置失败: ' + error.message, 'error');
    addLog('error', '应用配置失败: ' + error.message, '', 'user');
    
    // 恢复到 pending 状态，允许用户重试
    updateApplyButtonState('pending', pendingProvider);
    
    // TODO: 自动回滚机制（可选）
    // if (previousProvider) {
    //   await rollbackConfiguration(previousProvider);
    // }
    
  } finally {
    StateManager.setIsApplying(false);
  }
}

// 渲染当前模型显示
async function renderCurrentModel() {
  const apiConfig = await window.electronAPI.loadApiConfig();
  const currentModel = apiConfig?.selectedModel || '';
  const keyDisplay = document.getElementById('api-key-display');
  
  if (!currentModel) {
    const iconEl = document.getElementById('current-icon');
    iconEl.textContent = '🌐';
    iconEl.style.background = ''; // 让CSS控制背景
    iconEl.classList.add('unconfigured'); // 添加未设置状态class
    document.getElementById('current-model-name').textContent = '未设置';
    document.getElementById('current-provider').textContent = '请选择一个 Provider 和 Model';
    document.getElementById('current-status').textContent = '未配置';
    if (keyDisplay) keyDisplay.style.display = 'none';
    // 注意：renderCurrentModel 只更新右上角状态，不更新右侧状态
    // 右侧状态由 autoTestApiConnection 控制
    StateManager.setConnectionStatus('unconfigured');
    return;
  }
  
  let [providerName, modelId] = currentModel.split('/');
  const originalProviderName = providerName;
  providerName = providerName.toLowerCase();
  let provider = apiConfig.providers[providerName];
  if (!provider) {
    const actualKey = Object.keys(apiConfig.providers).find(k => k.toLowerCase() === providerName);
    if (actualKey) provider = apiConfig.providers[actualKey];
  }
  
  const presetEntry = Object.entries(PROVIDER_PRESETS).find(([key, p]) => 
    key.toLowerCase() === providerName || 
    p.name.toLowerCase() === providerName
  );
  const preset = presetEntry ? presetEntry[1] : null;
  const icon = provider?.icon || preset?.icon || '⚙️';
  const color = provider?.color || preset?.color || '#666';
  
  const iconEl = document.getElementById('current-icon');
  iconEl.textContent = icon;
  // 【v2.7.5】提取主要颜色并设置 CSS 变量用于呼吸发光效果
  let primaryColor = color;
  if (color.includes('gradient')) {
    const match = color.match(/#[a-f0-9]{6}/i);
    if (match) primaryColor = match[0];
  }
  iconEl.style.background = color;
  // 将 hex 颜色转换为 rgba 格式，25% 透明度
  const r = parseInt(primaryColor.slice(1, 3), 16);
  const g = parseInt(primaryColor.slice(3, 5), 16);
  const b = parseInt(primaryColor.slice(5, 7), 16);
  iconEl.style.setProperty('--icon-glow-color', `rgba(${r}, ${g}, ${b}, 0.4)`);
  iconEl.classList.remove('unconfigured'); // 移除未设置状态class
  document.getElementById('current-model-name').textContent = modelId || 'Unknown';
  document.getElementById('current-provider').textContent = providerName + ' / ' + (modelId || 'default');
  
  const currentConnectionStatus = StateManager.getConnectionStatus();
  
  // ============================================================================
  // 状态指示器说明（最终版）：
  // ============================================================================
  // 
  // 【左上角指示器】- 手动检测状态（id="connection-status" + id="connection-text"）
  // 位置：API Key 上方（左侧），显示"未测试"/"检测中..."/"连接正常"/"连接失败"
  // 控制者：手动测试按钮（testConnection）
  // 作用：反映用户手动点击"测试连接"按钮的结果
  //
  // 【右上角指示器】- 同步状态（id="current-status"）
  // 位置：页面右上角，显示"未激活"/"已激活"
  // 控制者：安全切换功能（pendingProvider/appliedProvider）
  // 作用：反映配置是否已同步到 OpenClaw
  //
  // 【右侧指示器】- 自动检测状态（id="connection-status-dot" + id="connection-status-text"）
  // 位置：actions 区域（右侧），显示"未连接"/"检测中..."/"已连接 (xxxms)"
  // 控制者：自动检测功能（autoTestApiConnection）
  // 作用：反映 API 连接状态
  //
  // 注意：renderCurrentModel 只更新右上角状态显示，不更新应用配置按钮
  // 应用配置按钮由 updateApplyButtonState 独立控制
  // ============================================================================
  
  const topRightStatusEl = document.getElementById('current-status');
  
  // 更新【右上角状态显示】- 显示同步状态（是否已同步到 OpenClaw）
  const pendingProvider = StateManager.getPendingProvider();
  const appliedProvider = StateManager.getAppliedProvider();
  const selectedProvider = StateManager.getSelectedProvider();
  
  // 同时更新应用配置按钮状态（修复检测完成后按钮不恢复的问题）
  const apiTestingStatus = StateManager.getApiTestingStatus();
  
  if (pendingProvider) {
    // 有待应用的供应商 → 显示"未激活"（黄色）
    topRightStatusEl.textContent = '未激活';
    topRightStatusEl.style.background = '#fbbf24'; // 黄色
    topRightStatusEl.style.color = '#000';
    // 如果检测完成，恢复按钮为可点击状态
    if (apiTestingStatus !== 'testing') {
      updateApplyButtonState('pending', pendingProvider);
    }
  } else if (appliedProvider && appliedProvider === selectedProvider) {
    // 已同步且当前选中 → 显示"已激活"（绿色）
    topRightStatusEl.textContent = '已激活';
    topRightStatusEl.style.background = '#84cc16'; // 青柠绿
    topRightStatusEl.style.color = '#000';
    // 同步完成，更新按钮为已同步状态
    updateApplyButtonState('activated', appliedProvider);
  } else {
    // 默认状态 → 显示"未激活"（灰色）
    topRightStatusEl.textContent = '未激活';
    topRightStatusEl.style.background = 'var(--text-secondary)'; // 灰色
    topRightStatusEl.style.color = '#fff';
    // 无待应用供应商，显示默认状态
    updateApplyButtonState('default');
  }
  
  if (keyDisplay && provider) {
    keyDisplay.style.display = 'block';
    const apiKey = provider.apiKey;
    if (apiKey && apiKey !== 'e' && apiKey.length > 5) {
      document.getElementById('current-api-key').textContent = maskKey(apiKey);
    } else {
      document.getElementById('current-api-key').textContent = '已设置';
    }
    StateManager.setApiKeyVisible(false);
  }
  
  // 注意：renderCurrentModel 只更新【左侧状态指示器】（自动检测状态）
  // 【右侧状态指示器】（手动检测状态）完全由 testConnection() 函数控制
  // 两个指示器保持独立，互不影响
}

// ============================================================================
// 手动测试 API 连接（用户点击"测试连接"按钮时调用）
// ============================================================================
// 作用：更新【左上角指示器】和【右上角状态】
// 左上角显示：未测试 / 检测中... / 连接正常 / 连接失败
// 右上角显示：已配置 / 测试中... / 已激活
// 位置：左上角在 API Key 上方，右上角在页面右上角
// 注意：不更新右侧actions区域（由自动检测控制）
// ============================================================================
async function testConnection() {
  console.log('[testConnection] 函数被调用');
  addLog('info', '手动测试连接开始', '', 'user');
  const apiConfig = await window.electronAPI.loadApiConfig();
  const currentModel = apiConfig?.selectedModel || '';
  if (!currentModel) { 
    setGlobalStatus('请先选择一个模型', 'warning'); 
    addLog('warning', '连接测试：请先选择一个模型', '', 'user'); 
    return; 
  }
  const [providerName] = currentModel.split('/');
  const provider = apiConfig.providers?.[providerName];
  if (!provider) { 
    setGlobalStatus('Provider 配置不存在', 'error'); 
    addLog('error', '连接测试：Provider 配置不存在 - ' + providerName, '', 'user'); 
    return; 
  }
  
  // 更新API Key上方指示器为"检测中..."
  updateManualConnectionStatus('testing', '检测中...');
  // 同时更新右上角状态为"测试中..."
  StateManager.setConnectionStatus('manual_testing');
  renderCurrentModel();
  
  setGlobalStatus('正在测试连接 [' + providerName + ']...', 'info');
  addLog('info', '手动测试连接: ' + providerName, '', 'user');
  
  try {
    // 使用 IPC 调用主进程的 test-api-connection，以便记录请求追踪
    const result = await window.electronAPI.testApiConnection(providerName, {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey
    });
    
    if (result.success) {
      // 手动测试成功，更新API Key上方指示器为"连接正常"
      updateManualConnectionStatus('connected', '连接正常 (' + result.latency + 'ms)');
      // 同时更新右上角状态为"已激活"
      StateManager.setConnectionStatus('auto_connected');
      renderCurrentModel();
      setGlobalStatus('手动测试成功 [' + providerName + '] (' + result.latency + 'ms)', 'success');
      addLog('success', '手动测试成功: ' + providerName + ' (' + result.latency + 'ms)', '', 'user');
    } else {
      // 手动测试失败，更新API Key上方指示器为"连接失败"
      updateManualConnectionStatus('disconnected', '连接失败');
      // 同时更新右上角状态为"已配置"（失败状态）
      StateManager.setConnectionStatus('error');
      renderCurrentModel();
      setGlobalStatus('手动测试失败 [' + providerName + ']: ' + result.message, 'error');
      addLog('error', '手动测试失败: ' + providerName + ' - ' + result.message, '', 'user');
    }
  } catch (error) {
    // 手动测试错误，更新API Key上方指示器为"连接错误"
    updateManualConnectionStatus('disconnected', '连接错误');
    // 同时更新右上角状态为"已配置"（错误状态）
    StateManager.setConnectionStatus('error');
    renderCurrentModel();
    setGlobalStatus('手动测试错误 [' + providerName + ']: ' + error.message, 'error');
    addLog('error', '手动测试错误: ' + providerName + ' - ' + error.message, '', 'user');
  }
}

// ============================================================================
// 自动测试 API 连接（程序启动或切换供应商时调用）
// ============================================================================
// 作用：更新【右上角状态】和【右侧actions区域】
// 右上角显示：已配置 / 检测中... / 已激活
// 右侧actions显示：未连接 / 检测中... / 已连接 (xxxms)
// 注意：不更新左侧指示器（由手动检测控制）
// ============================================================================
async function autoTestApiConnection() {
  console.log('[ProviderManager] 自动检测 API 连接...');

  const apiConfig = await window.electronAPI.loadApiConfig();
  const currentModel = apiConfig?.selectedModel || '';

  // 检查是否有任何供应商配置
  const hasProviders = apiConfig.providers && Object.keys(apiConfig.providers).length > 0;

  // 只有完全没有供应商时才同步空配置
  if (!hasProviders) {
    console.log('[ProviderManager] 无供应商配置，重置状态');
    // 重置自动检测状态为"未配置"
    StateManager.setConnectionStatus('unconfigured');
    StateManager.setApiTestingStatus('idle');
    updateConnectionStatus('unconfigured', '未配置');
    // 清除 OpenClaw 配置（同步空配置）
    try {
      await window.electronAPI.syncToOpenClaw(null);
      console.log('[ProviderManager] 已同步空配置到 OpenClaw');
    } catch (e) {
      console.error('[ProviderManager] 同步空配置失败:', e);
    }
    return;
  }

  // 有供应商但未选择模型，只重置状态，不同步空配置
  if (!currentModel) {
    console.log('[ProviderManager] 有供应商但未选择模型，等待用户选择');
    StateManager.setConnectionStatus('unconfigured');
    StateManager.setApiTestingStatus('idle');
    updateConnectionStatus('unconfigured', '未配置');
    return;
  }

  const [providerName] = currentModel.split('/');
  const provider = apiConfig.providers?.[providerName];

  if (!provider) {
    console.log('[ProviderManager] Provider 配置不存在，重置状态');
    // 重置自动检测状态
    StateManager.setConnectionStatus('unconfigured');
    StateManager.setApiTestingStatus('idle');
    updateConnectionStatus('unconfigured', '未配置');
    return;
  }
  
  // 检查 API Key 是否有效（只要有值且不是占位符就尝试检测）
    const apiKey = provider.apiKey;
    if (!apiKey || apiKey === 'e') {
      console.log('[ProviderManager] API Key 为空或占位符，跳过自动检测');
      // 自动检测失败，更新状态组
      StateManager.setConnectionStatus('error');
      renderCurrentModel(); // 更新右上角为"已配置"
      updateConnectionStatus('disconnected', 'API 异常'); // 更新右侧actions为"API 异常"
      setGlobalStatus('API 异常 [' + providerName + '] - 请配置 API Key', 'warning');
      addLog('warning', 'API 异常: ' + providerName + ' - 未配置 API Key | 建议：点击编辑按钮配置 API Key', '', 'system');
      return;
    }

  // 更新自动检测状态组为"检测中..."
  StateManager.setConnectionStatus('testing');
  StateManager.setApiTestingStatus('testing'); // 设置API检测状态为检测中
  updateApplyButtonState('testing'); // 更新按钮为检测中状态（灰色不可点击）
  renderCurrentModel(); // 更新右上角为"检测中..."
  updateConnectionStatus('testing', '检测中...'); // 更新右侧actions为"检测中..."
  setGlobalStatus('正在自动检测连接 [' + providerName + ']...', 'info');

  try {
    // 使用 IPC 调用主进程的 test-api-connection
    const result = await window.electronAPI.testApiConnection(providerName, {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey
    });

    if (result.success) {
      // 自动检测成功，更新状态组为"已激活"
      StateManager.setConnectionStatus('auto_connected');
      StateManager.setApiTestingStatus('success'); // 设置API检测状态为成功
      const pendingProvider = StateManager.getPendingProvider();
      if (pendingProvider) {
        updateApplyButtonState('pending', pendingProvider); // 恢复按钮为可点击状态
      }
      renderCurrentModel(); // 更新右上角为"已激活"
      updateConnectionStatus('connected', 'API 可用 (' + result.latency + 'ms)'); // 更新右侧actions为"API 可用"
      setGlobalStatus('自动检测成功 [' + providerName + '] (' + result.latency + 'ms)', 'success');
      addLog('info', '自动检测成功: ' + providerName + ' (' + result.latency + 'ms)', '', 'system');
    } else {
      // 自动检测失败，更新状态组
      StateManager.setConnectionStatus('error');
      StateManager.setApiTestingStatus('error'); // 设置API检测状态为失败
      const pendingProvider = StateManager.getPendingProvider();
      if (pendingProvider) {
        updateApplyButtonState('pending', pendingProvider); // 恢复按钮为可点击状态（但会触发警告）
      }
      renderCurrentModel(); // 更新右上角为"已配置"
      updateConnectionStatus('disconnected', 'API 异常'); // 更新右侧actions为"API 异常"
      setGlobalStatus('API 异常 [' + providerName + '] - 请检查 API Key 或网络连接', 'error');
      addLog('error', 'API 异常: ' + providerName + ' - ' + result.message + ' | 建议：1.检查 API Key 是否正确 2.检查网络连接 3.确认 API 服务状态', '', 'system');
    }
  } catch (error) {
    // 自动检测错误，更新状态组
    StateManager.setConnectionStatus('error');
    StateManager.setApiTestingStatus('error'); // 设置API检测状态为错误
    const pendingProvider = StateManager.getPendingProvider();
    if (pendingProvider) {
      updateApplyButtonState('pending', pendingProvider); // 恢复按钮为可点击状态
    }
    renderCurrentModel(); // 更新右上角为"已配置"
    updateConnectionStatus('disconnected', 'API 异常'); // 更新右侧actions为"API 异常"
    setGlobalStatus('API 异常 [' + providerName + '] - 请检查 API Key 或网络连接', 'error');
    addLog('error', 'API 异常: ' + providerName + ' - ' + error.message + ' | 建议：1.检查 API Key 是否正确 2.检查网络连接 3.确认 API 服务状态', '', 'system');
  }
}

// 渲染预设列表
function renderPresets() {
  const container = document.getElementById('preset-grid');
  if (!container) return;
  const categories = { china: { name: '🇨🇳 中国API', presets: [] }, foreign: { name: '🌍 国外API', presets: [] }, local: { name: '💻 本地部署', presets: [] } };
  Object.entries(PROVIDER_PRESETS).forEach(([key, preset]) => {
    const category = preset.category || 'foreign';
    if (categories[category]) categories[category].presets.push({ key, ...preset });
  });
  container.innerHTML = Object.entries(categories).map(([catKey, cat]) => {
    if (cat.presets.length === 0) return '';
    return '<div class="preset-category"><div class="preset-category-title">' + cat.name + '</div><div class="preset-category-grid">' + cat.presets.map(preset => '<button class="preset-btn ' + (selectedPresetKey === preset.key ? 'selected' : '') + '" data-preset="' + preset.key + '"><div class="preset-icon" style="background:' + preset.color + '">' + preset.icon + '</div><div class="preset-info"><div class="preset-name">' + preset.name + '</div><div class="preset-desc">' + preset.description + '</div></div></button>').join('') + '</div></div>';
  }).join('');
  container.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedPresetKey = btn.dataset.preset;
      addPresetProvider(btn.dataset.preset);
    });
  });
}

// 渲染图标选择器
function renderIconSelector() {
  const container = document.getElementById('icon-selector');
  if (!container) return;
  container.innerHTML = ICON_OPTIONS.map(icon => '<button class="icon-option" data-icon="' + icon + '">' + icon + '</button>').join('');
  container.querySelectorAll('.icon-option').forEach(btn => btn.addEventListener('click', () => { 
    container.querySelectorAll('.icon-option').forEach(b => b.classList.remove('selected')); 
    btn.classList.add('selected'); 
    container.dataset.selected = btn.dataset.icon; 
  }));
}

// 添加预设供应商
function addPresetProvider(key) {
  const preset = PROVIDER_PRESETS[key];
  if (!preset) return;
  const nameInput = document.getElementById('custom-name');
  const urlInput = document.getElementById('custom-url');
  const iconSelector = document.getElementById('icon-selector');
  if (nameInput) nameInput.value = preset.name;
  if (urlInput) urlInput.value = preset.baseUrl;
  if (iconSelector) {
    iconSelector.querySelectorAll('.icon-option').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.icon === preset.icon);
    });
    iconSelector.dataset.selected = preset.icon;
  }
  addModalSelectedModels = [];
  renderAddModalModelGrid(preset.name);
  setGlobalStatus('已选择预设: ' + preset.name + '，请配置 API Key', 'info');
}

// 渲染添加模态框模型网格
function renderAddModalModelGrid(providerName) {
  const container = document.getElementById('add-model-grid');
  if (!container) return;
  const preset = Object.values(PROVIDER_PRESETS).find(p => p.name.toLowerCase() === providerName.toLowerCase());
  availableModels = [];
  if (preset && preset.models) availableModels = [...preset.models];
  addModalSelectedModels.forEach(customModel => {
    if (!availableModels.some(m => m.id.toLowerCase() === customModel.id.toLowerCase())) availableModels.push(customModel);
  });
  if (availableModels.length === 0) {
    container.innerHTML = '<div class="model-select-hint">该 Provider 暂无预设模型，请手动添加</div>';
    return;
  }
  const color = preset?.color || '#666';
  const icon = preset?.icon || '⚙️';
  container.innerHTML = availableModels.map((model) => {
    const isSelected = addModalSelectedModels.some(m => m.id.toLowerCase() === model.id.toLowerCase());
    return '<div class="model-select-item ' + (isSelected ? 'selected' : '') + '" data-model-id="' + model.id + '" onclick="toggleAddModalModel(\'' + model.id + '\', \'' + model.name + '\', ' + (model.contextWindow || 128000) + ')"><div class="model-icon">' + icon + '</div><div class="model-name">' + model.name + '</div><div class="model-context">' + formatNumber(model.contextWindow || 128000) + ' ctx</div>' + (model.custom ? '<span style="font-size:10px;color:var(--accent-purple)">自定义</span>' : '') + '</div>';
  }).join('');
}

// 切换添加模态框模型选择
function toggleAddModalModel(modelId, modelName, contextWindow) {
  const existingIndex = addModalSelectedModels.findIndex(m => m.id.toLowerCase() === modelId.toLowerCase());
  if (existingIndex >= 0) addModalSelectedModels.splice(existingIndex, 1);
  else addModalSelectedModels.push({ id: modelId, name: modelName, contextWindow });
  renderAddModalModelGrid(document.getElementById('custom-name').value);
}

// 添加自定义模型到添加模态框
function addCustomModelToAddModal() {
  const idInput = document.getElementById('custom-model-id');
  const nameInput = document.getElementById('custom-model-name');
  const id = idInput?.value.trim();
  const name = nameInput?.value.trim() || id;
  if (!id) { 
    setGlobalStatus('请输入模型ID', 'error'); 
    addLog('error', '添加模型失败：请输入模型ID', '', 'user'); 
    return; 
  }
  if (addModalSelectedModels.some(m => m.id.toLowerCase() === id.toLowerCase())) { 
    setGlobalStatus('该模型已存在', 'error'); 
    addLog('error', '添加模型失败：模型已存在 - ' + id, '', 'user'); 
    return; 
  }
  addModalSelectedModels.push({ id, name, contextWindow: 128000, custom: true });
  renderAddModalModelGrid(document.getElementById('custom-name').value);
  idInput.value = '';
  nameInput.value = '';
  setGlobalStatus('已添加自定义模型: ' + name, 'success');
}

// 添加自定义供应商
async function addCustomProvider() {
  const name = document.getElementById('custom-name').value.trim();
  const url = document.getElementById('custom-url').value.trim();
  let key = document.getElementById('custom-key').value.trim();
  if (!name || !url) { 
    setGlobalStatus('名称和 URL 不能为空', 'error'); 
    addLog('error', '添加 Provider 失败：名称和 URL 不能为空', '', 'user'); 
    return; 
  }

  const apiConfig = await window.electronAPI.loadApiConfig();
  if (!apiConfig.providers) apiConfig.providers = {};
  if (apiConfig.providers[name]) { 
    setGlobalStatus('Provider 名称已存在', 'error'); 
    addLog('error', '添加 Provider 失败：名称已存在 - ' + name, '', 'user'); 
    return; 
  }
  const lowerName = name.toLowerCase();
  for (const existingName of Object.keys(apiConfig.providers)) {
    if (existingName.toLowerCase() === lowerName) {
      setGlobalStatus('Provider "' + existingName + '" 已存在（不区分大小写）', 'error');
      addLog('error', '添加 Provider 失败：名称已存在（不区分大小写）- ' + existingName, '', 'user');
      return;
    }
  }
  const preset = Object.values(PROVIDER_PRESETS).find(p => p.name.toLowerCase() === name.toLowerCase());
  const models = addModalSelectedModels.length > 0 ? addModalSelectedModels : (preset?.models || []);
  if (!key || key === '') key = 'e';
  apiConfig.providers[name] = { baseUrl: url, apiKey: key, api: 'openai-completions', models };

  if (await window.electronAPI.saveApiConfig(apiConfig)) {
    setGlobalStatus('已添加 Provider: ' + name, 'success');
    addLog('info', '添加自定义 Provider: ' + name, '', 'user');
    closeModal();
    const customName = document.getElementById('custom-name');
    const customUrl = document.getElementById('custom-url');
    const customKey = document.getElementById('custom-key');
    if (customName) customName.value = '';
    if (customUrl) customUrl.value = '';
    if (customKey) customKey.value = '';
    addModalSelectedModels = [];

    // 【v2.7.5】刷新配置信息显示
    if (typeof updateOpenClawConfigDisplay === 'function') {
      await updateOpenClawConfigDisplay();
      console.log('[Add] 配置信息已刷新');
    }
  }
}

// 打开编辑模态框
function openEditModal(name) {
  openNewProviderModalForEdit(name);
}

// 渲染编辑模态框模型网格
function renderEditModalModelGrid() {
  const container = document.getElementById('edit-model-grid');
  if (!container) return;
  if (editModalModels.length === 0) {
    container.innerHTML = '<div class="model-select-hint">暂无模型，请添加</div>';
    return;
  }
  container.innerHTML = editModalModels.map((model, index) => {
    const isSelected = editModalSelectedModelId === model.id;
    return '<div class="model-select-item ' + (isSelected ? 'selected' : '') + '" onclick="selectEditModalModel(\'' + model.id + '\')"><div class="model-name">' + model.name + '</div><div class="model-context">' + formatNumber(model.contextWindow || 128000) + ' ctx</div><button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); removeEditModalModel(' + index + ')" style="margin-top:4px;font-size:10px;">删除</button></div>';
  }).join('');
}

// 选择编辑模态框模型
async function selectEditModalModel(modelId) {
  editModalSelectedModelId = modelId;
  renderEditModalModelGrid();
  const editingProvider = StateManager.getEditingProvider();
  if (editingProvider) {
    const fullModelId = editingProvider + '/' + modelId;
    const apiConfig = await window.electronAPI.loadApiConfig();
    apiConfig.selectedModel = fullModelId;

    if (await window.electronAPI.saveApiConfig(apiConfig)) {
      await renderCurrentModel();
    }
  }
}

// 删除编辑模态框中的模型
function removeEditModalModel(index) {
  editModalModels.splice(index, 1);
  renderEditModalModelGrid();
}

// 添加自定义模型到编辑模态框
function addCustomModelToEditModal() {
  const idInput = document.getElementById('edit-custom-model-id');
  const nameInput = document.getElementById('edit-custom-model-name');
  const contextInput = document.getElementById('edit-custom-model-context');
  const id = idInput?.value.trim();
  const name = nameInput?.value.trim() || id;
  const contextWindow = parseInt(contextInput?.value) || 128000;
  if (!id) { setGlobalStatus('请输入模型ID', 'error'); addLog('error', '编辑模型失败：请输入模型ID', '', 'user'); return; }
  if (editModalModels.some(m => m.id.toLowerCase() === id.toLowerCase())) { setGlobalStatus('该模型已存在', 'error'); addLog('error', '编辑模型失败：模型已存在 - ' + id, '', 'user'); return; }
  editModalModels.push({ id, name, contextWindow, custom: true });
  renderEditModalModelGrid();
  idInput.value = '';
  nameInput.value = '';
  contextInput.value = '';
  setGlobalStatus('已添加模型: ' + name, 'success');
}

// 保存编辑后的 Provider
async function saveEditProvider() {
  if (!editingProvider) return;
  const newName = document.getElementById('edit-name').value.trim();
  const url = document.getElementById('edit-url').value.trim();
  let key = document.getElementById('edit-key').value.trim();
  if (!newName || !url) { setGlobalStatus('名称和 URL 不能为空', 'error'); addLog('error', '更新 Provider 失败：名称和 URL 不能为空', '', 'user'); return; }
  if (!key || key === '') key = 'e';

  // 从 api-config.json 获取当前配置
  const apiConfig = await window.electronAPI.loadApiConfig();
  if (!apiConfig.providers) apiConfig.providers = {};

  if (newName !== editingProvider) {
    const lowerNewName = newName.toLowerCase();
    for (const existingName of Object.keys(apiConfig.providers)) {
      if (existingName.toLowerCase() === lowerNewName && existingName !== editingProvider) {
        setGlobalStatus('Provider "' + existingName + '" 已存在（不区分大小写）', 'error');
        addLog('error', '更新 Provider 失败：名称已存在（不区分大小写）- ' + existingName, '', 'user');
        return;
      }
    }
    delete apiConfig.providers[editingProvider];
    apiConfig.providers[newName] = { baseUrl: url, apiKey: key, api: 'openai-completions', models: editModalModels };

    // 如果当前正在使用该 provider，更新 selectedModel
    const currentModel = apiConfig.selectedModel;
    if (currentModel && currentModel.startsWith(editingProvider + '/')) {
      apiConfig.selectedModel = currentModel.replace(editingProvider, newName);
    }
  } else {
    apiConfig.providers[newName] = { baseUrl: url, apiKey: key, api: 'openai-completions', models: editModalModels };
  }

  // 保存到 api-config.json
  if (await window.electronAPI.saveApiConfig(apiConfig)) {
    setGlobalStatus('Provider 已更新', 'success');
    addLog('info', '更新 Provider: ' + newName, '', 'user');
    closeEditModal();
    editingProvider = null;
    editModalModels = [];

    // 【v2.7.5】刷新配置信息显示
    if (typeof updateOpenClawConfigDisplay === 'function') {
      await updateOpenClawConfigDisplay();
      console.log('[Edit] 配置信息已刷新');
    }
  }
}
