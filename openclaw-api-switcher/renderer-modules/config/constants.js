// OpenClaw API Switcher - 配置常量
// 提取自 renderer.js，集中管理所有配置常量

// 供应商预设配置
const PROVIDER_PRESETS = {
  moonshot: { category: 'domestic', categoryName: '🇨🇳 国内API', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', icon: '🌙', color: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', description: 'Kimi API', models: [{ id: 'kimi-k2.5', name: 'Kimi K2.5', reasoning: false, contextWindow: 256000 }, { id: 'kimi-k1.5', name: 'Kimi K1.5', reasoning: true, contextWindow: 128000 }] },
  deepseek: { category: 'domestic', categoryName: '🇨🇳 国内API', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', icon: '🐋', color: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%)', description: 'DeepSeek API', models: [{ id: 'deepseek-chat', name: 'DeepSeek V3', reasoning: false, contextWindow: 64000 }, { id: 'deepseek-reasoner', name: 'DeepSeek R1', reasoning: true, contextWindow: 64000 }] },
  aliyun: { category: 'domestic', categoryName: '🇨🇳 国内API', name: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', icon: '☁️', color: 'linear-gradient(135deg, #ea580c 0%, #f97316 50%, #fb923c 100%)', description: '通义千问', models: [{ id: 'qwen-max', name: 'Qwen Max', reasoning: false, contextWindow: 32000 }, { id: 'qwen-coder-plus', name: 'Qwen Coder Plus', reasoning: false, contextWindow: 126000 }, { id: 'qwen-turbo', name: 'Qwen Turbo', reasoning: false, contextWindow: 8000 }] },
  siliconflow: { category: 'domestic', categoryName: '🇨🇳 国内API', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', icon: '💧', color: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)', description: 'SiliconFlow', models: [{ id: 'deepseek-v3', name: 'DeepSeek V3', reasoning: false, contextWindow: 64000 }, { id: 'qwen2.5-72b', name: 'Qwen2.5 72B', reasoning: false, contextWindow: 32000 }] },
  zhipu: { category: 'domestic', categoryName: '🇨🇳 国内API', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', icon: '🏢', color: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 50%, #60a5fa 100%)', description: 'GLM 系列模型', models: [{ id: 'GLM-5', name: 'GLM-5 (官方推荐)', reasoning: true, contextWindow: 200000 }, { id: 'GLM-4.7', name: 'GLM-4.7', reasoning: true, contextWindow: 128000 }, { id: 'GLM-4.6', name: 'GLM-4.6', reasoning: true, contextWindow: 128000 }] },
  openai: { category: 'international', categoryName: '🌍 国际 API', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', icon: '🤖', color: 'linear-gradient(135deg, #065f46 0%, #10b981 50%, #34d399 100%)', description: 'GPT API', models: [{ id: 'gpt-4o', name: 'GPT-4o', reasoning: false, contextWindow: 128000 }, { id: 'gpt-4o-mini', name: 'GPT-4o Mini', reasoning: false, contextWindow: 128000 }, { id: 'o3-mini', name: 'o3-mini', reasoning: true, contextWindow: 200000 }] },
  anthropic: { category: 'international', categoryName: '🌍 国际 API', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', icon: '🅰️', color: 'linear-gradient(135deg, #9a3412 0%, #ea580c 50%, #fb923c 100%)', description: 'Claude API', models: [{ id: 'claude-opus-4', name: 'Claude Opus 4', reasoning: true, contextWindow: 200000 }, { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', reasoning: true, contextWindow: 200000 }, { id: 'claude-haiku-3-5', name: 'Claude Haiku 3.5', reasoning: false, contextWindow: 200000 }] },
  gemini: { category: 'international', categoryName: '🌍 国际 API', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', icon: '💎', color: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)', description: 'Google Gemini API', models: [{ id: 'gemini-pro', name: 'Gemini Pro', reasoning: false, contextWindow: 1000000 }, { id: 'gemini-ultra', name: 'Gemini Ultra', reasoning: true, contextWindow: 1000000 }] },
  groq: { category: 'international', categoryName: '🌍 国际 API', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', icon: '⚡', color: 'linear-gradient(135deg, #dc2626 0%, #f87171 50%, #fca5a5 100%)', description: 'Groq 高速推理', models: [{ id: 'llama-3.1-70b', name: 'Llama 3.1 70B', reasoning: false, contextWindow: 128000 }, { id: 'mixtral-8x7b', name: 'Mixtral 8x7B', reasoning: false, contextWindow: 32000 }] },
  together: { category: 'international', categoryName: '🌍 国际 API', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', icon: '🤝', color: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)', description: 'Together AI', models: [{ id: 'llama-3.1-70b', name: 'Llama 3.1 70B', reasoning: false, contextWindow: 128000 }] },
  azure: { category: 'international', categoryName: '🌍 国际 API', name: 'Azure OpenAI', baseUrl: 'https://your-resource.openai.azure.com/openai/deployments', icon: '☁️', color: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 50%, #38bdf8 100%)', description: 'Azure OpenAI Service', models: [{ id: 'gpt-4', name: 'GPT-4', reasoning: false, contextWindow: 128000 }, { id: 'gpt-35-turbo', name: 'GPT-3.5 Turbo', reasoning: false, contextWindow: 16000 }] },
  minimax: { category: 'domestic', categoryName: '🇨🇳 国内API', name: 'MiniMax', baseUrl: 'https://api.minimax.com/v1', icon: '🎭', color: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c084fc 100%)', description: 'MiniMax M2.5', models: [{ id: 'MiniMax-M2.5', name: 'MiniMax M2.5', reasoning: true, contextWindow: 200000 }] },
  baidu: { category: 'domestic', categoryName: '🇨🇳 国内API', name: '百度文心', baseUrl: 'https://qianfan.baidubce.com/v2', icon: '🐻', color: 'linear-gradient(135deg, #dc2626 0%, #ef4444 50%, #f87171 100%)', description: '文心一言', models: [{ id: 'ernie-4.0', name: 'ERNIE 4.0', reasoning: false, contextWindow: 128000 }, { id: 'ernie-3.5', name: 'ERNIE 3.5', reasoning: false, contextWindow: 128000 }] },
  xfyun: { category: 'domestic', categoryName: '🇨🇳 国内API', name: '讯飞星火', baseUrl: 'https://spark-api-open.xf-yun.com/v1', icon: '🔥', color: 'linear-gradient(135deg, #ea580c 0%, #f97316 50%, #fb923c 100%)', description: '星火大模型', models: [{ id: 'spark-4.0', name: 'Spark 4.0', reasoning: false, contextWindow: 128000 }, { id: 'spark-3.5', name: 'Spark 3.5', reasoning: false, contextWindow: 128000 }] },
  volcano: { category: 'domestic', categoryName: '🇨🇳 国内API', name: '火山引擎', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', icon: '🌋', color: 'linear-gradient(135deg, #dc2626 0%, #ea580c 50%, #f97316 100%)', description: '豆包大模型', models: [{ id: 'doubao-pro', name: 'Doubao Pro', reasoning: false, contextWindow: 128000 }, { id: 'doubao-lite', name: 'Doubao Lite', reasoning: false, contextWindow: 128000 }] },
  stepfun: { category: 'domestic', categoryName: '🇨🇳 国内API', name: '阶跃星辰', baseUrl: 'https://api.stepfun.com/v1', icon: '⭐', color: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)', description: 'Step 系列模型', models: [{ id: 'step-2', name: 'Step 2', reasoning: true, contextWindow: 128000 }, { id: 'step-1.5', name: 'Step 1.5', reasoning: false, contextWindow: 128000 }] },
  tencent: { category: 'domestic', categoryName: '🇨🇳 国内API', name: '腾讯云', baseUrl: 'https://hunyuan.tencentcloudapi.com/v1', icon: '☁️', color: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 50%, #38bdf8 100%)', description: '混元大模型', models: [{ id: 'hunyuan-pro', name: 'Hunyuan Pro', reasoning: false, contextWindow: 128000 }, { id: 'hunyuan-standard', name: 'Hunyuan Standard', reasoning: false, contextWindow: 128000 }] },
  ollama: { category: 'local', categoryName: '🏠 本地/局域网', name: 'Ollama', baseUrl: 'http://localhost:11434/v1', icon: '🖥️', color: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', description: '本地大模型运行环境', isLocal: true, customUrl: true, noApiKey: true, models: [] },
  vllm: { category: 'local', categoryName: '🏠 本地/局域网', name: 'vLLM', baseUrl: 'http://localhost:8000/v1', icon: '⚡', color: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', description: '高性能推理引擎', isLocal: true, customUrl: true, models: [] },
  lmstudio: { category: 'local', categoryName: '🏠 本地/局域网', name: 'LM Studio', baseUrl: 'http://localhost:1234/v1', icon: '🏠', color: 'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)', description: '本地模型管理工具', isLocal: true, customUrl: true, noApiKey: true, models: [] }
};

// 图标选项
const ICON_OPTIONS = ['🌙', '🐋', '☁️', '💧', '🏢', '🤖', '🅰️', '💎', '⚡', '🤝', '🦙', '🔧', '💻', '⚙️', '🌟', '🎨', '🎯', '🚀', '🔆', '💡'];

// 本地/局域网供应商专用图标（更温馨、家庭感）
const LOCAL_ICON_OPTIONS = ['🏠', '🖥️', '🔌', '📡', '💾', '🔧', '⚙️', '🖱️', '⌨️', '📟', '💿', '📀', '💽', '🗄️', '📂', '📁'];

// 现代渐变色选项 - 30种鲜艳色系，适合深色背景
const COLOR_OPTIONS = [
  /* ===== 霓虹紫粉系 (6种) ===== */
  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',  /* 紫罗兰霓虹 */
  'linear-gradient(135deg, #8b5cf6 0%, #a855f7 50%, #d946ef 100%)',  /* 紫粉渐变 */
  'linear-gradient(135deg, #a855f7 0%, #d946ef 50%, #ec4899 100%)',  /* 粉紫霓虹 */
  'linear-gradient(135deg, #6366f1 0%, #7c3aed 50%, #9333ea 100%)',  /* 深紫电光 */
  'linear-gradient(135deg, #7c3aed 0%, #9333ea 50%, #c026d3 100%)',  /* 电光紫 */
  'linear-gradient(135deg, #9333ea 0%, #c026d3 50%, #db2777 100%)',  /* 霓虹粉 */

  /* ===== 赛博青蓝系 (6种) ===== */
  'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%)',  /* 青蓝赛博 */
  'linear-gradient(135deg, #3b82f6 0%, #06b6d4 50%, #14b8a6 100%)',  /* 蓝青极光 */
  'linear-gradient(135deg, #14b8a6 0%, #06b6d4 50%, #3b82f6 100%)',  /* 极光绿蓝 */
  'linear-gradient(135deg, #0ea5e9 0%, #22d3ee 50%, #67e8f9 100%)',  /* 冰蓝 */
  'linear-gradient(135deg, #0284c7 0%, #0ea5e9 50%, #38bdf8 100%)',  /* 天蓝 */
  'linear-gradient(135deg, #0369a1 0%, #0284c7 50%, #0ea5e9 100%)',  /* 深海蓝 */

  /* ===== 活力绿系 (6种) ===== */
  'linear-gradient(135deg, #22c55e 0%, #4ade80 50%, #86efac 100%)',  /* 薄荷绿 */
  'linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #4ade80 100%)',  /* 翠绿 */
  'linear-gradient(135deg, #15803d 0%, #16a34a 50%, #22c55e 100%)',  /* 森林绿 */
  'linear-gradient(135deg, #84cc16 0%, #a3e635 50%, #bef264 100%)',  /* 青柠绿 */
  'linear-gradient(135deg, #65a30d 0%, #84cc16 50%, #a3e635 100%)',  /* 柠檬绿 */
  'linear-gradient(135deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)',  /* 翡翠绿 */

  /* ===== 暖阳橙黄系 (6种) ===== */
  'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fdba74 100%)',  /* 活力橙 */
  'linear-gradient(135deg, #ea580c 0%, #f97316 50%, #fb923c 100%)',  /* 深橙 */
  'linear-gradient(135deg, #fbbf24 0%, #fcd34d 50%, #fde047 100%)',  /* 金黄 */
  'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #fcd34d 100%)',  /* 琥珀 */
  'linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)',  /* 暖黄 */
  'linear-gradient(135deg, #ef4444 0%, #f87171 50%, #fca5a5 100%)',  /* 珊瑚红 */

  /* ===== 玫瑰红粉系 (6种) ===== */
  'linear-gradient(135deg, #e11d48 0%, #f43f5e 50%, #fb7185 100%)',  /* 玫瑰红 */
  'linear-gradient(135deg, #be123c 0%, #e11d48 50%, #f43f5e 100%)',  /* 深玫瑰 */
  'linear-gradient(135deg, #f43f5e 0%, #fb7185 50%, #fda4af 100%)',  /* 粉红 */
  'linear-gradient(135deg, #db2777 0%, #ec4899 50%, #f472b6 100%)',  /* 品红 */
  'linear-gradient(135deg, #be185d 0%, #db2777 50%, #ec4899 100%)',  /* 深品红 */
  'linear-gradient(135deg, #9f1239 0%, #be123c 50%, #e11d48 100%)'   /* 酒红 */
];

// 本地/局域网供应商专用颜色 - 现代鲜艳系（16种）
const LOCAL_COLOR_OPTIONS = [
  /* 暖色活力系 (8种) */
  'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fdba74 100%)',  /* 活力橙 */
  'linear-gradient(135deg, #fbbf24 0%, #fcd34d 50%, #fde047 100%)',  /* 金黄 */
  'linear-gradient(135deg, #ef4444 0%, #f87171 50%, #fca5a5 100%)',  /* 珊瑚红 */
  'linear-gradient(135deg, #e11d48 0%, #f43f5e 50%, #fb7185 100%)',  /* 玫瑰红 */
  'linear-gradient(135deg, #db2777 0%, #ec4899 50%, #f472b6 100%)',  /* 品红 */
  'linear-gradient(135deg, #84cc16 0%, #a3e635 50%, #bef264 100%)',  /* 青柠绿 */
  'linear-gradient(135deg, #22c55e 0%, #4ade80 50%, #86efac 100%)',  /* 薄荷绿 */
  'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 50%, #5eead4 100%)',  /*  turquoise */

  /* 冷色科技系 (8种) */
  'linear-gradient(135deg, #06b6d4 0%, #22d3ee 50%, #67e8f9 100%)',  /* 青色 */
  'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 50%, #7dd3fc 100%)',  /* 天蓝 */
  'linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #93c5fd 100%)',  /* 蓝 */
  'linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #a5b4fc 100%)',  /* 靛蓝 */
  'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 50%, #c4b5fd 100%)',  /* 紫 */
  'linear-gradient(135deg, #a855f7 0%, #c084fc 50%, #d8b4fe 100%)',  /* 紫罗兰 */
  'linear-gradient(135deg, #d946ef 0%, #e879f9 50%, #f0abfc 100%)',  /* 粉紫 */
  'linear-gradient(135deg, #ec4899 0%, #f472b6 50%, #f9a8d4 100%)'   /* 粉 */
];

// 随机分配图标
function getRandomIcon(isLocal = false) {
  const options = isLocal ? LOCAL_ICON_OPTIONS : ICON_OPTIONS;
  return options[Math.floor(Math.random() * options.length)];
}

// 随机分配颜色
function getRandomColor(isLocal = false) {
  const options = isLocal ? LOCAL_COLOR_OPTIONS : COLOR_OPTIONS;
  return options[Math.floor(Math.random() * options.length)];
}
