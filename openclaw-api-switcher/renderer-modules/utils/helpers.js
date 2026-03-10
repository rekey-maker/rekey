// OpenClaw API Switcher - 工具函数模块
// 通用工具函数集合

/**
 * 格式化数字（添加K/M后缀）
 * @param {number} num - 要格式化的数字
 * @returns {string} 格式化后的字符串
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
  return num.toString();
}

/**
 * 格式化时间为本地时间字符串
 * @param {string} isoString - ISO格式的时间字符串
 * @returns {string} 格式化后的时间 HH:MM:SS
 */
function formatTime(isoString) {
  if (!isoString) return '--:--:--';
  const date = new Date(isoString);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * 格式化持续时间
 * @param {number} ms - 毫秒数
 * @returns {string} 格式化后的持续时间
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
  if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
  return seconds + 's';
}

/**
 * 转义HTML特殊字符
 * @param {string} text - 原始文本
 * @returns {string} 转义后的HTML安全文本
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 转义HTML属性值（用于onclick等属性中）
 * 除了转义HTML特殊字符外，还转义反斜杠，避免Windows路径中的\被当作转义字符
 * @param {string} text - 原始文本
 * @returns {string} 转义后的HTML属性安全文本
 */
function escapeHtmlAttr(text) {
  if (!text) return '';
  // 先进行HTML转义
  const div = document.createElement('div');
  div.textContent = text;
  let escaped = div.innerHTML;
  // 再转义反斜杠（在HTML属性中，反斜杠需要双重转义）
  escaped = escaped.replace(/\\/g, '\\\\');
  return escaped;
}

/**
 * 遮罩API Key（显示前4位和后4位）
 * @param {string} key - API Key
 * @returns {string} 遮罩后的Key
 */
function maskKey(key) {
  if (!key) return '未设置';
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 限制时间（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 深拷贝对象
 * @param {any} obj - 要拷贝的对象
 * @returns {any} 深拷贝后的对象
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(item => deepClone(item));
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 下载JSON数据为文件
 * @param {object} data - 要下载的数据
 * @param {string} filename - 文件名
 */
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} 是否复制成功
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('复制失败:', err);
    return false;
  }
}

/**
 * 解析URL参数
 * @param {string} url - URL字符串
 * @returns {object} 参数对象
 */
function parseUrlParams(url) {
  const params = {};
  const urlObj = new URL(url);
  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/**
 * 检查对象是否为空
 * @param {object} obj - 要检查的对象
 * @returns {boolean} 是否为空
 */
function isEmptyObject(obj) {
  return Object.keys(obj).length === 0;
}

/**
 * 获取文件扩展名
 * @param {string} filename - 文件名
 * @returns {string} 扩展名（不含点）
 */
function getFileExtension(filename) {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
