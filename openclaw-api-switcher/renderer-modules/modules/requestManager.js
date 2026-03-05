// OpenClaw API Switcher - 请求监控模块
// 处理请求历史加载、渲染、筛选和详情展示

// 注意：requestList 和 requestFilter 已在 state.js 中声明为全局变量
// 这里直接使用，不再重复声明

/**
 * 加载请求历史
 */
async function loadRequestHistory() {
  console.log('[RequestManager] 开始加载请求历史...');
  try {
    const requests = await window.electronAPI.getRequestHistory();
    console.log('[RequestManager] 获取到请求历史:', requests?.length || 0, '条');
    requestList = requests || [];
    renderRequests();
  } catch (e) {
    console.error('[RequestManager] 加载请求历史失败:', e);
  }
}

/**
 * 添加请求记录
 * @param {Object} request - 请求记录对象
 */
function addRequest(request) {
  console.log('[RequestManager] addRequest 被调用:', request);
  requestList.unshift(request);
  if (requestList.length > 50) {
    requestList = requestList.slice(0, 50);
  }
  console.log('[RequestManager] 当前请求列表长度:', requestList.length);
  renderRequests();
}

/**
 * 渲染请求列表
 */
function renderRequests() {
  console.log('[RequestManager] renderRequests 被调用，当前列表长度:', requestList.length);
  const container = document.getElementById('requests-container');
  const countEl = document.getElementById('request-count');
  const badgeEl = document.getElementById('request-badge');
  
  if (!container) {
    console.log('[RequestManager] 找不到 requests-container 元素');
    return;
  }
  if (countEl) countEl.textContent = requestList.length + ' 条记录 | 最多 50 条';
  if (badgeEl) badgeEl.textContent = requestList.length;
  
  let filtered = requestList;
  if (requestFilter) {
    const lower = requestFilter.toLowerCase();
    filtered = requestList.filter(r => 
      r.url.toLowerCase().includes(lower) || 
      String(r.status).includes(lower) || 
      r.method.toLowerCase().includes(lower)
    );
  }
  
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-state-icon">📡</div><div class="empty-state-title">暂无请求记录</div></div>';
    return;
  }
  
  container.innerHTML = filtered.map(req => {
    const isError = !req.success || (req.status && req.status >= 400);
    return '<div class="request-row ' + (isError ? 'error' : 'success') + '" onclick="showRequestDetail(\'' + req.id + '\')"><div class="col-seq">' + req.id.substr(-6) + '</div><div class="col-time">' + formatTime(req.timestamp) + '</div><div class="col-method">' + (req.method || 'GET') + '</div><div class="col-url" title="' + escapeHtml(req.url) + '">' + escapeHtml(req.url.substring(0, 50)) + (req.url.length > 50 ? '...' : '') + '</div><div class="col-duration">' + (req.duration || 0) + 'ms</div><div class="col-status">' + (req.status || (req.success ? 'OK' : 'ERR')) + '</div></div>';
  }).join('');
}

/**
 * 显示请求详情
 * @param {string} requestId - 请求ID
 */
