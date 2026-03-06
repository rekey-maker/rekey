// ===== 新的 API 配置管理模块 =====
// 与 api-config.js 配合使用
// 负责：新 Provider 配置系统、分类标签、预设提供商、模型网格、自定义模型

// 全局状态变量
let predefinedProviders = null;
let currentApiConfig = null;
let selectedProviderCategory = 'domestic';
let selectedProviderId = null;
let selectedModels = new Set();

// 用于编辑的变量
let isEditingMode = false;
let editingProviderId = null;

// 初始化状态标志
let isInitializing = false;
let initPromise = null;

// 初始化新的 API 配置系统
async function initNewApiConfig() {
  // 如果已经在初始化中，返回现有的 Promise
  if (isInitializing && initPromise) {
    return initPromise;
  }
  
  // 如果已经初始化完成，直接返回
  if (predefinedProviders) {
    return;
  }
  
  // 开始初始化
  isInitializing = true;
  initPromise = (async () => {
    try {
      // 检查 electronAPI 是否可用
      if (!window.electronAPI) {
        console.error('[API Config] window.electronAPI 不可用');
        return;
      }
      
      // 检查 getPredefinedProviders 是否存在
      if (!window.electronAPI.getPredefinedProviders) {
        console.error('[API Config] getPredefinedProviders 方法不存在');
        return;
      }
      
      predefinedProviders = await window.electronAPI.getPredefinedProviders();
      currentApiConfig = await window.electronAPI.loadApiConfig();
    } catch (e) {
      console.error('[API Config] 初始化失败:', e);
    } finally {
      isInitializing = false;
    }
  })();
  
  return initPromise;
}

// 打开新的添加 Provider 模态框
async function openNewProviderModal() {
  // 重置为添加模式
  resetToAddMode();

  // 确保 predefinedProviders 已初始化
  if (!predefinedProviders) {
    await initNewApiConfig();
  }
  
  // 如果初始化后仍然为 null，显示错误提示
  if (!predefinedProviders) {
    setGlobalStatus('无法加载提供商列表，请刷新页面重试', 'error');
    return;
  }
  
  selectedProviderCategory = 'domestic';
  selectedProviderId = null;
  selectedModels.clear();
  
  // 先显示模态框
  document.getElementById('add-modal').classList.add('show');
  document.getElementById('modal-overlay').classList.add('show');
  
  // 模态框显示后再重置状态栏
  EditPageStatusBar.reset('add-modal');
  
  renderCategoryTabs();
  renderPresetProviders();
  document.getElementById('provider-config-section').style.display = 'none';
  resetProviderConfigForm();

  // 强制清空 API Key 输入框，确保不会显示其他 provider 的 Key
  const apiKeyInput = document.getElementById('config-api-key');
  if (apiKeyInput) {
    apiKeyInput.value = '';
  }
}

// 渲染分类标签
function renderCategoryTabs() {
  document.querySelectorAll('.category-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.category === selectedProviderCategory);
  });
}

// 渲染预设提供商列表
function renderPresetProviders() {
  const grid = document.getElementById('preset-grid');
  if (!grid || !predefinedProviders) {
    return;
  }
  const providers = predefinedProviders[selectedProviderCategory];
  if (!providers) {
    grid.innerHTML = '<div class="model-select-hint">该分类暂无提供商</div>';
    return;
  }
  grid.innerHTML = Object.entries(providers).map(([id, provider]) => `
    <div class="preset-card ${selectedProviderId === id ? 'selected' : ''}" data-provider="${id}">
      <span class="preset-icon">${provider.icon}</span>
      <div class="preset-info">
        <span class="preset-name">${provider.name}</span>
        ${provider.description ? `<span class="preset-description">${provider.description}</span>` : ''}
      </div>
    </div>
  `).join('');
  grid.querySelectorAll('.preset-card').forEach(card => {
    card.onclick = () => {
      selectedProviderId = card.dataset.provider;
      renderPresetProviders();
      showProviderConfig();
    };
  });
}

