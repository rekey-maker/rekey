// API 配置管理模块
// 统一管理所有 API 提供商的配置和密钥

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// 生成 Gateway Token（用于 OpenClaw Gateway 认证）
function generateGatewayToken() {
  return crypto.randomBytes(24).toString('hex');
}

// ============ Gateway Token 管理功能 ============

/**
 * 确保 Gateway Token 存在且一致
 * 处理各种边界情况，包括 remote.token 不存在
 * 
 * @param {Object} config - OpenClaw 配置对象
 * @param {Object} options - 选项
 * @param {boolean} options.generateIfMissing - 如果 token 不存在是否生成新的（默认 true）
 * @returns {Object} - { config, status, message, needsReinstall }
 *   - config: 处理后的配置对象
 *   - status: 'existing' | 'recovered' | 'generated' | 'missing' | 'ensured'
 *   - message: 状态说明
 *   - needsReinstall: 是否需要重新安装 Gateway
 *   - newToken: 如果生成了新 token，返回新 token（可选）
 */
function ensureGatewayToken(config, options = {}) {
  const { generateIfMissing = true } = options;
  
  // 1. 提取现有配置
  const authToken = config.gateway?.auth?.token;
  const remoteToken = config.gateway?.remote?.token;
  const authMode = config.gateway?.auth?.mode;
  
  console.log('[ensureGatewayToken] 当前状态:', {
    authToken: authToken ? '存在' : '缺失',
    remoteToken: remoteToken ? '存在' : '缺失',
    authMode: authMode || '未设置'
  });
  
  // 2. 情况判断
  
  // 情况 A: 完整配置（auth.token 存在且 mode='token'）
  if (authToken && authMode === 'token') {
    // 确保 remote.token 存在且一致
    if (!config.gateway) config.gateway = {};
    if (!config.gateway.remote) config.gateway.remote = {};
    
    config.gateway.remote.token = authToken;
    config.gateway.auth.token = authToken;
    
    return {
      config,
      status: 'existing',
      message: '使用现有 Gateway Token',
      needsReinstall: false
    };
  }
  
  // 情况 B: 只有 remote.token，没有 auth.token
  if (remoteToken && !authToken) {
    if (!config.gateway) config.gateway = {};
    if (!config.gateway.auth) config.gateway.auth = {};
    
    config.gateway.auth.token = remoteToken;
    config.gateway.auth.mode = 'token';
    config.gateway.remote.token = remoteToken;
    
    return {
      config,
      status: 'recovered',
      message: '从 remote.token 恢复 auth.token',
      needsReinstall: false
    };
  }
  
  // 情况 C: 两个 token 都不存在
  if (!authToken && !remoteToken) {
    if (!generateIfMissing) {
      return {
        config,
        status: 'missing',
        message: 'Gateway Token 不存在',
        needsReinstall: true
      };
    }
    
    // 生成新 token
    const newToken = generateGatewayToken();
    
    if (!config.gateway) config.gateway = {};
    if (!config.gateway.auth) config.gateway.auth = {};
    if (!config.gateway.remote) config.gateway.remote = {};
    
    config.gateway.auth.token = newToken;
    config.gateway.auth.mode = 'token';
    config.gateway.remote.token = newToken;
    
    return {
      config,
      status: 'generated',
      message: '生成新的 Gateway Token（需要重新安装 Gateway）',
      needsReinstall: true,
      newToken: newToken
    };
  }
  
  // 默认情况：确保结构完整
  if (!config.gateway) config.gateway = {};
  if (!config.gateway.auth) config.gateway.auth = {};
  if (!config.gateway.remote) config.gateway.remote = {};
  
  const token = authToken || remoteToken || generateGatewayToken();
  config.gateway.auth.token = token;
  config.gateway.auth.mode = 'token';
  config.gateway.remote.token = token;
  
  return {
    config,
    status: 'ensured',
    message: '确保 Gateway Token 配置完整',
    needsReinstall: !authToken
  };
}

/**
 * 保存 Gateway Token 到程序配置
 * 用于备份，方便切换供应商时恢复
 * 
 * @param {string} token - Gateway Token
 */
function saveGatewayTokenToAppConfig(token) {
  try {
    const apiConfig = loadApiConfig();
    
    apiConfig.gatewayToken = token;
    apiConfig.gatewayTokenSavedAt = new Date().toISOString();
    
    saveApiConfig(apiConfig);
    console.log('[saveGatewayTokenToAppConfig] Token 已保存到程序配置');
  } catch (e) {
    console.error('[saveGatewayTokenToAppConfig] 保存失败:', e);
  }
}

/**
 * 从程序配置读取 Gateway Token
 * 
 * @returns {string|null} - Token 或 null
 */
function loadGatewayTokenFromAppConfig() {
  try {
    const apiConfig = loadApiConfig();
    return apiConfig.gatewayToken || null;
  } catch (e) {
    return null;
  }
}

/**
 * 检查 Gateway Token 状态
 * 用于系统健康检查
 * 
 * @returns {Object} - 检查结果
 */
function checkGatewayTokenStatus() {
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      return {
        exists: false,
        valid: false,
        status: 'missing_config',
        message: 'OpenClaw 配置文件不存在',
        needsReinstall: false
      };
    }
    
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    const authToken = config.gateway?.auth?.token;
    const remoteToken = config.gateway?.remote?.token;
    const authMode = config.gateway?.auth?.mode;
    
    // 检查各种情况
    if (!authToken && !remoteToken) {
      return {
        exists: true,
        valid: false,
        status: 'missing_token',
        message: 'Gateway Token 不存在',
        needsReinstall: true,
        details: { 
          authToken: !!authToken, 
          remoteToken: !!remoteToken, 
          authMode,
          isConsistent: false  // 【修复】添加一致性字段
        }
      };
    }
    
    // 检查 Token 是否被破坏（紧急停止标记）
    if (authToken && authToken.startsWith('EMERGENCY_STOP_')) {
      return {
        exists: true,
        valid: false,
        status: 'token_destroyed',
        message: 'Token 已被破坏（紧急停止）',
        needsReinstall: false,
        details: { 
          authToken: authToken.substring(0, 20) + '...',
          authMode,
          isConsistent: false  // 【修复】添加一致性字段
        }
      };
    }
    
    // 【v2.7.5 修复】只有当两个 token 都存在时才检查一致性
    if (authToken && remoteToken && authToken !== remoteToken) {
      return {
        exists: true,
        valid: false,
        status: 'mismatch',
        message: 'auth.token 和 remote.token 不一致',
        needsReinstall: false,
        details: { 
          authToken: authToken.substring(0, 8) + '...', 
          remoteToken: remoteToken.substring(0, 8) + '...',
          authMode,
          isConsistent: false  // 【修复】明确标记为不一致
        }
      };
    }
    
    if (authToken && authMode !== 'token') {
      return {
        exists: true,
        valid: false,
        status: 'wrong_mode',
        message: `auth.mode 不正确（当前: ${authMode}，应为: token）`,
        needsReinstall: false,
        details: { 
          authMode,
          authToken: authToken ? authToken.substring(0, 8) + '...' : null,
          remoteToken: remoteToken ? remoteToken.substring(0, 8) + '...' : null,
          isConsistent: authToken === remoteToken  // 【修复】添加一致性字段
        }
      };
    }
    
    // 【v2.7.5 修复】一致性判断：只有当两个 token 都存在且相等时才认为一致
    const isConsistent = !!(authToken && remoteToken && authToken === remoteToken);

    return {
      exists: true,
      valid: true,
      status: 'valid',
      message: 'Gateway Token 正常',
      needsReinstall: false,
      details: {
        authToken: authToken ? authToken.substring(0, 8) + '...' : null,
        remoteToken: remoteToken ? remoteToken.substring(0, 8) + '...' : null,
        authMode,
        isConsistent  // 【修复】只有当两个 token 都存在且相等时才为 true
      }
    };
  } catch (e) {
    return {
      exists: false,
      valid: false,
      status: 'error',
      message: `检查失败: ${e.message}`,
      needsReinstall: false
    };
  }
}