function showRequestDetail(requestId) {
  const req = requestList.find(r => r.id === requestId);
  if (!req) return;

  const modal = document.getElementById('request-detail-modal');
  const content = document.getElementById('request-detail-content');
  if (!modal || !content) return;

  const isError = !req.success || (req.status && req.status >= 400);
  const methodClass = 'method-' + (req.method || 'GET').toLowerCase();
  const statusClass = req.success ? 'status-success' : 'status-error';

  // 简化的详情布局，避免样式嵌套
  let html = '<div class="detail-row"><span class="detail-label">ID</span><span class="detail-value mono">' + req.id.substr(-12) + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">时间</span><span class="detail-value">' + formatTime(req.timestamp) + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">方法</span><span class="method-badge ' + methodClass + '">' + (req.method || 'GET') + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">URL</span><span class="detail-value url">' + escapeHtml(req.url) + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">状态</span><span class="status-badge ' + statusClass + '">' + (req.status || 'N/A') + '</span> <span class="status-text">' + (req.success ? '成功' : '失败') + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">耗时</span><span class="detail-value">' + (req.duration || 0) + ' ms</span></div>';

  if (req.error) {
    html += '<div class="detail-row"><span class="detail-label">错误</span><span class="detail-value error">' + escapeHtml(req.error) + '</span></div>';
  }

  // 添加返回数据（如果有）
  if (req.responseData) {
    html += '<div class="detail-section">';

    // 判断是否为错误响应
    if (req.responseData.error && typeof req.responseData.error === 'object') {
      // 错误信息 - 显示为错误卡片
      const error = req.responseData.error;
      const errorCode = error.code || 'unknown_error';
      const errorType = error.type || 'Error';
      const errorMessage = error.message || '未知错误';
      const errorParam = error.param;
      const requestId = req.responseData.request_id;

      html += '<div class="detail-section-title">错误信息</div>';
      html += '<div class="error-card">';

      // 错误代码和类型
      html += '<div class="error-header">';
      html += '<span class="error-code">' + escapeHtml(errorCode) + '</span>';
      html += '<span class="error-type">' + escapeHtml(errorType) + '</span>';
      html += '</div>';

      // 错误消息
      html += '<div class="error-message">' + escapeHtml(errorMessage) + '</div>';

      // 参数（如果有）
      if (errorParam) {
        html += '<div class="error-param"><span class="param-label">参数:</span> ' + escapeHtml(String(errorParam)) + '</div>';
      }

      // 请求 ID（如果有）
      if (requestId) {
        html += '<div class="error-request-id"><span class="param-label">请求 ID:</span> <code>' + escapeHtml(requestId) + '</code></div>';
      }

      html += '</div>';

      // 添加原始 JSON 折叠区域
      html += '<div class="detail-json-toggle" onclick="this.classList.toggle(\'expanded\'); this.nextElementSibling.classList.toggle(\'show\');">📄 查看原始 JSON</div>';
      html += '<div class="detail-json-content"><pre>' + escapeHtml(JSON.stringify(req.responseData, null, 2)) + '</pre></div>';
    }
    // 判断是否为列表响应（模型列表、API 列表等）
    else if ((req.responseData.object === 'list' || req.responseData.object === 'List') && Array.isArray(req.responseData.data) && req.responseData.data.length > 0) {
      // 自适应表格 - 检测所有字段
      const items = req.responseData.data;
      const firstItem = items[0];

      // 收集所有可能的字段（最多显示 6 个主要字段）
      const allFields = new Set();
      items.slice(0, 10).forEach(item => { // 只检查前 10 个项来收集字段
        Object.keys(item).forEach(key => allFields.add(key));
      });

      // 定义字段优先级和显示名称
      const fieldPriority = {
        'id': 'ID',
        'name': '名称',
        'model': '模型',
        'object': '类型',
        'owned_by': '所有者',
        'created': '创建时间',
        'description': '描述',
        'status': '状态',
        'type': '类型'
      };

      // 排序字段：优先显示重要字段
      const sortedFields = Array.from(allFields).sort((a, b) => {
        const aPriority = Object.keys(fieldPriority).indexOf(a);
        const bPriority = Object.keys(fieldPriority).indexOf(b);
        if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
        if (aPriority !== -1) return -1;
        if (bPriority !== -1) return 1;
        return a.localeCompare(b);
      }).slice(0, 6); // 最多显示 6 列

      // 确定列表类型标题
      let listTitle = '数据列表';
      if (firstItem.object === 'model' || firstItem.id?.includes('kimi') || firstItem.id?.includes('gpt') || firstItem.id?.includes('claude')) {
        listTitle = '可用模型';
      } else if (firstItem.object === 'provider' || firstItem.type === 'provider') {
        listTitle = '可用供应商';
      }

      html += '<div class="detail-section-title">' + listTitle + ' (' + items.length + '个)</div>';
      html += '<div class="detail-table-wrapper"><table class="detail-table">';

      // 表头
      html += '<thead><tr>';
      sortedFields.forEach(field => {
        const headerName = fieldPriority[field] || field;
        html += '<th>' + escapeHtml(headerName) + '</th>';
      });
      html += '</tr></thead><tbody>';

      // 表格内容
      items.forEach(item => {
        html += '<tr>';
        sortedFields.forEach(field => {
          let value = item[field];

          // 格式化值
          if (value === null || value === undefined) {
            value = '-';
          } else if (typeof value === 'boolean') {
            value = value ? '是' : '否';
          } else if (typeof value === 'number' && field === 'created') {
            // 时间戳转日期
            const date = new Date(value * 1000);
            value = date.toLocaleDateString('zh-CN');
          } else {
            value = String(value);
            // 截断过长的文本
            if (value.length > 30) {
              value = value.substring(0, 30) + '...';
            }
          }

          // ID 字段使用等宽字体
          const isMono = field === 'id' || field === 'model';
          html += '<td' + (isMono ? ' class="mono"' : '') + '>' + escapeHtml(value) + '</td>';
        });
        html += '</tr>';
      });

      html += '</tbody></table></div>';

      // 添加原始 JSON 折叠区域
      html += '<div class="detail-json-toggle" onclick="this.classList.toggle(\'expanded\'); this.nextElementSibling.classList.toggle(\'show\');">📄 查看原始 JSON</div>';
      html += '<div class="detail-json-content"><pre>' + escapeHtml(JSON.stringify(req.responseData, null, 2)) + '</pre></div>';
    } else {
      // 其他响应 - 显示格式化的 JSON
      html += '<div class="detail-section-title">响应数据</div>';
      html += '<div class="detail-code-block"><pre>' + escapeHtml(JSON.stringify(req.responseData, null, 2)) + '</pre></div>';
    }

    html += '</div>';
  } else {
    html += '<div class="detail-row"><span class="detail-label">响应</span><span class="detail-value muted">无数据</span></div>';
  }

  content.innerHTML = html;
  modal.classList.add('show');
  
  // 添加点击外部关闭事件
  setTimeout(() => {
    document.addEventListener('mousedown', handleRequestDetailClickOutside);
  }, 100);
}