// 显示提供商配置表单
function showProviderConfig() {
  const provider = predefinedProviders[selectedProviderCategory][selectedProviderId];
  if (!provider) return;

  const configSection = document.getElementById('provider-config-section');
  const providerIcon = document.getElementById('config-provider-icon');
  const providerName = document.getElementById('config-provider-name');
  const baseUrlInput = document.getElementById('config-base-url');
  const baseUrlTip = document.getElementById('base-url-tip');
  const apiKeyGroup = document.getElementById('api-key-group');
  const apiKeyInput = document.getElementById('config-api-key');
  // 【v2.7.5】自定义供应商名称输入框
  const customNameGroup = document.getElementById('custom-provider-name-group');
  const customNameInput = document.getElementById('config-custom-name');

  if (configSection) configSection.style.display = 'block';
  if (providerIcon) {
    providerIcon.textContent = provider.icon;
  }
  if (providerName) {
    providerName.textContent = provider.name;
  }

  // 【v2.7.5】显示/隐藏自定义名称输入框
  const isCustomProvider = provider.isCustom || selectedProviderId?.startsWith('custom_');
  if (customNameGroup) {
    customNameGroup.style.display = isCustomProvider ? 'block' : 'none';
  }
  if (customNameInput && isCustomProvider) {
    // 如果是自定义供应商，默认填充当前名称，用户可以修改
    customNameInput.value = provider.name || '';
    customNameInput.placeholder = `例如：我的 ${provider.name || '自定义 API'}...`;
  }

  // 更新状态栏
  EditPageStatusBar.showInfo('add-modal', `正在配置 ${provider.name} - 请填写以下信息`);

  // 添加悬停提示
  if (providerIcon) providerIcon.title = `供应商图标：${provider.icon}`;
  if (providerName) providerName.title = `供应商名称：${provider.name}`;

  if (baseUrlInput) {
    baseUrlInput.value = provider.baseUrl || '';
    // 添加悬停提示
    baseUrlInput.title = 'API 基础地址，必须以 /v1 结尾（OpenAI 兼容格式）';

    if (provider.customUrl || selectedProviderCategory === 'local') {
      baseUrlInput.readOnly = false;
      // 根据供应商类型显示不同的提示
      if (selectedProviderId === 'ollama') {
        if (baseUrlTip) baseUrlTip.innerHTML = '💡 <strong>Ollama 默认地址：</strong>http://localhost:11434/v1<br><small>如在其他设备运行，请修改为对应 IP 地址</small>';
        baseUrlInput.title = 'Ollama 默认运行在 11434 端口，支持本地和局域网访问';
      } else if (selectedProviderId === 'vllm') {
        if (baseUrlTip) baseUrlTip.innerHTML = '💡 <strong>vLLM 默认地址：</strong>http://localhost:8000/v1<br><small>启动 vLLM 时请使用 --api-key 参数设置密钥</small>';
        baseUrlInput.title = 'vLLM 默认运行在 8000 端口，可通过 --port 参数修改';
      } else if (selectedProviderId === 'lmstudio') {
        if (baseUrlTip) baseUrlTip.innerHTML = '💡 <strong>LM Studio 默认地址：</strong>http://localhost:1234/v1<br><small>在 LM Studio 中开启 Local Inference Server</small>';
        baseUrlInput.title = 'LM Studio 默认运行在 1234 端口，需在设置中开启 API 服务';
      } else if (selectedProviderId === 'custom') {
        if (baseUrlTip) baseUrlTip.innerHTML = '💡 <strong>自定义地址示例：</strong><br>• 本机：http://localhost:8080/v1<br>• 局域网：http://192.168.1.100:8080/v1<br>• 远程服务器：https://your-server.com/v1';
        baseUrlInput.title = '自定义 API 地址，支持本机、局域网或远程服务器';
      } else {
        if (baseUrlTip) baseUrlTip.textContent = '💡 可修改为局域网 IP 或自定义地址';
      }
    } else {
      baseUrlInput.readOnly = true;
      if (baseUrlTip) baseUrlTip.textContent = '💡 默认地址，一般无需修改';
      baseUrlInput.title = '此供应商使用固定地址，无需修改';
    }
  }

  if (provider.noApiKey) {
    if (apiKeyGroup) apiKeyGroup.style.display = 'none';
  } else {
    if (apiKeyGroup) apiKeyGroup.style.display = 'block';
    // 添加模式时清空，编辑模式时保留现有值
    if (!isEditingMode && apiKeyInput) {
      apiKeyInput.value = '';
    }
    // 如果是编辑模式，但当前 provider 没有保存过配置，也清空
    if (isEditingMode && apiKeyInput) {
      const savedConfig = currentApiConfig?.providers?.[selectedProviderId];
      if (!savedConfig?.apiKey) {
        apiKeyInput.value = '';
      }
    }

    // 添加 API Key 提示
    const apiKeyTip = document.getElementById('api-key-tip');
    if (apiKeyTip) {
      if (selectedProviderId === 'moonshot') {
        apiKeyTip.innerHTML = '💡 <strong>获取方式：</strong>访问 <a href="https://platform.moonshot.cn/" target="_blank">Moonshot 开放平台</a> 获取 API Key';
      } else if (selectedProviderId === 'openai') {
        apiKeyTip.innerHTML = '💡 <strong>获取方式：</strong>访问 <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a> 获取 API Key';
      } else if (selectedProviderId === 'deepseek') {
        apiKeyTip.innerHTML = '💡 <strong>获取方式：</strong>访问 <a href="https://platform.deepseek.com/" target="_blank">DeepSeek 开放平台</a> 获取 API Key';
      } else if (selectedProviderId === 'aliyun') {
        apiKeyTip.innerHTML = '💡 <strong>获取方式：</strong>访问 <a href="https://dashscope.console.aliyun.com/" target="_blank">阿里云百炼控制台</a> 获取 API Key';
      } else if (selectedProviderId === 'siliconflow') {
        apiKeyTip.innerHTML = '💡 <strong>获取方式：</strong>访问 <a href="https://cloud.siliconflow.cn/" target="_blank">硅基流动控制台</a> 获取 API Key';
      } else if (selectedProviderId === 'anthropic') {
        apiKeyTip.innerHTML = '💡 <strong>获取方式：</strong>访问 <a href="https://console.anthropic.com/" target="_blank">Anthropic Console</a> 获取 API Key';
      } else if (selectedProviderId === 'groq') {
        apiKeyTip.innerHTML = '💡 <strong>获取方式：</strong>访问 <a href="https://console.groq.com/" target="_blank">Groq Cloud Console</a> 获取 API Key';
      } else if (selectedProviderId === 'together') {
        apiKeyTip.innerHTML = '💡 <strong>获取方式：</strong>访问 <a href="https://api.together.xyz/" target="_blank">Together AI</a> 获取 API Key';
      } else if (selectedProviderId === 'gemini') {
        apiKeyTip.innerHTML = '💡 <strong>获取方式：</strong>访问 <a href="https://makersuite.google.com/app/apikey" target="_blank">Google AI Studio</a> 获取 API Key';
      } else if (selectedProviderId === 'azure') {
        apiKeyTip.innerHTML = '💡 <strong>获取方式：</strong>在 Azure Portal 中创建 OpenAI 服务获取 Endpoint 和 Key';
      } else {
        apiKeyTip.textContent = '💡 请输入您的 API Key';
      }
    }

    // 添加 API Key 输入框悬停提示
    if (apiKeyInput) {
      apiKeyInput.title = '在此处粘贴您的 API Key，支持 sk-、Bearer 等格式';
    }
  }

  // 添加自定义模型区域的悬停提示
  const customModelIdInput = document.getElementById('custom-model-id');
  const customModelNameInput = document.getElementById('custom-model-name');
  const customModelContextInput = document.getElementById('custom-model-context');
  const btnAddCustomModel = document.getElementById('btn-add-custom-model');

  if (customModelIdInput) {
    customModelIdInput.title = '模型ID是API调用时使用的唯一标识符，如：gpt-4、llama-3.1-70b（区分大小写）';
  }
  if (customModelNameInput) {
    customModelNameInput.title = '显示名称是在界面中展示的名称，如：GPT-4、Llama 3.1 70B';
  }
  if (customModelContextInput) {
    customModelContextInput.title = '上下文长度表示模型支持的最大token数，如：128000、32000';
  }
  if (btnAddCustomModel) {
    btnAddCustomModel.title = '点击添加此自定义模型到列表中';
  }

  renderModelGrid(provider);
  document.getElementById('btn-save-provider').disabled = false;
}

