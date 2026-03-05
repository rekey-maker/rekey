// OpenClaw API Switcher - Renderer Entry Point
// 注意：此文件为入口文件，所有功能函数已拆分到 renderer-modules/ 目录
// 本文件只保留必要的兼容性代码，所有功能由模块文件提供

// ============================================
// 兼容性说明
// ============================================
// 以下功能由模块文件提供：
// - PROVIDER_PRESETS, ICON_OPTIONS, COLOR_OPTIONS -> constants.js
// - getRandomIcon(), getRandomColor(), maskKey() -> helpers.js
// - StateManager -> state.js
// - init(), loadConfig(), syncApiKeysFromNewConfig() -> initManager.js
// - renderProviderList(), selectProvider(), deleteProvider() -> providerManager.js
// - addLog(), loadLogs(), renderLogs() -> logManager.js
// - renderBackupList(), loadBackupsPaginated() -> backupManager.js
// - setupEventListeners(), setupRealtimeLogs() -> eventManager.js
// - checkGatewayStatus(), setupOpenClawCheck() -> gatewayManager.js
// - setGlobalStatus(), EditPageStatusBar -> uiComponents.js
// - 其他所有功能函数 -> 相应模块文件

// ============================================
// 全局变量声明（注意：这些变量在 state.js 中已声明）
// 由于脚本加载顺序，这里不再重复声明，直接使用全局变量
// ============================================
// config, selectedProvider, logs, requestList, lastModel
// protectionTimer, currentConnectionStatus, editingProvider
// currentApiKeyVisible, backupList, currentLogFilter
// autoConnectionInterval, requestFilter

// ============================================
// 初始化入口
// ============================================
// init() 函数定义在 initManager.js 中
// DOMContentLoaded 事件监听器也在 initManager.js 中
// 这里不需要重复定义

console.log('[Renderer] Entry point loaded. Initialization handled by initManager.js');

// ============================================
// 版本号更新功能：通过 Shift+点击版本号触发
// ============================================

// 打开版本号更新对话框
function openVersionModal() {
  const modal = document.getElementById('version-update-modal');
  const currentVersionEl = document.getElementById('current-version-display');
  const newVersionInput = document.getElementById('new-version-input');
  
  // 获取当前版本号
  const currentVersion = document.querySelector('.version')?.textContent || 'v2.2.1';
  currentVersionEl.textContent = currentVersion;
  newVersionInput.value = '';
  
  modal.style.display = 'flex';
  newVersionInput.focus();
}

// 关闭版本号更新对话框
function closeVersionModal() {
  const modal = document.getElementById('version-update-modal');
  modal.style.display = 'none';
}

// 更新版本号
async function updateVersion() {
  const newVersionInput = document.getElementById('new-version-input');
  let newVersion = newVersionInput.value.trim();
  
  // 验证版本号格式
  if (!newVersion) {
    alert('请输入新版本号');
    return;
  }
  
  // 自动添加 v 前缀
  if (!newVersion.startsWith('v')) {
    newVersion = 'v' + newVersion;
  }
  
  // 验证格式 x.y.z
  const versionRegex = /^v\d+\.\d+\.\d+$/;
  if (!versionRegex.test(newVersion)) {
    alert('版本号格式不正确，请使用格式: x.y.z (如 2.3.0)');
    return;
  }
  
  try {
    console.log('[Version Update] Calling electronAPI.updateVersion with:', newVersion);
    
    // 检查 API 是否存在
    if (!window.electronAPI || !window.electronAPI.updateVersion) {
      console.error('[Version Update] electronAPI.updateVersion is not available!');
      alert('更新失败: API 不可用，请检查 preload.js 配置');
      return;
    }
    
    // 调用主进程更新版本号
    const result = await window.electronAPI.updateVersion(newVersion);
    console.log('[Version Update] Result:', result);
    
    if (result.success) {
      alert('版本号更新成功！请重启应用以生效。');
      closeVersionModal();
      // 更新当前显示的版本号
      const versionEl = document.querySelector('.version');
      if (versionEl) {
        versionEl.textContent = newVersion;
      }
    } else {
      alert('更新失败: ' + result.error);
    }
  } catch (error) {
    console.error('[Version Update] Error:', error);
    alert('更新失败: ' + error.message);
  }
}
