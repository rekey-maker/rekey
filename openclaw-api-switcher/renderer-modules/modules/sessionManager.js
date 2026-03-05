// OpenClaw API Switcher - 会话信息管理模块
// 处理会话信息更新、保护定时器等功能

/**
 * 更新会话信息
 */
async function updateSessionInfo() {
  try {
    const info = await window.electronAPI.getSessionInfo();
    // 使用新的字段名 estimatedTokens（从真实会话文件计算）
    const tokenCount = info.estimatedTokens || 0;
    const usage = info.usage || '0.0';
    
    if (document.getElementById('token-count')) document.getElementById('token-count').textContent = tokenCount.toLocaleString();
    if (document.getElementById('startup-time')) document.getElementById('startup-time').textContent = new Date(info.startupTime).toLocaleTimeString();
    if (document.getElementById('uptime')) document.getElementById('uptime').textContent = formatDuration(info.uptime);
    if (document.getElementById('usage-percentage')) document.getElementById('usage-percentage').textContent = usage + '%';
    if (document.getElementById('usage-circle')) document.getElementById('usage-circle').style.setProperty('--usage-percent', usage + '%');
    if (document.getElementById('usage-warning')) document.getElementById('usage-warning').style.display = parseFloat(usage) > 80 ? 'block' : 'none';
  } catch (e) {}
}

/**
 * 更新迷你会话信息
 */
async function updateMiniSessionInfo() {
  try {
    const info = await window.electronAPI.getSessionInfo();
    // 使用新的字段名 estimatedTokens（从真实会话文件计算）
    const tokenCount = info.estimatedTokens || 0;
    const usage = info.usage || '0.0';
    const activeSessions = info.activeSessions || 0;
    
    const tokenEl = document.getElementById('token-count-mini');
    if (tokenEl) tokenEl.textContent = tokenCount.toLocaleString();
    const uptimeEl = document.getElementById('uptime-mini');
    if (uptimeEl) uptimeEl.textContent = formatDuration(info.uptime);
    const circleEl = document.getElementById('usage-circle-mini');
    if (circleEl) circleEl.style.setProperty('--usage-percent', usage + '%');
    const percentEl = document.getElementById('usage-percentage-mini');
    if (percentEl) percentEl.textContent = usage + '%';
    const warningEl = document.getElementById('usage-warning-mini');
    if (warningEl) warningEl.style.display = parseFloat(usage) > 80 ? 'block' : 'none';
    
    // 更新保护状态显示（如果有的话）
    const protectionBadge = document.getElementById('protection-badge-mini');
    if (protectionBadge && typeof StateManager !== 'undefined') {
      const protectionTimer = StateManager.getProtectionTimer();
      if (protectionTimer > 0) {
        protectionBadge.textContent = '⏳ ' + protectionTimer + 's';
      } else {
        protectionBadge.textContent = '✓ 已解除';
        protectionBadge.classList.add('inactive');
      }
    }
    
    // 可选：显示活跃会话数
    console.log(`[SessionManager] 活跃会话: ${activeSessions}, Token: ${tokenCount}, 使用率: ${usage}%`);
  } catch (e) { console.error('[MiniSession] Failed to update:', e); }
}

/**
 * 启动保护定时器
 */
function startProtectionTimer() {
  const timer = document.getElementById('protection-timer'), badge = document.getElementById('protection-badge');
  if (!timer || !badge) return;
  let protectionTimer = StateManager.getProtectionTimer();
  const interval = setInterval(() => {
    protectionTimer--;
    StateManager.setProtectionTimer(protectionTimer);
    timer.textContent = protectionTimer + 's';
    if (protectionTimer <= 0) { clearInterval(interval); timer.textContent = '0s'; badge.textContent = '已解除'; badge.classList.add('inactive'); }
  }, 1000);
}