// 渲染模型网格
function renderModelGrid(provider) {
  const grid = document.getElementById('config-model-grid');
  if (!grid) return;

  // 检测是否为本地/局域网模型
  const isLocalProvider = provider?.baseUrl?.includes('localhost') ||
                          provider?.baseUrl?.includes('127.0.0.1') ||
                          provider?.baseUrl?.match(/^http:\/\/192\.168\./) ||
                          provider?.baseUrl?.match(/^http:\/\/10\./) ||
                          provider?.isLocal === true;

  // 本地模型不显示预设模型列表，只显示自定义添加的模型
  const allModels = isLocalProvider
    ? [...(provider?.customModels || [])]  // 本地模型：只显示自定义模型
    : [...(provider?.models || []), ...(provider?.customModels || [])];  // 远程模型：显示预设+自定义

  if (allModels.length === 0) {
    let hintMessage;
    if (isLocalProvider) {
      hintMessage = `
        <div class="model-select-hint" style="text-align: left; padding: 16px;">
          <strong>🖥️ 本地/局域网模型配置指南</strong><br><br>
          <strong>1. 自动检测（推荐）：</strong><br>
          点击"🔍 自动检测本地模型"按钮，自动获取已部署的模型列表<br><br>
          <strong>2. 手动添加：</strong><br>
          在下方输入模型ID和名称，点击"添加"按钮<br><br>
          <strong>💡 提示：</strong><br>
          • 本地模型：http://localhost:11434/v1 (Ollama)<br>
          • 局域网模型：http://192.168.x.x:8000/v1<br>
          • 模型ID必须和本地部署的模型名称一致
        </div>
      `;
    } else {
      hintMessage = '<div class="model-select-hint">该提供商暂无预设模型，请手动添加<br><small>提示：在下方输入模型ID和名称后点击"添加"按钮</small></div>';
    }
    grid.innerHTML = hintMessage;
    return;
  }

  grid.innerHTML = allModels.map((model, index) => {
    const isCustom = model.isCustom || provider?.customModels?.some(m => m.id === model.id);
    const isPreset = provider?.models?.some(m => m.id === model.id) && !isCustom;
    // 在编辑模式下显示删除按钮
    const deleteButton = `<button class="btn-delete-model" onclick="event.stopPropagation(); deleteModel('${model.id}', ${isPreset})" title="${isPreset ? '隐藏此预设模型' : '删除此自定义模型'}">🗑️</button>`;

    return `
    <div class="model-select-item ${selectedModels.has(model.id) ? 'selected' : ''}" data-model="${model.id}" title="点击选择此模型${isCustom ? '（自定义模型）' : ''}">
      <span class="model-icon">${provider.icon || '⚙️'}</span>
      <div class="model-info">
        <div class="model-name-wrapper">
          <span class="model-name">${model.name}</span>
          ${isCustom ? '<span class="custom-badge">自定义</span>' : ''}
        </div>
        <span class="model-context">${formatContextWindow(model.contextWindow)}</span>
      </div>
      ${deleteButton}
    </div>
  `}).join('');

  grid.querySelectorAll('.model-select-item').forEach(item => {
    item.onclick = () => {
      const modelId = item.dataset.model;
      // 单选模式：先清空，再添加
      selectedModels.clear();
      selectedModels.add(modelId);
      renderModelGrid(provider);

      // 清除错误状态（如果有）
      EditPageStatusBar.reset('add-modal');
    };
  });
}

