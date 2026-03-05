// 禁用所有 console 输出以避免 EIO 错误
console.log = () => {};
console.warn = () => {};
console.error = () => {};
console.info = () => {};
console.debug = () => {};

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 配置操作
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getLastModel: () => ipcRenderer.invoke('get-last-model'),
  
  // 日志操作
  getLogs: () => ipcRenderer.invoke('get-logs'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),
  openLogsDirectory: () => ipcRenderer.invoke('open-logs-directory'),
  onLogUpdated: (callback) => ipcRenderer.on('log-updated', (event, log) => callback(log)),
  
  // 请求追踪
  getRequestHistory: () => ipcRenderer.invoke('get-request-history'),
  clearRequests: () => ipcRenderer.invoke('clear-requests'),
  onRequestTracked: (callback) => {
    // 移除旧监听器，防止重复注册
    ipcRenderer.removeAllListeners('request-tracked');
    ipcRenderer.on('request-tracked', (event, entry) => callback(entry));
  },
  trackRequest: (data) => ipcRenderer.send('track-request', data),
  
  // 备份操作
  backupConfig: (isInitBackup = false) => ipcRenderer.invoke('backup-config', isInitBackup),
  backupSingleProvider: (providerId, providerConfig) => ipcRenderer.invoke('backup-single-provider', providerId, providerConfig),
  listBackups: () => ipcRenderer.invoke('list-backups'),
  restoreBackup: (path) => ipcRenderer.invoke('restore-backup', path),
  deleteBackup: (path) => ipcRenderer.invoke('delete-backup', path),
  clearAllBackups: () => ipcRenderer.invoke('clear-all-backups'),
  exportBackups: (backupPaths) => ipcRenderer.invoke('export-backups', backupPaths),
  importBackups: () => ipcRenderer.invoke('import-backups'),
  initializeConfig: () => ipcRenderer.invoke('initialize-config'),
  initializeOpenClawConfig: () => ipcRenderer.invoke('initialize-openclaw-config'),
  openBackupDirectory: (path) => ipcRenderer.invoke('open-backup-directory', path),
  updateBackupNote: (path, note) => ipcRenderer.invoke('update-backup-note', path, note),
  
  // Gateway & 诊断
  getGatewayStatus: () => ipcRenderer.invoke('get-gateway-status'),
  restartGateway: () => ipcRenderer.invoke('restart-gateway'),
  getSessionInfo: () => ipcRenderer.invoke('get-session-info'),
  clearLarkSessions: () => ipcRenderer.invoke('clear-lark-sessions'),
  
  // 更新 & Doctor
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  runDoctor: () => ipcRenderer.invoke('run-doctor'),
  cleanupOpenClawProviders: () => ipcRenderer.invoke('cleanup-openclaw-providers'),
  checkOpenClawConfig: (options) => ipcRenderer.invoke('check-openclaw-config', options),
  checkOpenClawIntegrity: () => ipcRenderer.invoke('check-openclaw-integrity'),
  checkOpenClawApiKeys: () => ipcRenderer.invoke('check-openclaw-apikeys'),
  checkGatewayTokenStatus: () => ipcRenderer.invoke('check-gateway-token-status'),
  cleanupOpenClawProvidersSelective: (providerIds) => ipcRenderer.invoke('cleanup-openclaw-providers-selective', providerIds),
  migrateOpenClawConfig: () => ipcRenderer.invoke('migrate-openclaw-config'),
  // 迁移向导相关 API
  scanOpenClawForMigration: () => ipcRenderer.invoke('scan-openclaw-for-migration'),
  saveMigratedConfig: (data) => ipcRenderer.invoke('save-migrated-config', data),
  testProviderConnection: (data) => ipcRenderer.invoke('test-provider-connection', data),
  runGatewayCommand: (cmd) => ipcRenderer.invoke('run-gateway-command', cmd),
  runSystemCommand: (cmd) => ipcRenderer.invoke('run-system-command', cmd),
  startGatewayScript: () => ipcRenderer.invoke('start-gateway-script'),

  // 其他
  openOpenClawConfigDir: () => ipcRenderer.invoke('open-openclaw-config-dir'),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openSystemTerminal: () => ipcRenderer.invoke('open-system-terminal'),
  openSystemTerminalWithCommand: (command) => ipcRenderer.invoke('open-system-terminal-with-command', command),
  addLog: (level, message, details, logType) => ipcRenderer.invoke('add-log', level, message, details, logType),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // 全局状态栏
  onGlobalStatus: (callback) => ipcRenderer.on('global-status', (event, message, type) => callback(message, type)),

  // API 配置管理
  getPredefinedProviders: () => ipcRenderer.invoke('get-predefined-providers'),
  loadApiConfig: () => ipcRenderer.invoke('load-api-config'),
  loadAuthProfiles: () => ipcRenderer.invoke('load-auth-profiles'), // 【v2.7.5】加载 auth-profiles.json
  saveApiConfig: (config) => ipcRenderer.invoke('save-api-config', config),
  updateProviderConfig: (providerId, config) => ipcRenderer.invoke('update-provider-config', providerId, config),
  removeProviderConfig: (providerId) => ipcRenderer.invoke('remove-provider-config', providerId),
  setActiveProvider: (providerId) => ipcRenderer.invoke('set-active-provider', providerId),
  getActiveProvider: () => ipcRenderer.invoke('get-active-provider'),
  syncToOpenClaw: (providerId, config, force) => ipcRenderer.invoke('sync-to-openclaw', providerId, config, force),
  testApiConnection: (providerId, config) => ipcRenderer.invoke('test-api-connection', providerId, config),
  detectLocalModels: (baseUrl, apiKey) => ipcRenderer.invoke('detect-local-models', baseUrl, apiKey),

  // 平台信息
  platform: process.platform,

  // 开发者工具
  openDevTools: () => ipcRenderer.invoke('open-devtools'),

  // 版本号更新
  updateVersion: (newVersion) => ipcRenderer.invoke('update-version', newVersion),
  
  // 紧急停止模块
  normalStop: () => ipcRenderer.invoke('normalStop'),
  emergencyStop: () => ipcRenderer.invoke('emergencyStop'),
  normalRestore: () => ipcRenderer.invoke('normalRestore'),
  emergencyRestore: () => ipcRenderer.invoke('emergencyRestore'),
  checkTempBackup: () => ipcRenderer.invoke('checkTempBackup'),
  getEmergencyStopState: () => ipcRenderer.invoke('getEmergencyStopState'),
  clearTempBackup: () => ipcRenderer.invoke('clearTempBackup'),
  clearEmergencyStopState: () => ipcRenderer.invoke('clearEmergencyStopState'),
  verifyOpenclawConfig: () => ipcRenderer.invoke('verifyOpenclawConfig'),
  verifyModelsConfig: () => ipcRenderer.invoke('verifyModelsConfig'),
  verifyAuthConfig: () => ipcRenderer.invoke('verifyAuthConfig'),
  verifyGatewayProcess: () => ipcRenderer.invoke('verifyGatewayProcess'),
  verifyGatewayPort: () => ipcRenderer.invoke('verifyGatewayPort'),
  verifyGatewayToken: () => ipcRenderer.invoke('verifyGatewayToken'),
  verifyGatewayHealth: () => ipcRenderer.invoke('verifyGatewayHealth'),
  verifyAIConnection: () => ipcRenderer.invoke('verifyAIConnection'),
  reinstallGateway: () => ipcRenderer.invoke('reinstallGateway'),
  autoRepairGateway: () => ipcRenderer.invoke('autoRepairGateway'),
  repairGatewayFromBackup: () => ipcRenderer.invoke('repairGatewayFromBackup'),
  showNotification: (options) => ipcRenderer.invoke('showNotification', options),
  
  // 【v2.7.5】依赖管理（用于导入导出功能）
  checkDependencies: () => ipcRenderer.invoke('checkDependencies'),
  installDependencies: () => ipcRenderer.invoke('installDependencies')
});
