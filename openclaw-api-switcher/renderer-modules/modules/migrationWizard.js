// OpenClaw API Switcher - 引导式迁移向导
// 提供分步迁移流程，让用户逐步确认和配置

// 迁移向导状态
let migrationState = {
  step: 0,                    // 当前步骤: 0=未开始, 1=检测, 2=选择, 3=确认, 4=验证, 5=完成
  detectedProviders: [],      // 检测到的供应商
  selectedProviders: [],      // 用户选择的供应商
  providerConfigs: {},        // 供应商配置数据
  verificationResults: {},    // 验证结果
  tempConfig: null            // 临时配置数据
};

// 步骤定义
const MIGRATION_STEPS = [
  { id: 'detect', title: '检测配置', description: '扫描 OpenClaw 配置' },
  { id: 'select', title: '选择供应商', description: '选择要迁移的供应商' },
  { id: 'confirm', title: '确认配置', description: '查看和编辑配置' },
  { id: 'verify', title: '验证连接', description: '测试 API 连接' },
  { id: 'complete', title: '完成迁移', description: '保存到程序配置' }
];

/**
 * 初始化迁移向导
 */
function initMigrationWizard() {
  console.log('[MigrationWizard] 初始化迁移向导');
  resetMigrationState();
  renderMigrationWizard();
}

/**
 * 重置迁移状态
 */
function resetMigrationState() {
  migrationState = {
    step: 0,
    detectedProviders: [],
    selectedProviders: [],
    providerConfigs: {},
    verificationResults: {},
    tempConfig: null
  };
}

/**
 * 渲染迁移向导界面
 */
function renderMigrationWizard() {
  // 检查是否已存在向导容器
  let wizardContainer = document.getElementById('migration-wizard');
  if (!wizardContainer) {
    wizardContainer = document.createElement('div');
    wizardContainer.id = 'migration-wizard';
    wizardContainer.className = 'migration-wizard-overlay';
    document.body.appendChild(wizardContainer);
  }
  
  // 根据当前步骤渲染内容
  switch (migrationState.step) {
    case 0:
    case 1:
      renderDetectStep(wizardContainer);
      break;
    case 2:
      renderSelectStep(wizardContainer);
      break;
    case 3:
      renderConfirmStep(wizardContainer);
      break;
    case 4:
      renderVerifyStep(wizardContainer);
      break;
    case 5:
      renderCompleteStep(wizardContainer);
      break;
  }
}

/**
 * 步骤 1: 检测配置
 */
async function renderDetectStep(container) {
  container.innerHTML = `
    <div class="migration-wizard">
      <div class="wizard-header">
        <div class="wizard-header-content">
          <h2>🔄 迁移 OpenClaw 配置</h2>
          <p>将 OpenClaw 的配置迁移到 API Switcher</p>
        </div>
        <button class="wizard-close-btn" onclick="closeMigrationWizard()" title="关闭">✕</button>
      </div>
      
      <div class="wizard-progress">
        ${renderProgressBar(1)}
      </div>
      
      <div class="wizard-content">
        <div class="detect-status">
          <div class="detect-icon">🔍</div>
          <div class="detect-text">正在扫描 OpenClaw 配置...</div>
          <div class="detect-subtext">读取 openclaw.json, models.json, auth-profiles.json</div>
        </div>
      </div>
      
      <div class="wizard-actions">
        <button class="btn btn-secondary" onclick="closeMigrationWizard()">取消</button>
      </div>
    </div>
  `;
  
  // 执行检测
  await detectOpenClawConfig();
}

/**
 * 检测 OpenClaw 配置
 */
async function detectOpenClawConfig() {
  try {
    setGlobalStatus('正在扫描 OpenClaw 配置...', 'info');
    
    // 调用主进程检测配置
    const result = await window.electronAPI.scanOpenClawForMigration();
    
    if (!result.success) {
      showDetectError(result.message);
      return;
    }
    
    migrationState.detectedProviders = result.providers || [];
    migrationState.providerConfigs = result.configs || {};
    
    if (migrationState.detectedProviders.length === 0) {
      showDetectError('未检测到可迁移的配置');
      return;
    }
    
    // 默认全选
    migrationState.selectedProviders = [...migrationState.detectedProviders];
    
    // 进入下一步
    migrationState.step = 2;
    renderMigrationWizard();
    
    setGlobalStatus(`检测到 ${migrationState.detectedProviders.length} 个可迁移的供应商`, 'success');
  } catch (error) {
    console.error('[MigrationWizard] 检测失败:', error);
    showDetectError('检测失败: ' + error.message);
  }
}