// 删除模型
function deleteModel(modelId, isPreset) {
  const provider = predefinedProviders[selectedProviderCategory]?.[selectedProviderId];
  if (!provider) return;

  if (isPreset) {
    // 预设模型：确认删除并提供恢复选项
    if (!confirm(`确定要隐藏预设模型 "${modelId}" 吗？\n\n提示：隐藏后可通过"恢复所有预设模型"按钮恢复。`)) {
      return;
    }
    // 将预设模型从显示列表中移除（添加到隐藏列表）
    if (!provider.hiddenModels) provider.hiddenModels = [];
    provider.hiddenModels.push(modelId);
    // 从 models 中移除
    provider.models = provider.models.filter(m => m.id !== modelId);
    setGlobalStatus(`预设模型 "${modelId}" 已隐藏`, 'success');
  } else {
    // 自定义模型：直接删除
    const model = provider.customModels?.find(m => m.id === modelId);
    if (!confirm(`确定要删除自定义模型 "${model?.name || modelId}" 吗？\n\n警告：此操作不可恢复！`)) {
      return;
    }
    provider.customModels = provider.customModels.filter(m => m.id !== modelId);
    selectedModels.delete(modelId);
    setGlobalStatus(`自定义模型 "${model?.name || modelId}" 已删除`, 'success');
  }

  renderModelGrid(provider);
}

// 恢复所有预设模型
function restorePresetModels() {
  const provider = predefinedProviders[selectedProviderCategory]?.[selectedProviderId];
  if (!provider) return;

  if (!provider.hiddenModels || provider.hiddenModels.length === 0) {
    setGlobalStatus('没有需要恢复的预设模型', 'info');
    return;
  }

  if (!confirm(`确定要恢复所有预设模型吗？\n\n将恢复 ${provider.hiddenModels.length} 个预设模型。`)) {
    return;
  }

  // 从 PREDEFINED_PROVIDERS 获取原始模型列表
  const presetKey = Object.keys(PROVIDER_PRESETS).find(key =>
    PROVIDER_PRESETS[key].name === provider.name || key === selectedProviderId
  );

  if (presetKey && PROVIDER_PRESETS[presetKey]) {
    const originalModels = PROVIDER_PRESETS[presetKey].models || [];
    // 恢复隐藏的模型
    provider.hiddenModels.forEach(modelId => {
      const originalModel = originalModels.find(m => m.id === modelId);
      if (originalModel && !provider.models.some(m => m.id === modelId)) {
        provider.models.push(originalModel);
      }
    });
  }

  provider.hiddenModels = [];
  renderModelGrid(provider);
  setGlobalStatus('所有预设模型已恢复', 'success');
}

// 格式化上下文窗口显示
function formatContextWindow(context) {
  if (context >= 1000000) return `${(context / 1000000).toFixed(1)}M ctx`;
  if (context >= 1000) return `${(context / 1000).toFixed(0)}K ctx`;
  return `${context} ctx`;
}