/**
 * 关闭请求详情模态框
 */
function closeRequestDetail() {
  const modal = document.getElementById('request-detail-modal');
  if (modal) modal.classList.remove('show');
  
  // 移除点击外部关闭事件
  document.removeEventListener('mousedown', handleRequestDetailClickOutside);
}

/**
 * 处理请求详情弹窗点击外部关闭
 */
function handleRequestDetailClickOutside(event) {
  const modal = document.getElementById('request-detail-modal');
  if (!modal || !modal.classList.contains('show')) return;
  
  // 如果点击的不是弹窗内部，则关闭
  if (!modal.contains(event.target)) {
    closeRequestDetail();
  }
}

/**
 * 设置请求筛选
 */
function setupRequestFilter() {
  const filterInput = document.getElementById('request-filter');
  if (!filterInput) return;
  
  filterInput.addEventListener('input', (e) => {
    requestFilter = e.target.value.trim();
    renderRequests();
  });
}

let requestTrackingInitialized = false;

/**
 * 初始化请求追踪监听
 */
function initRequestTracking() {
  if (requestTrackingInitialized) {
    console.log('[RequestManager] 请求追踪监听已初始化，跳过');
    return;
  }
  
  console.log('[RequestManager] 初始化请求追踪监听');
  
  // 监听实时请求追踪
  if (window.electronAPI && window.electronAPI.onRequestTracked) {
    window.electronAPI.onRequestTracked((entry) => {
      console.log('[RequestManager] 收到实时请求:', entry);
      addRequest(entry);
    });
    requestTrackingInitialized = true;
    console.log('[RequestManager] 请求追踪监听初始化完成');
  } else {
    console.warn('[RequestManager] onRequestTracked 不可用');
  }
}

/**
 * 【v2.7.5 删除】clearRequests 已移至 eventManager.js
 * 注意：此函数现在由 eventManager.js 提供，使用 StateManager 管理状态
 */