/**
 * 显示检测错误
 */
function showDetectError(message) {
  const container = document.getElementById('migration-wizard');
  if (container) {
    const contentEl = container.querySelector('.wizard-content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="detect-status error">
          <div class="detect-icon">❌</div>
          <div class="detect-text">${message}</div>
          <div class="detect-subtext">请检查 OpenClaw 是否正确安装和配置</div>
        </div>
      `;
    }
  }
  setGlobalStatus(message, 'error');
}

/**
 * 步骤 2: 选择供应商
 */
function renderSelectStep(container) {
  const providers = migrationState.detectedProviders;
  const selected = migrationState.selectedProviders;
  
  container.innerHTML = `
    <div class="migration-wizard">
      <div class="wizard-header">
        <div class="wizard-header-content">
          <h2>📋 选择要迁移的供应商</h2>
          <p>选择您想要迁移到 API Switcher 的供应商配置</p>
        </div>
        <button class="wizard-close-btn" onclick="closeMigrationWizard()" title="关闭">✕</button>
      </div>
      
      <div class="wizard-progress">
        ${renderProgressBar(2)}
      </div>
      
      <div class="wizard-content">
        <div class="select-actions">
          <button class="btn btn-xs btn-secondary" onclick="selectAllMigrationProviders()">全选</button>
          <button class="btn btn-xs btn-secondary" onclick="deselectAllMigrationProviders()">取消全选</button>
          <span class="select-count">已选择 ${selected.length}/${providers.length} 个</span>
        </div>
        
        <div class="provider-select-list">
          ${providers.map(provider => {
            const config = migrationState.providerConfigs[provider];
            const isSelected = selected.includes(provider);
            const isExisting = checkProviderExists(provider);
            
            return `
              <div class="provider-select-item ${isExisting ? 'existing' : ''} ${isSelected ? 'selected' : ''}" 
                   onclick="toggleProviderSelection('${provider}')">
                <div class="select-checkbox">
                  <input type="checkbox" ${isSelected ? 'checked' : ''} 
                         ${isExisting ? 'disabled' : ''}
                         onclick="event.stopPropagation()">
                </div>
                <div class="select-info">
                  <div class="select-name">
                    ${config?.icon || '📦'} ${config?.name || provider}
                    ${isExisting ? '<span class="existing-badge">已存在</span>' : ''}
                  </div>
                  <div class="select-details">
                    ${config?.models?.length || 0} 个模型
                    ${config?.apiKey ? '• API Key 已配置' : '• 无 API Key'}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      
      <div class="wizard-actions">
        <button class="btn btn-secondary" onclick="closeMigrationWizard()">取消</button>
        <button class="btn btn-primary" onclick="goToConfirmStep()" 
                ${selected.length === 0 ? 'disabled' : ''}>
          下一步: 确认配置 →
        </button>
      </div>
    </div>
  `;
}

/**
 * 检查供应商是否已存在于程序配置中
 */
function checkProviderExists(providerId) {
  // 这里需要访问当前的程序配置
  // 暂时返回 false，实际实现时需要从 StateManager 或全局配置获取
  return false;
}

/**
 * 全选供应商
 */
function selectAllMigrationProviders() {
  migrationState.selectedProviders = [...migrationState.detectedProviders];
  renderMigrationWizard();
}

/**
 * 取消全选
 */
function deselectAllMigrationProviders() {
  migrationState.selectedProviders = [];
  renderMigrationWizard();
}

/**
 * 切换供应商选择
 */
function toggleProviderSelection(providerId) {
  const index = migrationState.selectedProviders.indexOf(providerId);
  if (index > -1) {
    migrationState.selectedProviders.splice(index, 1);
  } else {
    migrationState.selectedProviders.push(providerId);
  }
  renderMigrationWizard();
}

/**
 * 进入确认步骤
 */
function goToConfirmStep() {
  if (migrationState.selectedProviders.length === 0) {
    alert('请至少选择一个供应商');
    return;
  }
  migrationState.step = 3;
  renderMigrationWizard();
}

/**
 * 步骤 3: 确认配置
 */
function renderConfirmStep(container) {
  container.innerHTML = `
    <div class="migration-wizard">
      <div class="wizard-header">
        <div class="wizard-header-content">
          <h2>🔍 确认供应商配置</h2>
          <p>查看和编辑每个供应商的配置信息</p>
        </div>
        <button class="wizard-close-btn" onclick="closeMigrationWizard()" title="关闭">✕</button>
      </div>
      
      <div class="wizard-progress">
        ${renderProgressBar(3)}
      </div>
      
      <div class="wizard-content">
        <div class="confirm-list">
          ${migrationState.selectedProviders.map(provider => {
            const config = migrationState.providerConfigs[provider];
            return renderProviderConfirmCard(provider, config);
          }).join('')}
        </div>
      </div>
      
      <div class="wizard-actions">
        <button class="btn btn-secondary" onclick="goToSelectStep()">← 上一步</button>
        <button class="btn btn-primary" onclick="goToVerifyStep()">
          下一步: 验证连接 →
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染供应商确认卡片
 */
function renderProviderConfirmCard(providerId, config) {
  const apiKeyMasked = config?.apiKey 
    ? config.apiKey.substring(0, 10) + '***' + config.apiKey.substring(config.apiKey.length - 3)
    : '';
  
  return `
    <div class="confirm-card" data-provider="${providerId}">
      <div class="confirm-header">
        <span class="confirm-icon">${config?.icon || '📦'}</span>
        <span class="confirm-name">${config?.name || providerId}</span>
        <span class="confirm-id">(${providerId})</span>
      </div>
      
      <div class="confirm-fields">
        <div class="confirm-field">
          <label>API Key</label>
          <div class="confirm-input-group">
            <input type="password" 
                   class="confirm-input api-key-input" 
                   value="${config?.apiKey || ''}"
                   data-provider="${providerId}"
                   data-field="apiKey"
                   placeholder="输入 API Key">
            <button class="btn btn-xs btn-icon" onclick="toggleApiKeyVisibility(this)">👁️</button>
          </div>
        </div>
        
        <div class="confirm-field">
          <label>Base URL</label>
          <input type="text" 
                 class="confirm-input" 
                 value="${config?.baseUrl || ''}"
                 data-provider="${providerId}"
                 data-field="baseUrl"
                 placeholder="https://api.example.com/v1">
        </div>
        
        <div class="confirm-field">
          <label>模型 (${config?.models?.length || 0} 个)</label>
          <div class="confirm-models">
            ${(config?.models || []).map(m => `
              <span class="confirm-model-tag">${m.name || m.id}</span>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * 切换 API Key 可见性
 */
function toggleApiKeyVisibility(btn) {
  const input = btn.previousElementSibling;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

/**
 * 返回选择步骤
 */
function goToSelectStep() {
  migrationState.step = 2;
  renderMigrationWizard();
}

/**
 * 收集确认步骤的编辑数据
 */
function collectConfirmData() {
  const inputs = document.querySelectorAll('#migration-wizard .confirm-input');
  inputs.forEach(input => {
    const providerId = input.dataset.provider;
    const field = input.dataset.field;
    if (providerId && field && migrationState.providerConfigs[providerId]) {
      migrationState.providerConfigs[providerId][field] = input.value;
    }
  });
}

/**
 * 进入验证步骤
 */
function goToVerifyStep() {
  collectConfirmData();
  migrationState.step = 4;
  renderMigrationWizard();
  startVerification();
}

/**
 * 步骤 4: 验证连接
 */
function renderVerifyStep(container) {
  const total = migrationState.selectedProviders.length;
  const completed = Object.keys(migrationState.verificationResults).length;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  
  container.innerHTML = `
    <div class="migration-wizard">
      <div class="wizard-header">
        <div class="wizard-header-content">
          <h2>🔗 验证 API 连接</h2>
          <p>测试每个供应商的 API 连接是否正常</p>
        </div>
        <button class="wizard-close-btn" onclick="closeMigrationWizard()" title="关闭">✕</button>
      </div>
      
      <div class="wizard-progress">
        ${renderProgressBar(4)}
      </div>
      
      <div class="wizard-content">
        <div class="verify-progress">
          <div class="verify-progress-text">进度: ${completed}/${total}</div>
          <div class="verify-progress-bar">
            <div class="verify-progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>
        
        <div class="verify-list">
          ${migrationState.selectedProviders.map(provider => {
            const config = migrationState.providerConfigs[provider];
            const result = migrationState.verificationResults[provider];
            return renderProviderVerifyCard(provider, config, result);
          }).join('')}
        </div>
      </div>
      
      <div class="wizard-actions">
        <button class="btn btn-secondary" onclick="goToConfirmStep()" 
                ${completed < total ? 'disabled' : ''}>← 上一步</button>
        <button class="btn btn-primary" onclick="goToCompleteStep()" 
                ${completed < total ? 'disabled' : ''}>
          完成迁移 ✓
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染供应商验证卡片
 */
function renderProviderVerifyCard(providerId, config, result) {
  let statusHtml = '';
  if (!result) {
    statusHtml = '<span class="verify-status pending">⏳ 等待验证</span>';
  } else if (result.success) {
    statusHtml = `<span class="verify-status success">✅ 连接成功 (${result.latency}ms)</span>`;
  } else {
    statusHtml = `
      <span class="verify-status error">❌ 连接失败</span>
      <div class="verify-error">${result.error}</div>
      <button class="btn btn-xs btn-warning" onclick="editProviderConfig('${providerId}')">编辑配置</button>
    `;
  }
  
  return `
    <div class="verify-card ${result ? (result.success ? 'success' : 'error') : ''}" data-provider="${providerId}">
      <div class="verify-info">
        <span class="verify-icon">${config?.icon || '📦'}</span>
        <span class="verify-name">${config?.name || providerId}</span>
      </div>
      <div class="verify-status-wrapper">
        ${statusHtml}
      </div>
    </div>
  `;
}

/**
 * 开始验证
 */
async function startVerification() {
  for (const providerId of migrationState.selectedProviders) {
    const config = migrationState.providerConfigs[providerId];
    
    // 更新为检测中状态
    migrationState.verificationResults[providerId] = { status: 'testing' };
    renderMigrationWizard();
    
    // 执行验证
    try {
      const result = await testProviderConnection(providerId, config);
      migrationState.verificationResults[providerId] = result;
    } catch (error) {
      migrationState.verificationResults[providerId] = {
        success: false,
        error: error.message
      };
    }
    
    renderMigrationWizard();
  }
}

/**
 * 测试供应商连接
 */
async function testProviderConnection(providerId, config) {
  try {
    const startTime = Date.now();
    
    // 调用主进程进行连接测试
    const result = await window.electronAPI.testProviderConnection({
      providerId,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.models?.[0]?.id
    });
    
    const latency = Date.now() - startTime;
    
    return {
      success: result.success,
      latency,
      error: result.error
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 编辑供应商配置
 */
function editProviderConfig(providerId) {
  // 返回到确认步骤并高亮该供应商
  migrationState.step = 3;
  renderMigrationWizard();
  
  // 高亮对应的卡片
  setTimeout(() => {
    const card = document.querySelector(`.confirm-card[data-provider="${providerId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('highlight');
      setTimeout(() => card.classList.remove('highlight'), 2000);
    }
  }, 100);
}

/**
 * 进入完成步骤
 */
function goToCompleteStep() {
  migrationState.step = 5;
  renderMigrationWizard();
  completeMigration();
}

/**
 * 步骤 5: 完成迁移
 */
function renderCompleteStep(container) {
  const successCount = Object.values(migrationState.verificationResults)
    .filter(r => r.success).length;
  const total = migrationState.selectedProviders.length;
  
  container.innerHTML = `
    <div class="migration-wizard">
      <div class="wizard-header">
        <div class="wizard-header-content">
          <h2>✨ 迁移完成</h2>
          <p>供应商配置已成功迁移到 API Switcher</p>
        </div>
        <button class="wizard-close-btn" onclick="closeMigrationWizard()" title="关闭">✕</button>
      </div>
      
      <div class="wizard-progress">
        ${renderProgressBar(5)}
      </div>
      
      <div class="wizard-content">
        <div class="complete-status">
          <div class="complete-icon">🎉</div>
          <div class="complete-text">
            成功迁移 ${successCount}/${total} 个供应商
          </div>
          <div class="complete-subtext">
            请点击"应用配置"将配置同步到 OpenClaw
          </div>
        </div>
        
        <div class="complete-summary">
          ${migrationState.selectedProviders.map(provider => {
            const config = migrationState.providerConfigs[provider];
            const result = migrationState.verificationResults[provider];
            return `
              <div class="complete-item ${result?.success ? 'success' : 'error'}">
                <span class="complete-item-icon">${config?.icon || '📦'}</span>
                <span class="complete-item-name">${config?.name || provider}</span>
                <span class="complete-item-status">
                  ${result?.success ? '✓' : '✗'}
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      
      <div class="wizard-actions" style="justify-content: flex-end;">
        <button class="btn btn-primary" onclick="closeMigrationWizard()">
          完成
        </button>
      </div>
    </div>
  `;
}

/**
 * 完成迁移
 */
async function completeMigration() {
  try {
    setGlobalStatus('正在保存迁移的配置...', 'info');
    
    // 准备要保存的配置
    const providersToSave = {};
    const successfulProviders = [];
    
    for (const providerId of migrationState.selectedProviders) {
      const result = migrationState.verificationResults[providerId];
      if (result?.success) {
        providersToSave[providerId] = migrationState.providerConfigs[providerId];
        successfulProviders.push(providerId);
      }
    }
    
    if (successfulProviders.length === 0) {
      setGlobalStatus('没有成功验证的供应商可供迁移', 'warning');
      return;
    }
    
    // 调用主进程保存配置
    const result = await window.electronAPI.saveMigratedConfig({
      providers: providersToSave,
      providerOrder: successfulProviders,
      selectedModel: successfulProviders.length > 0 
        ? `${successfulProviders[0]}/${providersToSave[successfulProviders[0]].models?.[0]?.id}`
        : null
    });
    
    if (result.success) {
      // 设置安全切换状态
      if (successfulProviders.length > 0) {
        const firstProvider = successfulProviders[0];
        if (typeof StateManager !== 'undefined') {
          StateManager.setPendingProvider(firstProvider);
          StateManager.setAppliedProvider(null);
          StateManager.setIsApplying(false);
        }
        
        if (typeof updateApplyButtonState === 'function') {
          updateApplyButtonState('pending', firstProvider);
        }
        
        if (typeof updateCurrentUsageDisplay === 'function') {
          updateCurrentUsageDisplay();
        }
        
        if (typeof autoTestApiConnection === 'function') {
          setTimeout(() => autoTestApiConnection(), 500);
        }
      }
      
      // 刷新供应商列表
      if (typeof initNewApiConfig === 'function') {
        await initNewApiConfig();
      }
      if (typeof renderProviderList === 'function') {
        await renderProviderList();
      }
      
      setGlobalStatus(`成功迁移 ${successfulProviders.length} 个供应商，请点击"应用配置"`, 'success');
      addLog('info', '配置迁移完成', { providers: successfulProviders }, 'user');
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('[MigrationWizard] 保存失败:', error);
    setGlobalStatus('迁移保存失败: ' + error.message, 'error');
  }
}

/**
 * 渲染进度条
 */
function renderProgressBar(currentStep) {
  return `
    <div class="progress-steps">
      ${MIGRATION_STEPS.map((step, index) => {
        const stepNum = index + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;
        
        return `
          <div class="progress-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}">
            <div class="step-number">${isCompleted ? '✓' : stepNum}</div>
            <div class="step-info">
              <div class="step-title">${step.title}</div>
              <div class="step-desc">${step.description}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * 关闭迁移向导
 */
function closeMigrationWizard() {
  const container = document.getElementById('migration-wizard');
  if (container) {
    container.remove();
  }
  resetMigrationState();
}

// 导出公共 API
window.MigrationWizard = {
  init: initMigrationWizard,
  close: closeMigrationWizard,
  getState: () => migrationState
};