// 添加自定义模型
function addCustomModel() {
  const idInput = document.getElementById('custom-model-id');
  const nameInput = document.getElementById('custom-model-name');
  const contextInput = document.getElementById('custom-model-context');

  const id = idInput?.value.trim();
  const name = nameInput?.value.trim();
  const context = parseInt(contextInput?.value) || 32000;

  // 验证输入
  if (!id) {
    EditPageStatusBar.showError('add-modal', '请填写模型ID');
    alert('请填写模型ID\n\n提示：模型ID是API调用时使用的标识符，如：gpt-4、claude-3-opus、llama-3.1-70b\n注意：ID区分大小写，请确保与API文档一致');
    idInput?.focus();
    return;
  }

  if (!name) {
    EditPageStatusBar.showError('add-modal', '请填写显示名称');
    alert('请填写显示名称\n\n提示：显示名称是在界面中展示的名称，如：GPT-4、Claude 3 Opus、Llama 3.1 70B');
    nameInput?.focus();
    return;
  }

  // 检查是否已存在相同ID的模型
  const provider = predefinedProviders[selectedProviderCategory]?.[selectedProviderId];
  if (provider) {
    // 检测是否为本地/局域网模型
    const isLocalProvider = provider?.baseUrl?.includes('localhost') ||
                            provider?.baseUrl?.includes('127.0.0.1') ||
                            provider?.baseUrl?.match(/^http:\/\/192\.168\./) ||
                            provider?.baseUrl?.match(/^http:\/\/10\./) ||
                            provider?.isLocal === true;

    // 本地模型只检查自定义模型列表，不检查预设模型
    const allModels = isLocalProvider
      ? [...(provider.customModels || [])]  // 本地模型：只检查自定义模型
      : [...(provider.models || []), ...(provider.customModels || [])];  // 远程模型：检查所有模型

    const exists = allModels.some(m => m.id === id);

    if (exists) {
      EditPageStatusBar.showError('add-modal', `模型ID "${id}" 已存在`);
      alert(`模型ID "${id}" 已存在\n\n提示：每个模型ID必须唯一，请使用不同的ID`);
      return;
    }
  }

  // 添加到选择集合
  selectedModels.clear(); // 单选模式：先清空
  selectedModels.add(id);

  // 清空输入框
  if (idInput) idInput.value = '';
  if (nameInput) nameInput.value = '';
  if (contextInput) contextInput.value = '';

  // 添加到 provider 的自定义模型列表
  if (provider) {
    if (!provider.customModels) provider.customModels = [];
    provider.customModels.push({
      id,
      name,
      contextWindow: context,
      isCustom: true // 标记为自定义模型
    });
    renderModelGrid(provider);
    // 先清除错误状态，再显示成功消息
    EditPageStatusBar.reset('add-modal');
    EditPageStatusBar.showSuccess('add-modal', `自定义模型 "${name}" 已添加`);
    setGlobalStatus(`自定义模型 "${name}" 已添加并选中`, 'success');
  }
}

// 测试 API 连接
async function testApiConnection() {
  const provider = predefinedProviders[selectedProviderCategory][selectedProviderId];
  if (!provider) return;

  const baseUrlInput = document.getElementById('config-base-url');
  const apiKeyInput = document.getElementById('config-api-key');
  const resultEl = document.getElementById('connection-test-result');

  if (!baseUrlInput || !resultEl) return;

  const baseUrl = baseUrlInput.value.trim();
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

  if (!apiKey) {
    EditPageStatusBar.showWarning('add-modal', '请先输入 API Key');
    resultEl.textContent = '✗ 请先输入 API Key';
    resultEl.className = 'connection-status-text error';
    return;
  }

  resultEl.textContent = '测试中...';
  resultEl.className = 'connection-status-text';
  EditPageStatusBar.showInfo('add-modal', '正在测试连接...');

  try {
    const result = await window.electronAPI.testApiConnection(selectedProviderId, { baseUrl, apiKey, apiType: provider.apiType });
    if (result.success) {
      EditPageStatusBar.showSuccess('add-modal', `连接成功 (${result.latency}ms)`);
      resultEl.textContent = `✓ 连接成功 (${result.latency}ms)`;
      resultEl.className = 'connection-status-text success';
    } else {
      EditPageStatusBar.showError('add-modal', '连接失败: ' + result.message);
      resultEl.textContent = `✗ 连接失败: ${result.message}`;
      resultEl.className = 'connection-status-text error';
    }
  } catch (e) {
    EditPageStatusBar.showError('add-modal', '测试出错: ' + e.message);
    resultEl.textContent = `✗ 测试出错: ${e.message}`;
    resultEl.className = 'connection-status-text error';
  }
}

