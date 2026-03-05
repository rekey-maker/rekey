// OpenClaw API Switcher - 全局状态管理
// 集中管理所有全局状态变量

// 配置对象
let config = { models: { providers: {} }, agents: { defaults: { model: {} } } };

// 当前选中的供应商
let selectedProvider = null;

// 日志列表
let logs = [];

// 请求列表
let requestList = [];

// 上次使用的模型
let lastModel = null;

// 保护定时器（秒）
let protectionTimer = 60;

// 当前连接状态: unconfigured, configured, activated
let currentConnectionStatus = 'unconfigured';

// 正在编辑的供应商
let editingProvider = null;

// 当前API Key是否可见
let currentApiKeyVisible = false;

// 备份列表
let backupList = [];

// 当前日志过滤器: user | system | error
let currentLogFilter = 'user';

// 自动连接间隔定时器
let autoConnectionInterval = null;

// 请求筛选关键词
let requestFilter = '';

// ===== 安全切换功能状态 =====
// 待应用的供应商（用户已选择但未同步到 OpenClaw）
let pendingProvider = null;

// 已应用的供应商（已同步到 OpenClaw）
let appliedProvider = null;

// 是否正在应用配置中
let isApplying = false;

// API检测状态: idle, testing, success, error
let apiTestingStatus = 'idle';

// 状态管理对象 - 提供统一的状态访问和修改接口
const StateManager = {
  // 获取配置
  getConfig() {
    return config;
  },

  // 设置配置
  setConfig(newConfig) {
    config = newConfig;
  },

  // 获取选中的供应商
  getSelectedProvider() {
    return selectedProvider;
  },

  // 设置选中的供应商
  setSelectedProvider(provider) {
    selectedProvider = provider;
  },

  // 获取日志列表
  getLogs() {
    return logs;
  },

  // 设置日志列表
  setLogs(newLogs) {
    logs = newLogs;
  },

  // 添加单条日志
  addLog(log) {
    logs.push(log);
  },

  // 获取请求列表
  getRequestList() {
    return requestList;
  },

  // 设置请求列表
  setRequestList(newRequestList) {
    requestList = newRequestList;
  },

  // 获取上次使用的模型
  getLastModel() {
    return lastModel;
  },

  // 设置上次使用的模型
  setLastModel(model) {
    lastModel = model;
  },

  // 获取保护定时器
  getProtectionTimer() {
    return protectionTimer;
  },

  // 设置保护定时器
  setProtectionTimer(timer) {
    protectionTimer = timer;
  },

  // 获取连接状态
  getConnectionStatus() {
    return currentConnectionStatus;
  },

  // 设置连接状态
  setConnectionStatus(status) {
    currentConnectionStatus = status;
  },

  // 获取正在编辑的供应商
  getEditingProvider() {
    return editingProvider;
  },

  // 设置正在编辑的供应商
  setEditingProvider(provider) {
    editingProvider = provider;
  },

  // 获取API Key可见性
  isApiKeyVisible() {
    return currentApiKeyVisible;
  },

  // 设置API Key可见性
  setApiKeyVisible(visible) {
    currentApiKeyVisible = visible;
  },

  // 获取备份列表
  getBackupList() {
    return backupList;
  },

  // 设置备份列表
  setBackupList(newBackupList) {
    backupList = newBackupList;
  },

  // 获取日志过滤器
  getLogFilter() {
    return currentLogFilter;
  },

  // 设置日志过滤器
  setLogFilter(filter) {
    currentLogFilter = filter;
  },

  // 获取自动连接定时器
  getAutoConnectionInterval() {
    return autoConnectionInterval;
  },

  // 设置自动连接定时器
  setAutoConnectionInterval(interval) {
    autoConnectionInterval = interval;
  },

  // 清除自动连接定时器
  clearAutoConnectionInterval() {
    if (autoConnectionInterval) {
      clearInterval(autoConnectionInterval);
      autoConnectionInterval = null;
    }
  },

  // 获取请求筛选关键词
  getRequestFilter() {
    return requestFilter;
  },

  // 设置请求筛选关键词
  setRequestFilter(filter) {
    requestFilter = filter;
  },

  // ===== 安全切换功能方法 =====
  // 获取待应用供应商
  getPendingProvider() {
    return pendingProvider;
  },

  // 设置待应用供应商
  setPendingProvider(provider) {
    pendingProvider = provider;
    console.log('[StateManager] 设置待应用供应商:', provider);
  },

  // 清除待应用供应商
  clearPendingProvider() {
    pendingProvider = null;
    console.log('[StateManager] 清除待应用供应商');
  },

  // 获取已应用供应商
  getAppliedProvider() {
    return appliedProvider;
  },

  // 设置已应用供应商
  setAppliedProvider(provider) {
    appliedProvider = provider;
    console.log('[StateManager] 设置已应用供应商:', provider);
  },

  // 获取是否正在应用中
  getIsApplying() {
    return isApplying;
  },

  // 设置是否正在应用中
  setIsApplying(value) {
    isApplying = value;
    console.log('[StateManager] 设置应用中状态:', value);
  },

  // 获取API检测状态
  getApiTestingStatus() {
    return apiTestingStatus;
  },

  // 设置API检测状态
  setApiTestingStatus(status) {
    apiTestingStatus = status;
    console.log('[StateManager] 设置API检测状态:', status);
  }
};