// ============ API Key 加密功能 ============

// 获取机器特征（网卡MAC前8位，移除冒号）
function getMachineId() {
  try {
    const interfaces = os.networkInterfaces();
    for (const ifaceList of Object.values(interfaces)) {
      for (const iface of ifaceList) {
        if (!iface.internal && iface.mac) {
          // 移除MAC地址中的冒号，取前8位
          return iface.mac.replace(/:/g, '').slice(0, 8).toLowerCase();
        }
      }
    }
  } catch (e) {}
  return crypto.createHash('md5').update(os.homedir()).digest('hex').slice(0, 8);
}

// 派生加密密钥
function deriveKey() {
  return crypto.pbkdf2Sync(getMachineId(), 'openclaw-salt', 10000, 32, 'sha256');
}

// 加密单个 API Key
function encryptApiKey(text) {
  if (!text || typeof text !== 'string') return text;
  // 使用 enc: 前缀标记密文，避免与包含冒号的明文混淆
  if (text.startsWith('enc:')) return text;
  try {
    const key = deriveKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // 格式: enc:iv:tag:encrypted
    return `enc:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
  } catch (e) {
    console.error('[crypto] 加密失败:', e.message);
    return text;
  }
}

// 解密单个 API Key
function decryptApiKey(encrypted) {
  if (!encrypted || typeof encrypted !== 'string') return encrypted;
  // 检查 enc: 前缀
  if (!encrypted.startsWith('enc:')) return encrypted;
  try {
    const parts = encrypted.slice(4).split(':');
    if (parts.length !== 3) return encrypted;
    const [iv, tag, data] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
  } catch (e) {
    console.error('[crypto] 解密失败:', e.message);
    return null;
  }
}

// 批量加密配置（用于备份）
function encryptConfig(config) {
  const result = JSON.parse(JSON.stringify(config));
  for (const p of Object.values(result.providers || {})) {
    if (p.apiKey) p.apiKey = encryptApiKey(p.apiKey);
  }
  return result;
}

// 批量解密配置（用于恢复）
function decryptConfig(config) {
  const result = JSON.parse(JSON.stringify(config));
  for (const p of Object.values(result.providers || {})) {
    if (p.apiKey) p.apiKey = decryptApiKey(p.apiKey);
  }
  return result;
}

// API Switcher 配置目录（保存在项目目录中）
const API_SWITCHER_DIR = path.join(__dirname, 'config');
const API_CONFIG_PATH = path.join(API_SWITCHER_DIR, 'api-config.json');

// OpenClaw 配置路径
const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');
const OPENCLAW_MODELS_PATH = path.join(OPENCLAW_DIR, 'agents/main/agent/models.json');
const OPENCLAW_AUTH_PATH = path.join(OPENCLAW_DIR, 'agents/main/agent/auth-profiles.json');

// OpenClaw 默认配置模板路径
const OPENCLAW_DEFAULT_TEMPLATE_PATH = path.join(__dirname, 'config', 'templates', 'openclaw-default.json');

// 加载 OpenClaw 默认配置模板
function loadOpenClawDefaultTemplate() {
  try {
    if (fs.existsSync(OPENCLAW_DEFAULT_TEMPLATE_PATH)) {
      return JSON.parse(fs.readFileSync(OPENCLAW_DEFAULT_TEMPLATE_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[template] 加载默认模板失败:', e.message);
  }
  // 返回最小默认配置（备用）
  return {
    wizard: {},
    commands: { native: 'auto', nativeSkills: 'auto', restart: true, ownerDisplay: 'raw' },
    gateway: { mode: 'local', auth: { mode: 'token', token: '' } },
    meta: {},
    auth: { profiles: {} },
    models: { providers: {} },
    agents: { defaults: { model: {} } }
  };
}

// 深度合并对象（辅助函数）
function deepMerge(target, source) {
  const result = JSON.parse(JSON.stringify(target)); // 深拷贝目标
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// 检测 OpenClaw 配置是否完整（是否包含官方关键字段）
function isOpenClawConfigComplete(config) {
  // 检查关键字段是否存在
  const hasWizard = !!(config.wizard && typeof config.wizard === 'object');
  const hasCommands = !!(config.commands && typeof config.commands === 'object');
  const hasMeta = !!(config.meta && typeof config.meta === 'object');
  const hasGateway = !!(config.gateway?.auth?.mode === 'token' && config.gateway?.auth?.token);
  
  // 如果至少有以下字段，认为是官方完整配置
  const isComplete = hasGateway && (hasWizard || hasCommands || hasMeta);
  
  if (isComplete) {
    console.log('[check] OpenClaw 配置完整，无需融合模板');
  } else {
    console.log('[check] OpenClaw 配置不完整，需要融合模板', { 
      hasWizard, hasCommands, hasMeta, hasGateway 
    });
  }
  
  return isComplete;
}

// 使用模板修复 OpenClaw 配置（仅在配置不完整时）
function repairOpenClawConfigWithTemplate(existingConfig) {
  // 检测配置是否完整
  if (isOpenClawConfigComplete(existingConfig)) {
    // 配置完整，只确保 gateway.auth.token 存在
    if (!existingConfig.gateway?.auth?.token) {
      if (!existingConfig.gateway) existingConfig.gateway = {};
      if (!existingConfig.gateway.auth) existingConfig.gateway.auth = {};
      existingConfig.gateway.auth.token = generateGatewayToken();
      console.log('[repair] 配置完整，仅生成 gateway.auth.token');
    }
    return existingConfig;
  }
  
  // 配置不完整，使用模板融合
  console.log('[repair] 配置不完整，开始融合模板');
  const template = loadOpenClawDefaultTemplate();
  
  // 融合模板和现有配置（现有配置优先）
  const repaired = deepMerge(template, existingConfig);
  
  // 确保 gateway.auth.token 存在
  if (!repaired.gateway?.auth?.token) {
    if (!repaired.gateway) repaired.gateway = {};
    if (!repaired.gateway.auth) repaired.gateway.auth = {};
    repaired.gateway.auth.token = generateGatewayToken();
  }
  
  console.log('[repair] 使用模板修复配置完成');
  return repaired;
}

// 预定义的 API 提供商配置
const PREDEFINED_PROVIDERS = {
  // 国内提供商
  domestic: {
    moonshot: {
      name: 'Moonshot',
      icon: '🌙',
      baseUrl: 'https://api.moonshot.cn/v1',
      apiType: 'openai',
      description: 'Kimi 大模型 API',
      models: [
        { id: 'kimi-k2.5', name: 'Kimi K2.5', contextWindow: 256000 },
        { id: 'kimi-k1.5', name: 'Kimi K1.5', contextWindow: 128000 },
        { id: 'kimi-latest', name: 'Kimi Latest', contextWindow: 128000 }
      ]
    },
    aliyun: {
      name: '阿里百炼',
      icon: '☁️',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiType: 'openai',
      description: '通义千问大模型',
      models: [
        { id: 'qwen-max', name: '通义千问 Max', contextWindow: 32000 },
        { id: 'qwen-plus', name: '通义千问 Plus', contextWindow: 32000 },
        { id: 'qwen-turbo', name: '通义千问 Turbo', contextWindow: 32000 },
        { id: 'deepseek-r1', name: 'DeepSeek R1', contextWindow: 64000 },
        { id: 'deepseek-v3', name: 'DeepSeek V3', contextWindow: 64000 }
      ]
    },
    siliconflow: {
      name: '硅基流动',
      icon: '💧',
      baseUrl: 'https://api.siliconflow.cn/v1',
      apiType: 'openai',
      description: 'SiliconFlow 模型平台',
      models: [
        { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', contextWindow: 64000 },
        { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextWindow: 64000 },
        { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5 72B', contextWindow: 32000 }
      ]
    },
    deepseek: {
      name: 'DeepSeek',
      icon: '🐋',
      baseUrl: 'https://api.deepseek.com/v1',
      apiType: 'openai',
      description: 'DeepSeek 大模型',
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek V3', contextWindow: 64000 },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1', contextWindow: 64000 }
      ]
    },
    zhipu: {
      name: '智谱清言',
      icon: '🏢',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiType: 'openai',
      description: 'GLM 系列大模型',
      models: [
        { id: 'GLM-5', name: 'GLM-5 (官方推荐)', contextWindow: 200000 },
        { id: 'GLM-4.7', name: 'GLM-4.7', contextWindow: 128000 },
        { id: 'GLM-4.6', name: 'GLM-4.6', contextWindow: 128000 }
      ]
    },
    minimax: {
      name: 'MiniMax',
      icon: '🎭',
      baseUrl: 'https://api.minimax.com/v1',
      apiType: 'openai',
      description: 'MiniMax 大模型',
      models: [
        { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', contextWindow: 200000 }
      ]
    },
    baidu: {
      name: '百度千帆',
      icon: '🐻',
      baseUrl: 'https://qianfan.baidubce.com/v2',
      apiType: 'openai',
      description: '文心一言大模型',
      models: [
        { id: 'ernie-4.0', name: 'ERNIE 4.0', contextWindow: 128000 },
        { id: 'ernie-3.5', name: 'ERNIE 3.5', contextWindow: 128000 }
      ]
    },
    xfyun: {
      name: '讯飞星火',
      icon: '🔥',
      baseUrl: 'https://spark-api-open.xf-yun.com/v1',
      apiType: 'openai',
      description: '星火认知大模型',
      models: [
        { id: 'spark-4.0', name: 'Spark 4.0', contextWindow: 128000 },
        { id: 'spark-3.5', name: 'Spark 3.5', contextWindow: 128000 }
      ]
    },
    volcano: {
      name: '火山引擎',
      icon: '🌋',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiType: 'openai',
      description: '豆包大模型',
      models: [
        { id: 'doubao-pro', name: 'Doubao Pro', contextWindow: 128000 },
        { id: 'doubao-lite', name: 'Doubao Lite', contextWindow: 128000 }
      ]
    },
    stepfun: {
      name: '阶跃星辰',
      icon: '⭐',
      baseUrl: 'https://api.stepfun.com/v1',
      apiType: 'openai',
      description: 'Step 系列大模型',
      models: [
        { id: 'step-2', name: 'Step 2', contextWindow: 128000 },
        { id: 'step-1.5', name: 'Step 1.5', contextWindow: 128000 }
      ]
    },
    tencent: {
      name: '腾讯混元',
      icon: '☁️',
      baseUrl: 'https://hunyuan.tencentcloudapi.com/v1',
      apiType: 'openai',
      description: '混元大模型',
      models: [
        { id: 'hunyuan-pro', name: 'Hunyuan Pro', contextWindow: 128000 },
        { id: 'hunyuan-standard', name: 'Hunyuan Standard', contextWindow: 128000 }
      ]
    },
    // 【v2.7.5】添加自定义国内 API 供应商
    custom_domestic: {
      name: '自定义国内 API',
      icon: '🔧',
      baseUrl: 'https://api.example.com/v1',
      apiType: 'openai',
      description: '自定义国内供应商',
      models: [
        { id: 'custom-model', name: '自定义模型', contextWindow: 128000 }
      ],
      isCustom: true
    }
  },
  // 本地/局域网模型
  local: {
    ollama: {
      name: 'Ollama (本地)',
      icon: '🦙',
      baseUrl: 'http://localhost:11434/v1',
      apiType: 'openai',
      description: '本地大模型运行环境',
      models: [
        { id: 'llama3.2', name: 'Llama 3.2', contextWindow: 128000 },
        { id: 'llama3.1', name: 'Llama 3.1', contextWindow: 128000 },
        { id: 'qwen2.5', name: 'Qwen 2.5', contextWindow: 128000 },
        { id: 'mistral', name: 'Mistral', contextWindow: 32000 },
        { id: 'gemma2', name: 'Gemma 2', contextWindow: 8000 },
        { id: 'phi4', name: 'Phi-4', contextWindow: 16000 }
      ],
      isLocal: true
    },
    lmstudio: {
      name: 'LM Studio (本地)',
      icon: '🖥️',
      description: '本地模型管理工具',
      baseUrl: 'http://localhost:1234/v1',
      apiType: 'openai',
      models: [
        { id: 'local-model', name: '本地模型', contextWindow: 128000 }
      ],
      isLocal: true
    },
    custom_local: {
      name: '自定义本地/局域网',
      icon: '🔧',
      description: '自定义本地供应商',
      baseUrl: 'http://localhost:8000/v1',
      apiType: 'openai',
      models: [
        { id: 'custom', name: '自定义模型', contextWindow: 128000 }
      ],
      isLocal: true
    }
  },
  // 国外提供商
  international: {
    openai: {
      name: 'OpenAI',
      icon: '🤖',
      description: 'GPT 系列模型',
      baseUrl: 'https://api.openai.com/v1',
      apiType: 'openai',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
        { id: 'o1', name: 'o1', contextWindow: 128000 },
        { id: 'o1-mini', name: 'o1-mini', contextWindow: 128000 }
      ]
    },
    anthropic: {
      name: 'Anthropic (Claude)',
      icon: '🅰️',
      description: 'Claude 系列模型',
      baseUrl: 'https://api.anthropic.com/v1',
      apiType: 'anthropic',
      models: [
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000 },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000 },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindow: 200000 }
      ]
    },
    gemini: {
      name: 'Google Gemini',
      icon: '💎',
      description: 'Gemini 系列模型',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiType: 'openai',
      models: [
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 2000000 },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextWindow: 1000000 }
      ]
    },
    together: {
      name: 'Together AI',
      icon: '🤝',
      description: '开源模型推理平台',
      baseUrl: 'https://api.together.xyz/v1',
      apiType: 'openai',
      models: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B', contextWindow: 128000 },
        { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B', contextWindow: 128000 },
        { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', contextWindow: 64000 }
      ]
    },
    groq: {
      name: 'Groq',
      icon: '⚡',
      description: '高速推理服务',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiType: 'openai',
      models: [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextWindow: 128000 },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', contextWindow: 32768 },
        { id: 'gemma2-9b-it', name: 'Gemma 2 9B', contextWindow: 8192 }
      ]
    },
    azure: {
      name: 'Azure OpenAI',
      icon: '☁️',
      description: '微软 Azure 云服务',
      baseUrl: 'https://{your-resource}.openai.azure.com/openai/deployments/{deployment-id}',
      apiType: 'azure',
      models: [
        { id: 'gpt-4', name: 'GPT-4', contextWindow: 128000 },
        { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
        { id: 'gpt-35-turbo', name: 'GPT-3.5 Turbo', contextWindow: 16000 }
      ]
    },
    // 【v2.7.5】添加自定义国际 API 供应商
    custom_international: {
      name: '自定义国际 API',
      icon: '🔧',
      description: '自定义国际供应商',
      baseUrl: 'https://api.example.com/v1',
      apiType: 'openai',
      models: [
        { id: 'custom-model', name: '自定义模型', contextWindow: 128000 }
      ],
      isCustom: true
    }
  },
  // 本地部署
  local: {
    ollama: {
      name: 'Ollama (本地)',
      icon: '🦙',
      baseUrl: 'http://localhost:11434/v1',
      apiType: 'openai',
      models: [
        { id: 'llama3.2', name: 'Llama 3.2', contextWindow: 128000 },
        { id: 'qwen2.5', name: 'Qwen 2.5', contextWindow: 128000 },
        { id: 'deepseek-r1', name: 'DeepSeek R1', contextWindow: 64000 },
        { id: 'phi4', name: 'Phi-4', contextWindow: 16000 }
      ],
      noApiKey: true
    },
    vllm: {
      name: 'vLLM (本地服务器)',
      icon: '🔧',
      description: '高性能推理引擎',
      baseUrl: 'http://localhost:8000/v1',
      apiType: 'openai',
      models: [
        { id: 'custom-model', name: '自定义模型', contextWindow: 32000 }
      ],
      isLocal: true
    },
    lmstudio: {
      name: 'LM Studio (本地)',
      icon: '💻',
      baseUrl: 'http://localhost:1234/v1',
      apiType: 'openai',
      models: [
        { id: 'local-model', name: '本地模型', contextWindow: 32000 }
      ],
      isLocal: true,
      noApiKey: true
    },
    custom: {
      name: '自定义本地/局域网',
      icon: '⚙️',
      baseUrl: 'http://localhost:8080/v1',
      apiType: 'openai',
      models: [
        { id: 'custom', name: '自定义模型', contextWindow: 32000 }
      ],
      isLocal: true,
      customUrl: true
    }
  }
};

// 确保配置目录存在
function ensureConfigDir() {
  if (!fs.existsSync(API_SWITCHER_DIR)) {
    fs.mkdirSync(API_SWITCHER_DIR, { recursive: true });
  }
}

// 加载 API 配置
function loadApiConfig() {
  ensureConfigDir();
  
  if (!fs.existsSync(API_CONFIG_PATH)) {
    // 创建默认配置
    const defaultConfig = {
      version: 1,
      providers: {},
      activeProvider: null,
      providerOrder: [],
      selectedModel: null,
      lastUpdated: Date.now()
    };
    saveApiConfig(defaultConfig);
    return defaultConfig;
  }
  
  try {
    const data = fs.readFileSync(API_CONFIG_PATH, 'utf8');
    const config = JSON.parse(data);
    // 确保配置结构完整（兼容旧配置）
    if (!config.providers) config.providers = {};
    if (!config.providerOrder) config.providerOrder = [];
    if (!config.version) config.version = 1;
    
    // 解密所有供应商的 API Key
    for (const provider of Object.values(config.providers)) {
      if (provider.apiKey && typeof provider.apiKey === 'string' && provider.apiKey.startsWith('enc:')) {
        provider.apiKey = decryptApiKey(provider.apiKey);
      }
    }
    
    return config;
  } catch (e) {
    console.error('加载 API 配置失败:', e);
    return { version: 1, providers: {}, activeProvider: null, providerOrder: [], selectedModel: null };
  }
}

// 保存 API 配置
function saveApiConfig(config) {
  ensureConfigDir();
  config.lastUpdated = Date.now();
  fs.writeFileSync(API_CONFIG_PATH, JSON.stringify(config, null, 2));
}

// 获取所有预定义提供商（返回深拷贝，防止修改原始对象）
function getPredefinedProviders() {
  return JSON.parse(JSON.stringify(PREDEFINED_PROVIDERS));
}

// 获取特定提供商配置
function getProviderConfig(category, providerId) {
  return PREDEFINED_PROVIDERS[category]?.[providerId];
}

// 添加/更新提供商配置（包括自定义模型）
function updateProviderConfig(providerId, config) {
  const apiConfig = loadApiConfig();
  
  // 加密 API Key（如果不是密文格式）
  if (config.apiKey && typeof config.apiKey === 'string' && !config.apiKey.startsWith('enc:')) {
    config.apiKey = encryptApiKey(config.apiKey);
  }
  
  apiConfig.providers[providerId] = {
    ...config,
    updatedAt: Date.now()
  };
  saveApiConfig(apiConfig);
  return apiConfig;
}

// 删除提供商配置
function removeProviderConfig(providerId) {
  try {
    // 1. 删除本地配置
    const apiConfig = loadApiConfig();
    delete apiConfig.providers[providerId];
    if (apiConfig.activeProvider === providerId) {
      apiConfig.activeProvider = null;
    }
    saveApiConfig(apiConfig);

    // 2. 删除 OpenClaw 配置
    // 2.1 删除 openclaw.json 中的 provider 和 auth profile
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      let openclawConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
      let configChanged = false;
      
      // 删除 models.providers 中的 provider
      if (openclawConfig.models?.providers?.[providerId]) {
        delete openclawConfig.models.providers[providerId];
        configChanged = true;
        console.log(`[remove] 从 openclaw.json 删除 provider: ${providerId}`);
      }
      
      // 删除 auth.profiles 中的 profile
      const profileKey = `${providerId}:default`;
      if (openclawConfig.auth?.profiles?.[profileKey]) {
        delete openclawConfig.auth.profiles[profileKey];
        configChanged = true;
        console.log(`[remove] 从 openclaw.json 删除 auth profile: ${profileKey}`);
      }
      
      // 如果删除的是当前激活的 provider，清空 agents.defaults.model.primary
      if (openclawConfig.agents?.defaults?.model?.primary) {
        const currentPrimary = openclawConfig.agents.defaults.model.primary;
        if (currentPrimary.startsWith(providerId + '/')) {
          openclawConfig.agents.defaults.model.primary = '';
          configChanged = true;
          console.log(`[remove] 清空默认模型，因为删除了当前 provider: ${providerId}`);
        }
      }
      
      // 只要有任何修改，先填充模板保持结构完整，再保存
      if (configChanged) {
        // 每次删除都填充模板字段（保持配置结构完整）
        console.log(`[remove] 删除操作后填充模板字段保持结构完整`);
        openclawConfig = repairOpenClawConfigWithTemplate(openclawConfig);
        
        // 按照官方顺序重新排列配置字段
        const orderedConfig = {
          wizard: openclawConfig.wizard,
          auth: openclawConfig.auth,
          models: openclawConfig.models,
          agents: openclawConfig.agents,
          commands: openclawConfig.commands,
          gateway: openclawConfig.gateway,
          meta: openclawConfig.meta
        };
        
        fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedConfig, null, 2));
        console.log(`[remove] 已保存 openclaw.json（按官方顺序）`);
      }
    }

    // 2.2 删除 auth-profiles.json 中的 profile
    if (fs.existsSync(OPENCLAW_AUTH_PATH)) {
      const authProfiles = JSON.parse(fs.readFileSync(OPENCLAW_AUTH_PATH, 'utf8'));
      const profileKey = `${providerId}:default`;
      if (authProfiles.profiles?.[profileKey]) {
        delete authProfiles.profiles[profileKey];
        fs.writeFileSync(OPENCLAW_AUTH_PATH, JSON.stringify(authProfiles, null, 2));
      }
    }

    // 2.3 删除 models.json 中的 provider
    if (fs.existsSync(OPENCLAW_MODELS_PATH)) {
      const modelsConfig = JSON.parse(fs.readFileSync(OPENCLAW_MODELS_PATH, 'utf8'));
      if (modelsConfig.providers?.[providerId]) {
        delete modelsConfig.providers[providerId];
        fs.writeFileSync(OPENCLAW_MODELS_PATH, JSON.stringify(modelsConfig, null, 2));
      }
    }

    return { success: true, message: '删除成功' };
  } catch (error) {
    console.error('删除 Provider 配置失败:', error);
    return { success: false, message: error.message };
  }
}

// 设置活跃提供商
function setActiveProvider(providerId) {
  const apiConfig = loadApiConfig();
  apiConfig.activeProvider = providerId;
  saveApiConfig(apiConfig);
  return apiConfig;
}

// 获取活跃提供商
function getActiveProvider() {
  const apiConfig = loadApiConfig();
  return apiConfig.activeProvider;
}

// 缓存上一次的同步状态，避免重复写入
let lastSyncState = {
  providerId: null,
  modelId: null,
  baseUrl: null,
  timestamp: 0
};

/**
 * 检查是否需要同步到 OpenClaw
 * 通过比较当前配置和上次同步的配置，避免不必要的写入
 */
function shouldSyncToOpenClaw(providerId, providerConfig) {
  // 获取第一个模型作为默认模型
  const firstModel = providerConfig.models?.[0];
  const modelId = firstModel?.id;
  const baseUrl = providerConfig.baseUrl;
  
  // 检查是否和上次同步的配置相同
  const shouldSync = 
    lastSyncState.providerId !== providerId ||
    lastSyncState.modelId !== modelId ||
    lastSyncState.baseUrl !== baseUrl;
  
  if (!shouldSync) {
    console.log(`[sync] 配置未变化，跳过同步: ${providerId}/${modelId}`);
    return false;
  }
  
  return true;
}

/**
 * 更新同步状态缓存
 */
function updateSyncState(providerId, providerConfig) {
  const firstModel = providerConfig.models?.[0];
  lastSyncState = {
    providerId,
    modelId: firstModel?.id,
    baseUrl: providerConfig.baseUrl,
    timestamp: Date.now()
  };
}

// 同步到 OpenClaw 配置
async function syncToOpenClaw(providerId, providerConfig, force = false) {
  try {
    // 检查是否需要同步（避免频繁切换时重复写入）
    // force=true 时强制同步，跳过检查
    if (!force && !shouldSyncToOpenClaw(providerId, providerConfig)) {
      return { success: true, skipped: true };
    }
    
    console.log(`[sync] 开始同步到 OpenClaw: ${providerId}${force ? ' (强制同步)' : ''}`);
    
    // 解密 API Key（如果是密文格式）
    let apiKey = providerConfig.apiKey;
    if (apiKey && typeof apiKey === 'string' && apiKey.startsWith('enc:')) {
      apiKey = decryptApiKey(apiKey);
      console.log(`[sync] 已解密 API Key`);
    }
    
    // 读取 OpenClaw 配置
    let openclawConfig = {};
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      openclawConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    }
    
    // 如果配置不完整（如首次添加），填充模板
    if (!isOpenClawConfigComplete(openclawConfig)) {
      console.log(`[sync] 配置不完整，填充模板`);
      openclawConfig = repairOpenClawConfigWithTemplate(openclawConfig);
    } else {
      console.log(`[sync] 配置已完整，直接写入数据`);
    }

    // ========== 【新增】Gateway Token 管理 ==========
    const tokenResult = ensureGatewayToken(openclawConfig, {
      generateIfMissing: true
    });
    
    openclawConfig = tokenResult.config;
    
    // 如果需要重新安装 Gateway，记录日志和状态
    if (tokenResult.needsReinstall) {
      console.log(`[sync] ⚠️ ${tokenResult.message}`);
      // 注意：这里不直接调用 sendGlobalStatus，因为 api-config.js 无法访问主进程的 sendGlobalStatus
      // 而是通过返回值让调用方处理
    } else {
      console.log(`[sync] ✅ ${tokenResult.message}`);
    }
    
    // 保存 token 到程序配置（用于备份）
    saveGatewayTokenToAppConfig(openclawConfig.gateway.auth.token);
    
    // 读取 auth-profiles
    let authProfiles = { version: 1, profiles: {}, lastGood: {} };
    if (fs.existsSync(OPENCLAW_AUTH_PATH)) {
      authProfiles = JSON.parse(fs.readFileSync(OPENCLAW_AUTH_PATH, 'utf8'));
    }

    // ========== 清理程序私有字段（避免污染 OpenClaw 配置）==========
    // 删除可能从备份或旧版本残留的字段
    delete openclawConfig.apiSwitcher;
    delete openclawConfig._backup;
    console.log(`[sync] 清理程序私有字段: apiSwitcher, _backup`);

    // ========== 清除所有旧的配置，只保留当前供应商 ==========
    console.log(`[sync] 清除旧配置，当前 providers: ${Object.keys(openclawConfig.models?.providers || {}).join(', ')}`);

    // 1. 清除 openclaw.json 中的其他 providers（无论是否存在，都清空）
    if (!openclawConfig.models) openclawConfig.models = {};
    // 只保留当前 provider，删除其他所有
    const currentProvider = openclawConfig.models.providers?.[providerId];
    openclawConfig.models.providers = {};
    if (currentProvider) {
      openclawConfig.models.providers[providerId] = currentProvider;
      console.log(`[sync] 保留现有 provider: ${providerId}`);
    } else {
      console.log(`[sync] 当前 provider ${providerId} 不存在，将创建新配置`);
    }

    // 2. 清除 auth-profiles 中的其他 profiles
    if (authProfiles.profiles) {
      const currentProfileKey = `${providerId}:default`;
      const currentProfile = authProfiles.profiles[currentProfileKey];
      authProfiles.profiles = {};
      if (currentProfile) {
        authProfiles.profiles[currentProfileKey] = currentProfile;
      }
    }

    // 3. 清除 lastGood 中的其他记录
    if (authProfiles.lastGood) {
      authProfiles.lastGood = { [providerId]: `${providerId}:default` };
    }

    // 4. 清除 openclaw.json auth 中的其他 profiles
    if (openclawConfig.auth?.profiles) {
      const currentProfileKey = `${providerId}:default`;
      const currentAuthProfile = openclawConfig.auth.profiles[currentProfileKey];
      openclawConfig.auth.profiles = {};
      if (currentAuthProfile) {
        openclawConfig.auth.profiles[currentProfileKey] = currentAuthProfile;
      }
    }

    // ========== 更新当前供应商的配置 ==========

    // 更新 auth-profiles（真实 API Key）
    const profileKey = `${providerId}:default`;
    console.log(`[sync] 准备保存 API Key 到 auth-profiles:`, {
      providerId,
      profileKey,
      apiKeyExists: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      apiKeyIsPlaceholder: apiKey === 'e',
      apiKeyIsEmpty: apiKey === ''
    });

    if (apiKey && apiKey !== '' && apiKey !== 'e') {
      authProfiles.profiles[profileKey] = {
        type: 'api_key',
        provider: providerId,
        key: apiKey  // 使用解密后的 apiKey
      };
      authProfiles.lastGood[providerId] = profileKey;
      console.log(`[sync] API Key 已保存到 auth-profiles: ${providerId}`);
    } else {
      console.warn(`[sync] API Key 未保存（无效）: ${providerId}, apiKey=${apiKey}`);
    }

    // 确保目录存在
    const authDir = path.dirname(OPENCLAW_AUTH_PATH);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    // 保存 auth-profiles
    fs.writeFileSync(OPENCLAW_AUTH_PATH, JSON.stringify(authProfiles, null, 2));

    // 更新 openclaw.json（占位符）
    if (!openclawConfig.models) openclawConfig.models = { providers: {} };
    if (!openclawConfig.models.providers) openclawConfig.models.providers = {};

    openclawConfig.models.providers[providerId] = {
      baseUrl: providerConfig.baseUrl,
      apiKey: 'e', // 占位符
      api: providerConfig.apiType === 'anthropic' ? 'anthropic-messages' : 'openai-completions',
      models: providerConfig.models.map(m => ({
        id: m.id,
        name: m.name,
        reasoning: m.id.includes('r1') || m.id.includes('reasoner'),
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.contextWindow || 32000,
        maxTokens: 8192
      }))
    };

    // 更新 auth 配置
    if (!openclawConfig.auth) openclawConfig.auth = { profiles: {} };
    if (!openclawConfig.auth.profiles) openclawConfig.auth.profiles = {};
    openclawConfig.auth.profiles[profileKey] = {
      provider: providerId,
      mode: 'api_key'
    };

    // 更新 agents.defaults.model.primary（当前激活的模型）
    if (!openclawConfig.agents) openclawConfig.agents = { defaults: { model: {} } };
    if (!openclawConfig.agents.defaults) openclawConfig.agents.defaults = { model: {} };
    if (!openclawConfig.agents.defaults.model) openclawConfig.agents.defaults.model = {};
    
    // 使用第一个模型作为默认模型
    console.log(`[sync] providerConfig.models:`, providerConfig.models);
    const firstModel = providerConfig.models?.[0];
    if (firstModel) {
      openclawConfig.agents.defaults.model.primary = `${providerId}/${firstModel.id}`;
      console.log(`[sync] 更新默认模型: ${providerId}/${firstModel.id}`);
    } else {
      console.log(`[sync] 警告: 没有可用的模型`);
    }

    // 按照官方顺序重新排列配置字段
    const orderedConfig = {
      wizard: openclawConfig.wizard,
      auth: openclawConfig.auth,
      models: openclawConfig.models,
      agents: openclawConfig.agents,
      commands: openclawConfig.commands,
      gateway: openclawConfig.gateway,
      meta: openclawConfig.meta
    };

    // 保存 openclaw.json（按官方顺序）
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(orderedConfig, null, 2));

    // 更新 models.json（只包含当前 provider）
    const modelsConfig = {
      providers: {
        [providerId]: {
          baseUrl: providerConfig.baseUrl,
          api: providerConfig.apiType === 'anthropic' ? 'anthropic-messages' : 'openai-completions',
          models: providerConfig.models.map(m => ({
            id: m.id,
            name: m.name,
            reasoning: m.id.includes('r1') || m.id.includes('reasoner'),
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: m.contextWindow || 32000,
            maxTokens: 8192
          })),
          apiKey: 'e' // 占位符
        }
      }
    };

    const modelsDir = path.dirname(OPENCLAW_MODELS_PATH);
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }
    fs.writeFileSync(OPENCLAW_MODELS_PATH, JSON.stringify(modelsConfig, null, 2));

    // 更新同步状态缓存
    updateSyncState(providerId, providerConfig);
    console.log(`[sync] 同步完成，已更新状态缓存`);

    return { 
      success: true, 
      message: '同步成功',
      tokenStatus: tokenResult ? {
        status: tokenResult.status,
        message: tokenResult.message,
        needsReinstall: tokenResult.needsReinstall
      } : null
    };
  } catch (e) {
    console.error('同步到 OpenClaw 失败:', e);
    return { success: false, message: e.message };
  }
}

// 自动检测本地模型列表
async function detectLocalModels(baseUrl, apiKey) {
  try {
    const https = require('https');
    const http = require('http');
    
    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    
    // 构建请求路径
    const path = parsedUrl.pathname.endsWith('/') ? parsedUrl.pathname + 'models' : parsedUrl.pathname + '/models';
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10秒超时
    };
    
    // 只有配置了 API Key 才添加 Authorization header
    if (apiKey && apiKey.trim() !== '') {
      options.headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const response = JSON.parse(data);
              // OpenAI API 格式: { data: [{ id: 'model-name', ... }] }
              // Ollama API 格式: { models: [{ name: 'model-name', ... }] }
              const models = response.data || response.models || [];
              const modelList = models.map(m => ({
                id: m.id || m.name,
                name: m.id || m.name,
                contextWindow: 128000 // 默认上下文窗口
              }));
              resolve({ success: true, models: modelList });
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (e) {
            reject(new Error(`解析响应失败: ${e.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`请求失败: ${error.message}`));
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
      
      req.end();
    });
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// 测试 API 连接
async function testApiConnection(providerId, config) {
  try {
    const https = require('https');
    const http = require('http');
    const url = require('url');

    const startTime = Date.now();

    // 解析 URL
    const parsedUrl = new URL(config.baseUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    // 检测是否为本地/局域网地址
    const isLocal = parsedUrl.hostname === 'localhost' ||
                    parsedUrl.hostname === '127.0.0.1' ||
                    parsedUrl.hostname.startsWith('192.168.') ||
                    parsedUrl.hostname.startsWith('10.') ||
                    parsedUrl.hostname.startsWith('172.');

    // 构建请求路径
    const path = parsedUrl.pathname.endsWith('/') ? parsedUrl.pathname + 'models' : parsedUrl.pathname + '/models';

    // 构建请求选项
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: isLocal ? 30000 : 10000 // 本地模型30秒超时，远程10秒
    };

    // 只有配置了 API Key 才添加 Authorization header
    if (config.apiKey && config.apiKey.trim() !== '') {
      options.headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    
    return new Promise((resolve) => {
      const req = client.request(options, (res) => {
        const latency = Date.now() - startTime;
        let responseData = '';
        let responseSize = 0;
        const maxSize = 100 * 1024; // 最大 100KB

        // 读取响应数据
        res.on('data', (chunk) => {
          responseSize += chunk.length;
          if (responseSize <= maxSize) {
            responseData += chunk.toString('utf8');
          }
        });

        // 响应结束时处理
        res.on('end', () => {
          const requestInfo = {
            url: `${parsedUrl.protocol}//${parsedUrl.hostname}:${options.port}${path}`,
            method: 'GET',
            statusCode: res.statusCode,
            latency: latency,
            responseData: responseData,
            responseSize: responseSize
          };

          if (res.statusCode === 200) {
            resolve({
              success: true,
              latency: latency,
              message: '连接成功',
              requestInfo: requestInfo
            });
          } else if (res.statusCode === 401) {
            resolve({
              success: false,
              message: '401 - API Key 无效或已过期',
              requestInfo: requestInfo
            });
          } else if (res.statusCode === 403) {
            resolve({
              success: false,
              message: '403 - 没有权限访问该 API',
              requestInfo: requestInfo
            });
          } else {
            resolve({
              success: false,
              message: `${res.statusCode} - ${res.statusMessage || '请求失败'}`,
              requestInfo: requestInfo
            });
          }
        });
      });
      
      req.on('error', (error) => {
        const latency = Date.now() - startTime;
        resolve({
          success: false,
          message: `连接错误: ${error.message}`,
          requestInfo: {
            url: `${parsedUrl.protocol}//${parsedUrl.hostname}:${options.port}${path}`,
            method: 'GET',
            statusCode: 0,
            latency: latency,
            error: error.message
          }
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        const latency = Date.now() - startTime;
        resolve({
          success: false,
          message: '连接超时，请检查网络或 API 地址',
          requestInfo: {
            url: `${parsedUrl.protocol}//${parsedUrl.hostname}:${options.port}${path}`,
            method: 'GET',
            statusCode: 0,
            latency: latency,
            error: 'timeout'
          }
        });
      });
      
      req.end();
    });
  } catch (e) {
    return { success: false, message: `测试出错: ${e.message}` };
  }
}

// ========== 大小写不敏感的供应商匹配机制 ==========

/**
 * 查找预定义供应商（大小写不敏感）
 * @param {string} providerId - 用户输入的供应商ID
 * @returns {object|null} - 匹配的供应商配置
 */
function findPredefinedProviderCaseInsensitive(providerId) {
  if (!providerId) return null;
  
  const lowerId = providerId.toLowerCase();
  
  // 遍历所有分类和供应商
  for (const category of Object.values(PREDEFINED_PROVIDERS)) {
    for (const [id, config] of Object.entries(category)) {
      if (id.toLowerCase() === lowerId) {
        return { id, config, category: Object.keys(PREDEFINED_PROVIDERS).find(k => PREDEFINED_PROVIDERS[k] === category) };
      }
    }
  }
  
  return null;
}

/**
 * 规范化供应商ID（统一为小写）
 * @param {string} providerId - 原始供应商ID
 * @returns {string} - 规范化后的ID
 */
function normalizeProviderId(providerId) {
  return providerId ? providerId.toLowerCase() : providerId;
}

/**
 * 加载配置并进行大小写规范化
 * 优先使用本地用户配置，处理大小写冲突
 */
function loadApiConfigNormalized() {
  const config = loadApiConfig();
  const normalizedProviders = {};
  const caseConflicts = [];
  
  // 处理用户配置的供应商
  for (const [providerId, providerConfig] of Object.entries(config.providers || {})) {
    const normalizedId = normalizeProviderId(providerId);
    
    // 检查是否有大小写冲突
    if (normalizedProviders[normalizedId]) {
      caseConflicts.push({
        existing: Object.keys(config.providers).find(id => id.toLowerCase() === normalizedId),
        current: providerId
      });
      // 优先保留已存在的配置（先加载的优先）
      continue;
    }
    
    // 查找预定义供应商（大小写不敏感）
    const predefined = findPredefinedProviderCaseInsensitive(providerId);
    
    // 规范化模型列表
    let normalizedProviderConfig;
    if (predefined) {
      // 使用预定义的ID（保持系统一致性）
      normalizedProviderConfig = {
        ...predefined.config,
        ...providerConfig,
        id: predefined.id, // 使用标准ID
        name: predefined.config.name // 使用标准名称
      };
    } else {
      // 自定义供应商，使用小写ID
      normalizedProviderConfig = {
        ...providerConfig,
        id: normalizedId
      };
    }
    
    // 规范化模型ID（大小写不敏感）
    normalizedProviderConfig = normalizeProviderModels(normalizedProviderConfig);
    
    normalizedProviders[predefined ? predefined.id : normalizedId] = normalizedProviderConfig;
  }
  
  // 记录大小写冲突日志
  if (caseConflicts.length > 0) {
    console.log('[API Config] 发现大小写冲突的供应商:', caseConflicts);
  }
  
  return {
    ...config,
    providers: normalizedProviders,
    _caseConflicts: caseConflicts // 保留冲突信息供调试
  };
}

/**
 * 保存配置前规范化供应商ID
 */
function saveApiConfigNormalized(config) {
  const normalizedConfig = {
    ...config,
    providers: {}
  };
  
  // 规范化所有供应商ID
  for (const [providerId, providerConfig] of Object.entries(config.providers || {})) {
    const normalizedId = normalizeProviderId(providerId);
    
    // 查找预定义供应商获取标准ID
    const predefined = findPredefinedProviderCaseInsensitive(providerId);
    const finalId = predefined ? predefined.id : normalizedId;
    
    normalizedConfig.providers[finalId] = {
      ...providerConfig,
      id: finalId
    };
  }
  
  saveApiConfig(normalizedConfig);
  return normalizedConfig;
}

/**
 * 获取供应商配置（大小写不敏感）
 */
function getProviderConfigCaseInsensitive(providerId) {
  const config = loadApiConfig();
  const normalizedId = normalizeProviderId(providerId);
  
  // 在用户配置中查找
  for (const [id, cfg] of Object.entries(config.providers || {})) {
    if (id.toLowerCase() === normalizedId) {
      // 解密 API Key（如果是密文格式）
      const decryptedCfg = { ...cfg };
      if (decryptedCfg.apiKey && typeof decryptedCfg.apiKey === 'string' && decryptedCfg.apiKey.startsWith('enc:')) {
        decryptedCfg.apiKey = decryptApiKey(decryptedCfg.apiKey) || decryptedCfg.apiKey;
      }
      return { id, config: decryptedCfg };
    }
  }
  
  // 在预定义配置中查找
  const predefined = findPredefinedProviderCaseInsensitive(providerId);
  if (predefined) {
    return { id: predefined.id, config: predefined.config };
  }
  
  return null;
}

// ========== 模型大小写不敏感匹配机制 ==========

/**
 * 规范化模型ID（统一为小写，处理特殊字符）
 * @param {string} modelId - 原始模型ID
 * @returns {string} - 规范化后的ID
 */
function normalizeModelId(modelId) {
  if (!modelId) return modelId;
  // 转为小写，去除首尾空格
  return modelId.toLowerCase().trim();
}

/**
 * 在供应商配置中查找模型（大小写不敏感）
 * @param {object} providerConfig - 供应商配置
 * @param {string} modelId - 模型ID
 * @returns {object|null} - 匹配的模型配置
 */
function findModelCaseInsensitive(providerConfig, modelId) {
  if (!providerConfig || !providerConfig.models || !modelId) return null;
  
  const normalizedId = normalizeModelId(modelId);
  
  // 在模型列表中查找（大小写不敏感）
  for (const model of providerConfig.models) {
    if (normalizeModelId(model.id) === normalizedId) {
      return model;
    }
  }
  
  return null;
}

/**
 * 检查模型是否存在（大小写不敏感）
 * @param {object} providerConfig - 供应商配置
 * @param {string} modelId - 模型ID
 * @returns {boolean}
 */
function modelExistsCaseInsensitive(providerConfig, modelId) {
  return !!findModelCaseInsensitive(providerConfig, modelId);
}

/**
 * 规范化供应商配置中的所有模型ID
 * @param {object} providerConfig - 供应商配置
 * @returns {object} - 规范化后的配置
 */
function normalizeProviderModels(providerConfig) {
  if (!providerConfig || !providerConfig.models) return providerConfig;
  
  const normalizedModels = [];
  const seenIds = new Set();
  
  for (const model of providerConfig.models) {
    const normalizedId = normalizeModelId(model.id);
    
    // 检查大小写冲突
    if (seenIds.has(normalizedId)) {
      console.log(`[API Config] 模型大小写冲突，跳过: ${model.id}`);
      continue;
    }
    
    seenIds.add(normalizedId);
    normalizedModels.push({
      ...model,
      id: normalizedId // 使用规范化后的ID
    });
  }
  
  return {
    ...providerConfig,
    models: normalizedModels
  };
}

/**
 * 获取模型配置（大小写不敏感）
 * @param {string} providerId - 供应商ID
 * @param {string} modelId - 模型ID
 * @returns {object|null} - 模型配置
 */
function getModelConfigCaseInsensitive(providerId, modelId) {
  const provider = getProviderConfigCaseInsensitive(providerId);
  if (!provider) return null;
  
  return findModelCaseInsensitive(provider.config, modelId);
}

module.exports = {
  PREDEFINED_PROVIDERS,
  loadApiConfig,
  saveApiConfig,
  getPredefinedProviders,
  getProviderConfig,
  updateProviderConfig,
  removeProviderConfig,
  setActiveProvider,
  getActiveProvider,
  syncToOpenClaw,
  testApiConnection,
  detectLocalModels,
  API_CONFIG_PATH,
  // Gateway Token 生成函数
  generateGatewayToken,
  // Gateway Token 管理函数
  ensureGatewayToken,
  saveGatewayTokenToAppConfig,
  loadGatewayTokenFromAppConfig,
  checkGatewayTokenStatus,
  // OpenClaw 配置修复函数
  repairOpenClawConfigWithTemplate,
  isOpenClawConfigComplete,
  // OpenClaw 默认模板加载函数
  loadOpenClawDefaultTemplate,
  // 大小写不敏感的匹配功能
  findPredefinedProviderCaseInsensitive,
  normalizeProviderId,
  loadApiConfigNormalized,
  saveApiConfigNormalized,
  getProviderConfigCaseInsensitive,
  // 模型大小写不敏感匹配功能
  normalizeModelId,
  findModelCaseInsensitive,
  modelExistsCaseInsensitive,
  normalizeProviderModels,
  getModelConfigCaseInsensitive,
  // API Key 加密函数
  encryptApiKey,
  decryptApiKey,
  encryptConfig,
  decryptConfig
};