// 保存 Provider 配置
async function saveNewProviderConfig() {
  // 编辑模式下使用不同的 provider ID
  const providerId = isEditingMode ? editingProviderId : selectedProviderId;
  const provider = predefinedProviders[selectedProviderCategory]?.[selectedProviderId];

  if (!provider && !isEditingMode) return;

  const baseUrlInput = document.getElementById('config-base-url');
  const apiKeyInput = document.getElementById('config-api-key');

  if (!baseUrlInput) { alert('页面元素加载失败，请刷新重试'); return; }

  const baseUrl = baseUrlInput.value.trim();
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

  // 判断是否为本地/局域网供应商或自定义供应商（提前定义，避免变量提升问题）
  const isLocalProvider = selectedProviderCategory === 'local' ||
                          (provider && (provider.noApiKey || provider.customUrl));
  // 【v2.7.5】自定义供应商（custom_domestic/custom_international/custom_local）也允许灵活配置
  const isCustomProvider = provider && (provider.isCustom || selectedProviderId?.startsWith('custom_'));

  if (!baseUrl) {
    EditPageStatusBar.showError('add-modal', '请填写 API 地址');
    alert('请填写 API 地址\n\n提示：本地/局域网供应商请填写 http://localhost:端口号 或局域网 IP');
    return;
  }

  // 本地/局域网供应商无需强制填写 API Key
  if (!isLocalProvider && !apiKey) {
    EditPageStatusBar.showError('add-modal', '请填写 API Key');
    alert('请填写 API Key\n\n提示：此供应商需要 API Key 才能访问，请在对应平台获取');
    return;
  }

  // 【v2.7.5】本地/局域网/自定义供应商允许不选择模型，标准国内/国际供应商强制要求
  if (selectedModels.size === 0) {
    if (isLocalProvider || isCustomProvider) {
      // 本地/局域网/自定义供应商：提示但不阻止
      const continueWithoutModels = confirm('⚠️ 未选择任何模型\n\n您可以在保存后随时添加模型。\n\n是否继续保存？');
      if (!continueWithoutModels) {
        return;
      }
    } else {
      // 标准国内/国际供应商：强制要求选择模型
      EditPageStatusBar.showError('add-modal', '请至少选择一个模型');
      alert('请至少选择一个模型\n\n提示：点击上方模型卡片选择，或手动添加自定义模型');
      return;
    }
  }

  // 所有验证通过，清除错误状态
  EditPageStatusBar.reset('add-modal');

  // 从 api-config.json 获取现有配置
  const apiConfig = await window.electronAPI.loadApiConfig();

  // 获取 provider 名称、图标和颜色
  let providerName, providerIcon, providerColor, providerApiType;

  // 【v2.7.5】读取用户自定义名称（如果是自定义供应商）
  const customNameInput = document.getElementById('config-custom-name');
  const customName = customNameInput?.value?.trim();

  if (isEditingMode) {
    // 编辑模式：使用现有配置
    const existingProvider = apiConfig.providers?.[editingProviderId];
    // 【v2.7.5】自定义供应商优先使用用户输入的名称
    providerName = (isCustomProvider && customName) ? customName : (existingProvider?.name || editingProviderId);
    providerIcon = existingProvider?.icon || '⚙️';
    providerColor = existingProvider?.color || provider?.color || '#666';
    providerApiType = existingProvider?.apiType || provider?.apiType || 'openai';
  } else {
    // 添加模式：使用预定义配置或随机分配
    // 【v2.7.5】自定义供应商优先使用用户输入的名称
    providerName = (isCustomProvider && customName) ? customName : (provider?.name || providerId);
    // 为新供应商随机分配图标和颜色
    providerIcon = provider?.icon || getRandomIcon(isLocalProvider);
    providerColor = provider?.color || getRandomColor(isLocalProvider);
    providerApiType = provider?.apiType || 'openai';
  }

  // 合并所有可能的模型来源：预定义模型 + 现有模型 + 自定义模型
  const allAvailableModels = [
    ...(provider?.models || []),
    ...(provider?.customModels || []),
    ...(isEditingMode ? apiConfig.providers?.[editingProviderId]?.models || [] : [])
  ];

  const configData = {
    id: providerId,
    name: providerName,
    icon: providerIcon,
    baseUrl,
    apiKey: apiKey || '',
    apiType: providerApiType,
    category: selectedProviderCategory,
    models: Array.from(selectedModels).map(modelId => {
      // 在所有可用模型中查找
      const foundModel = allAvailableModels.find(m => m.id === modelId);
      // 如果找不到，使用模型ID作为名称
      return {
        id: modelId,
        name: foundModel?.name || modelId,
        contextWindow: foundModel?.contextWindow || 32000
      };
    })
  };

  try {
    EditPageStatusBar.showInfo('add-modal', '正在保存配置...');
    await window.electronAPI.updateProviderConfig(providerId, configData);
    
    // 同时更新本地 apiConfig，让"当前使用"标签页能正确显示
    const apiConfig = await window.electronAPI.loadApiConfig();
    if (!apiConfig.providers) apiConfig.providers = {};
    apiConfig.providers[providerId] = {
      name: providerName,
      baseUrl: baseUrl,
      apiKey: apiKey || '',
      icon: providerIcon,
      color: providerColor,
      models: configData.models
    };
    
    // 添加模式：添加到 providerOrder 末尾（如果是新供应商）
    if (!isEditingMode && !apiConfig.providerOrder.includes(providerId)) {
      apiConfig.providerOrder.push(providerId);
    }
    
    // 保存到 api-config.json
    await window.electronAPI.saveApiConfig(apiConfig);

    // ===== 同步到 OpenClaw 的逻辑（新架构）=====
    // 添加模式：不同步，用户手动选择后才同步
    // 编辑模式：只有当前选中的供应商才同步
    let shouldSync = false;
    
    if (isEditingMode) {
      // 编辑模式：检查是否当前选中的供应商
      const currentSelectedModel = apiConfig.selectedModel || '';
      const currentProvider = currentSelectedModel.split('/')[0];
      if (currentProvider === providerId) {
        shouldSync = true;
      }
    } else {
      // 添加模式：不同步
    }
    
    if (shouldSync) {
      // 编辑供应商时保持原有缓存检查行为（非强制）
      const syncResult = await window.electronAPI.syncToOpenClaw(providerId, configData, false);
      if (!syncResult.success) {
        EditPageStatusBar.showError('add-modal', '同步失败: ' + syncResult.message);
        alert('同步到 OpenClaw 失败: ' + syncResult.message);
        return;
      }
    }
    // ==========================================

    EditPageStatusBar.showSuccess('add-modal', isEditingMode ? '配置已更新' : '配置已保存');
    setGlobalStatus(isEditingMode ? 'Provider 配置已更新' : 'Provider 配置已保存', 'success');
    closeModal();
    await renderProviderList();

    // ===== 添加/编辑供应商后的选中逻辑（新架构）=====
    // 添加模式：保持当前选中的供应商不变，新供应商需要手动选择
    // 编辑模式：保持当前选择不变
    // 两种模式都只刷新显示，不改变当前选中
    renderCurrentModel();
    // ==========================================

    // 重新检测配置状态，更新迁移页面显示
    await autoCheckOpenClawConfig(isEditingMode ? 'edit' : 'add');
  } catch (e) {
    console.error('保存 Provider 配置失败:', e);
    EditPageStatusBar.showError('add-modal', '保存失败: ' + e.message);
    alert('保存失败: ' + e.message);
  }
}

// 重置表单
function resetProviderConfigForm() {
  const baseUrlEl = document.getElementById('config-base-url');
  const apiKeyEl = document.getElementById('config-api-key');
  const resultEl = document.getElementById('connection-test-result');
  const modelIdEl = document.getElementById('custom-model-id');
  const modelNameEl = document.getElementById('custom-model-name');
  const modelContextEl = document.getElementById('custom-model-context');

  if (baseUrlEl) baseUrlEl.value = '';
  if (apiKeyEl) apiKeyEl.value = '';
  if (resultEl) {
    resultEl.textContent = '';
    resultEl.className = 'connection-status-text';
  }
  if (modelIdEl) modelIdEl.value = '';
  if (modelNameEl) modelNameEl.value = '';
  if (modelContextEl) modelContextEl.value = '';
}

// 更新事件监听器
function setupNewApiConfigListeners() {
  // 使用事件委托处理动态创建的按钮
  document.body.addEventListener('click', (e) => {
    // 分类标签点击
    const categoryTab = e.target.closest('.category-tab');
    if (categoryTab) {
      const category = categoryTab.dataset.category;
      if (category && predefinedProviders && predefinedProviders[category]) {
        selectedProviderCategory = category;
        selectedProviderId = null;
        selectedModels.clear();
        renderCategoryTabs();
        renderPresetProviders();
        const configSection = document.getElementById('provider-config-section');
        if (configSection) configSection.style.display = 'none';
        return;
      }
    }

    // 测试连接按钮（添加/编辑模态框中的）
    if (e.target.closest('#btn-test-api-connection')) {
      testApiConnection();
    }
    // 添加模型按钮（添加模态框）
    if (e.target.closest('#btn-add-custom-model')) {
      addCustomModel();
    }
    // 添加模型按钮（编辑模态框）
    if (e.target.closest('#btn-edit-add-model')) {
      addCustomModelToEditModal();
    }
    // 保存按钮
    if (e.target.closest('#btn-save-provider')) {
      saveNewProviderConfig();
    }
  });

  // API Key 输入框占位符交互
  const apiKeyInput = document.getElementById('config-api-key');
  const apiKeyPlaceholder = document.getElementById('api-key-placeholder');

  // 使用事件委托处理动态创建的输入框
  document.body.addEventListener('input', (e) => {
    // Base URL 输入框
    if (e.target && e.target.id === 'config-base-url') {
      if (e.target.value.trim()) {
        EditPageStatusBar.reset('add-modal');
      }
    }
    // API Key 输入框
    if (e.target && e.target.id === 'config-api-key') {
      if (e.target.value.trim()) {
        e.target.classList.add('has-content');
        EditPageStatusBar.reset('add-modal');
      } else {
        e.target.classList.remove('has-content');
      }
    }
    // 自定义模型输入框
    if (e.target && (e.target.id === 'custom-model-id' ||
                     e.target.id === 'custom-model-name' ||
                     e.target.id === 'custom-model-context')) {
      if (e.target.value.trim()) {
        EditPageStatusBar.reset('add-modal');
      }
    }
  });

  // API Key 输入框占位符交互
  if (apiKeyInput && apiKeyPlaceholder) {
    // 获得焦点时隐藏占位符
    apiKeyInput.addEventListener('focus', () => {
      apiKeyPlaceholder.style.opacity = '0';
    });

    // 获得焦点时隐藏占位符
    apiKeyInput.addEventListener('focus', () => {
      apiKeyPlaceholder.style.opacity = '0';
    });

    // 失去焦点时，如果没有内容则显示占位符
    apiKeyInput.addEventListener('blur', () => {
      if (!apiKeyInput.value.trim()) {
        apiKeyPlaceholder.style.opacity = '1';
        apiKeyInput.classList.remove('has-content');
      }
    });

    // 点击占位符时聚焦到输入框
    apiKeyPlaceholder.addEventListener('click', () => {
      apiKeyInput.focus();
    });
  }
}

// 打开编辑模式的新 API 配置页面
async function openNewProviderModalForEdit(providerName) {
  isEditingMode = true;
  editingProviderId = providerName;

  // 重置状态栏
  EditPageStatusBar.reset('add-modal');

  if (!predefinedProviders) {
    await initNewApiConfig();
  }

  // 从 api-config.json 获取 provider 配置（新架构：单一数据源）
  const apiConfig = await window.electronAPI.loadApiConfig();
  const provider = apiConfig.providers?.[providerName];
  if (!provider) {
    alert('找不到 Provider 配置');
    return;
  }

  // 新架构：直接从 api-config.json 获取真实 API Key
  // 不再从 OpenClaw 读取，因为 api-config.json 是主数据源
  let realApiKey = '';
  if (provider.apiKey && provider.apiKey !== 'e') {
    realApiKey = provider.apiKey;
  }

  // 查找对应的预定义 provider
  let foundCategory = null;
  let foundProviderId = null;

  for (const [category, providers] of Object.entries(predefinedProviders)) {
    for (const [id, preset] of Object.entries(providers)) {
      if (preset.name === providerName || id === providerName.toLowerCase()) {
        foundCategory = category;
        foundProviderId = id;
        break;
      }
    }
    if (foundCategory) break;
  }

  // 设置状态
  selectedProviderCategory = foundCategory || 'domestic';
  selectedProviderId = foundProviderId;
  selectedModels.clear();

  // 显示模态框
  document.getElementById('add-modal').classList.add('show');
  document.getElementById('modal-overlay').classList.add('show');

  // 更新标题
  document.querySelector('#add-modal .modal-title').textContent = '编辑 Provider';

  // 渲染分类标签
  renderCategoryTabs();

  // 渲染预设提供商列表
  renderPresetProviders();

  // 获取保存的模型列表（包含自定义模型）
  const savedModels = provider.models || [];

  // 如果有找到预定义 provider，显示配置
  if (foundProviderId) {
    showProviderConfig();
    // 编辑模式：填充真实的 API Key（即使为空也要设置）
    const apiKeyInput = document.getElementById('config-api-key');
    if (apiKeyInput) {
      apiKeyInput.value = realApiKey;
    }

    // 添加保存的模型到选择（包括自定义模型）
    if (savedModels) {
      savedModels.forEach(m => selectedModels.add(m.id));
    }

    // 合并预定义模型和自定义模型用于显示
    const presetProvider = predefinedProviders[selectedProviderCategory]?.[selectedProviderId];
    if (presetProvider) {
      // 将自定义模型添加到 provider 的模型列表中
      const customModels = savedModels.filter(sm => !presetProvider.models.some(pm => pm.id === sm.id));
      const mergedProvider = {
        ...presetProvider,
        models: [...presetProvider.models, ...customModels]
      };
      renderModelGrid(mergedProvider);
    } else if (savedModels.length > 0) {
      // 没有找到预设 provider，但保存了模型，渲染自定义模型
      const customProvider = {
        icon: provider.icon || '⚙️',
        models: savedModels
      };
      renderModelGrid(customProvider);
    }
  } else {
    // 自定义 provider，手动填充
    const configSection = document.getElementById('provider-config-section');
    const providerIcon = document.getElementById('config-provider-icon');
    const providerNameEl = document.getElementById('config-provider-name');
    const baseUrlInput = document.getElementById('config-base-url');

    if (configSection) configSection.style.display = 'block';
    if (providerIcon) providerIcon.textContent = provider.icon || '⚙️';
    if (providerNameEl) providerNameEl.textContent = providerName;
    if (baseUrlInput) {
      baseUrlInput.value = provider.baseUrl || '';
      baseUrlInput.readOnly = false;
    }

    const apiKeyInput = document.getElementById('config-api-key');
    if (apiKeyInput) {
      apiKeyInput.value = realApiKey;
    }

    // 添加保存的模型到选择（包括自定义模型）
    if (savedModels) {
      savedModels.forEach(m => selectedModels.add(m.id));
    }

    // 渲染模型网格（使用保存的模型列表）
    const customProvider = {
      icon: provider.icon || '⚙️',
      models: savedModels
    };
    renderModelGrid(customProvider);
  }

  // 填充现有配置（Base URL）
  const baseUrlInput = document.getElementById('config-base-url');
  if (baseUrlInput) {
    baseUrlInput.value = provider.baseUrl || '';
  }

  // 启用保存按钮
  document.getElementById('btn-save-provider').disabled = false;
}

// 重置为添加模式
function resetToAddMode() {
  isEditingMode = false;
  editingProviderId = null;
  document.querySelector('#add-modal .modal-title').textContent = '添加 Provider';
}

// 在初始化时设置新的监听器
function initNewApiConfigModule() {
  setTimeout(() => {
    setupNewApiConfigListeners();
    initNewApiConfig();
  }, 100);
}

if (document.readyState === 'loading') {
  // DOM 还在加载中，添加监听器
  document.addEventListener('DOMContentLoaded', initNewApiConfigModule);
} else {
  // DOM 已经加载完成，直接执行
  initNewApiConfigModule();
}
