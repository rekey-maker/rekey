// OpenClaw API Switcher - 终端命令管理模块
// 处理 Gateway 命令执行、终端输出高亮、系统命令等功能

// 危险命令配置
const DANGEROUS_COMMANDS = {
  'kill': {
    warning: '⚠️ 危险操作：强制终止 Gateway 进程',
    consequence: '所有正在进行的对话和任务将立即中断，可能导致数据丢失',
    recovery: '需要手动执行 "openclaw start" 重新启动 Gateway',
    time: '立即生效，约 1-3 秒完成'
  },
  'uninstall': {
    warning: '⚠️ 危险操作：卸载 OpenClaw',
    consequence: '将删除所有配置和数据，包括 API 密钥、模型设置等',
    recovery: '需要重新安装并配置所有内容',
    time: '约 10-30 秒完成'
  },
  'reset': {
    warning: '⚠️ 危险操作：重置所有配置',
    consequence: '所有自定义设置将被清除，恢复到初始状态',
    recovery: '需要重新配置所有 Provider 和模型',
    time: '约 5-10 秒完成'
  },
  'gateway install --force': {
    warning: '⚠️ 危险操作：强制安装 Gateway 系统服务',
    consequence: '将覆盖现有的 Gateway 配置和服务，可能导致配置丢失',
    recovery: '需要重新配置 Gateway 参数',
    time: '约 30-60 秒完成'
  },
  'gateway start': {
    warning: '⚠️ 慎用操作：单独启动 Gateway 服务',
    consequence: '如果服务未正确停止，可能导致端口冲突或服务异常',
    recovery: '建议使用 "openclaw gateway restart" 代替，更安全可靠',
    time: '约 10-30 秒完成'
  },
  'gateway stop': {
    warning: '⚠️ 慎用操作：单独停止 Gateway 服务',
    consequence: '强制停止可能导致资源未正确释放，影响后续启动',
    recovery: '建议使用 "openclaw gateway restart" 代替，更安全可靠',
    time: '约 5-10 秒完成'
  }
};

/**
 * 运行 Gateway 命令
 * @param {string} cmd - 命令
 */
async function runGatewayCommand(cmd) {
  console.log('[Gateway] Running command:', cmd);
  const outputEl = document.getElementById('gateway-output');
  if (!outputEl) return;

  // 【修复】先显示简化命令，等执行完成后再显示完整路径
  const isWin = navigator.platform.toLowerCase().includes('win');
  let displayCmd;
  if (isWin) {
    displayCmd = cmd.startsWith('openclaw') ? cmd.replace('openclaw', 'node openclaw.mjs') : 'node openclaw.mjs ' + cmd;
  } else {
    displayCmd = cmd.startsWith('openclaw') ? cmd : 'openclaw ' + cmd;
  }
  outputEl.innerHTML = '<div class="term-line"><span class="term-prompt">$</span> <span class="term-command">' + escapeHtml(displayCmd) + '</span></div><div class="term-line term-dim">执行中...</div>';
  outputEl.scrollTop = 0;

  try {
    const result = await window.electronAPI.runGatewayCommand(cmd);

    // 移除"执行中..."提示
    const loadingLine = outputEl.querySelector('.term-dim');
    if (loadingLine) loadingLine.remove();

    let outputHtml = '';
    if (result.output) {
      outputHtml = highlightTerminalOutput(result.output);
    } else if (result.error) {
      outputHtml = '<span class="term-error">错误: ' + escapeHtml(result.error) + '</span>';
    } else {
      outputHtml = '<span class="term-gray">命令执行完成，无输出</span>';
    }

    outputEl.innerHTML += '<div class="term-line">' + outputHtml + '</div>';
    outputEl.innerHTML += '<div class="term-line term-dim" style="margin-top: 8px;">─ 执行完成 ─</div>';

    // 【修复】根据平台显示正确的命令用于日志
    let logCmd;
    if (isWin) {
      logCmd = cmd.startsWith('openclaw') ? cmd.replace('openclaw', 'node openclaw.mjs') : 'node openclaw.mjs ' + cmd;
    } else {
      logCmd = cmd.startsWith('openclaw') ? cmd : 'openclaw ' + cmd;
    }
    addLog(result.success ? 'success' : 'info', 'Gateway命令: ' + logCmd, '', 'user');

    if (cmd.includes('start') || cmd.includes('stop') || cmd.includes('restart')) {
      setTimeout(async () => {
        // 更新所有 Gateway 状态指示器
        await checkGatewayServiceStatus();
        await checkGatewayStatus();
        addLog('info', 'Gateway 状态已刷新', '', 'system');
      }, 2000);
    }

    setTimeout(() => {
      scrollTerminalToTop(outputEl);
    }, 100);

  } catch (e) {
    const loadingLine = outputEl.querySelector('.term-dim');
    if (loadingLine) loadingLine.remove();

    outputEl.innerHTML += '<div class="term-line term-error">错误: ' + escapeHtml(e.message) + '</div>';
    const errorLogCmd = cmd.startsWith('openclaw') ? cmd : 'openclaw ' + cmd;
    addLog('error', 'Gateway命令失败: ' + errorLogCmd + ' - ' + e.message, '', 'user');

    setTimeout(() => {
      scrollTerminalToTop(outputEl);
    }, 100);
  }
}

/**
 * 运行危险命令（带确认对话框）
 * @param {string} cmd - 命令
 */
async function runDangerousCommand(cmd) {
  const danger = DANGEROUS_COMMANDS[cmd];
  if (!danger) return runGatewayCommand(cmd);
  
  const confirmed = confirm(danger.warning + '\n\n后果：' + danger.consequence + '\n\n恢复方法：' + danger.recovery + '\n预计时间：' + danger.time + '\n\n确定要继续吗？');
  
  if (confirmed) {
    setGlobalStatus('正在执行危险命令: ' + cmd + '...', 'warning');
    addLog('warning', '执行危险命令: ' + cmd, '', 'user');
    await runGatewayCommand(cmd);
  } else {
    addLog('info', '已取消危险命令: ' + cmd, '', 'user');
  }
}

/**
 * ANSI 颜色码转 HTML
 * @param {string} text - 包含 ANSI 码的文本
 * @returns {string} HTML 字符串
 */
function ansiToHtml(text) {
  if (!text) return '';
  const ansiMap = {
    '\x1b[30m': '<span class="term-black">',
    '\x1b[31m': '<span class="term-red">',
    '\x1b[32m': '<span class="term-green">',
    '\x1b[33m': '<span class="term-yellow">',
    '\x1b[34m': '<span class="term-blue">',
    '\x1b[35m': '<span class="term-magenta">',
    '\x1b[36m': '<span class="term-cyan">',
    '\x1b[37m': '<span class="term-white">',
    '\x1b[90m': '<span class="term-gray">',
    '\x1b[1m': '<span class="term-bold">',
    '\x1b[2m': '<span class="term-dim">',
    '\x1b[3m': '<span class="term-italic">',
    '\x1b[4m': '<span class="term-underline">',
    '\x1b[0m': '</span>',
  };
  
  let html = text
    .replace(/\x1b\[(\d+;)*\d+m/g, (match) => {
      if (ansiMap[match]) return ansiMap[match];
      const codes = match.slice(2, -1).split(';');
      let classes = [];
      codes.forEach(code => {
        const codeNum = parseInt(code);
        if (codeNum === 0) classes.push('reset');
        else if (codeNum === 1) classes.push('bold');
        else if (codeNum === 2) classes.push('dim');
        else if (codeNum === 3) classes.push('italic');
        else if (codeNum === 4) classes.push('underline');
        else if (codeNum === 30) classes.push('black');
        else if (codeNum === 31) classes.push('red');
        else if (codeNum === 32) classes.push('green');
        else if (codeNum === 33) classes.push('yellow');
        else if (codeNum === 34) classes.push('blue');
        else if (codeNum === 35) classes.push('magenta');
        else if (codeNum === 36) classes.push('cyan');
        else if (codeNum === 37) classes.push('white');
        else if (codeNum === 90) classes.push('gray');
      });
      if (classes.includes('reset')) return '</span>';
      return '<span class="term-' + classes.join(' term-') + '">';
    })
    .replace(/\n/g, '<br>')
    .replace(/\t/g, '&nbsp;&nbsp;');
    
  const openTags = (html.match(/<span/g) || []).length;
  const closeTags = (html.match(/<\/span>/g) || []).length;
  for (let i = 0; i < openTags - closeTags; i++) html += '</span>';
  return html;
}

/**
 * 高亮终端输出
 * @param {string} text - 原始文本
 * @returns {string} 高亮后的 HTML
 */
function highlightTerminalOutput(text) {
  if (!text) return '';

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const protectedSpans = [];
  function protectSpan(match) {
    protectedSpans.push(match);
    return '\x00' + (protectedSpans.length - 1) + '\x01';
  }

  // URL
  html = html.replace(/(https?:\/\/[^\s]+)/g, '<span class="term-link">$1</span>');
  
  // IP地址和端口
  html = html.replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+)/g, '<span class="term-variable">$1</span>');
  
  // 引号字符串
  html = html.replace(/"([^"\n]*)"/g, '<span class="term-string">"$1"</span>');
  html = html.replace(/'([^'\n]*)'/g, '<span class="term-string">\'$1\'</span>');
  
  // 文件路径
  const pathPrefix = '(^|[\\s=:\(\[\{])';
  html = html.replace(new RegExp(pathPrefix + '(\/[^\\s"\'<]+)', 'g'), '$1<span class="term-path">$2</span>');
  html = html.replace(new RegExp(pathPrefix + '(~\/[^\\s"\'<]+)', 'g'), '$1<span class="term-path">$2</span>');
  html = html.replace(new RegExp(pathPrefix + '(\.\.?\/[^\\s"\'<]+)', 'g'), '$1<span class="term-path">$2</span>');
  html = html.replace(new RegExp(pathPrefix + '([a-zA-Z]:\\\\[^\\s"\'<]+)', 'g'), '$1<span class="term-path">$2</span>');
  
  html = html.replace(/<span class="term-[^"]*">[^<]*<\/span>/g, protectSpan);
  
  // 方括号
  html = html.replace(/(\[.*?\])/g, '<span class="term-bright-blue">$1</span>');
  
  // 日志级别
  html = html.replace(/\b(FATAL)\b/g, '<span class="term-bright-magenta">$1</span>');
  html = html.replace(/\b(ERROR)\b/g, '<span class="term-error">$1</span>');
  html = html.replace(/\b(WARN)\b/g, '<span class="term-warning">$1</span>');
  html = html.replace(/\b(INFO)\b/g, '<span class="term-success">$1</span>');
  html = html.replace(/\b(DEBUG|TRACE|SILENT)\b/g, '<span class="term-bright-blue">$1</span>');
  
  // 状态词
  html = html.replace(/\b(success|completed|done|finished|active|running|loaded|ready|ok|enabled|succeeded|successful|installed|updated|upgraded|created|removed|deleted|started|stopped|restarted|built|passed|verified|validated|approved|confirmed|committed|pushed|pulled|merged|deployed|released|published|synced|synchronized|indexed|optimized|cleaned|cleared|found|matched|resolved)\b/gi, '<span class="term-success">$1</span>');
  html = html.replace(/\b(failed|failure|panic|crash|stopped|error|errors|dead|killed|troubles|unsuccessful|incomplete|unfinished|inactive|not\s+found|not\s+ready|unavailable|offline|disconnected|broken|corrupted|damaged|invalid|rejected|denied|blocked|forbidden|unauthorized|unauthenticated|timeout|expired|aborted|cancelled|skipped|missed|lost|dropped|orphaned|zombie|leaked)\b/gi, '<span class="term-error">$1</span>');
  html = html.replace(/\b(warning|caution|deprecated|pending|waiting|disabled|uninstalled|outdated|obsolete|stale|dirty|modified|changed|uncommitted|untracked|unmerged|conflicted|stashed|paused|suspended|hibernated|sleeping|queued|scheduled|delayed|postponed|retrying|reconnecting|loading|initializing|starting|stopping|restarting|building|compiling|testing|downloading|uploading|syncing|processing|indexing|optimizing|cleaning|scanning|checking|verifying|validating|searching|looking|fetching|pulling|pushing|cloning|installing|updating|upgrading|creating|removing|deleting|copying|moving|renaming|extracting|compressing|decompressing|packing|unpacking)\b/gi, '<span class="term-warning">$1</span>');
  
  // OpenClaw 命令
  html = html.replace(/\b(openclaw|clawbot|dawdbot|picoclaw|zeroClaw|easyclaw|moltbot)\b/gi, '<span class="term-title">$1</span>');
  html = html.replace(/\b(install|uninstall|kill|terminate)\b/gi, '<span class="term-bright-red">$1</span>');
  html = html.replace(/\b(gateway|status|health|logs|doctor|fix|config|onboard|models|channels|agents|dashboard|version|tools|skills|plugins|completions|prompts|whoami|mcp|env|which|internal|ui|tui|gui|run|chat|ask|search|memory|remember|recall|forget|note|todo|task|schedule|remind|notify|send|receive|reply|forward|broadcast|subscribe|unsubscribe|publish|invoke|execute|perform|apply|use|set|get|add|remove|delete|list|show|describe|explain|analyze|check|test|validate|verify|repair|heal|diagnose|inspect|monitor|watch|observe|track|trace|debug|profile|optimize|tune|adjust|configure|setup|init|initialize|reset|restore|backup|import|export|migrate|upgrade|update|refresh|reload|restart|start|stop|pause|resume|shutdown|boot|launch)\b/gi, '<span class="term-bright-blue">$1</span>');
  
  // AI/LLM 相关
  html = html.replace(/\b(llm|ai|model|provider|api|endpoint|baseurl|temperature|top_p|max_tokens|prompt|completion|embedding|fine-tune|inference|chat|conversation|thread|system|user|assistant|function|call|response|stream|batch|rate|limit|quota|usage|cost|pricing|billing|subscription|plan|tier|agent|runner|skill|capability|knowledge|memory|context|session|message|request|token|input|output|generate|thinking|thought|reasoning|workflow|pipeline|handler|callback|middleware|hook|event|trigger|listener|observer|scheduler|coordinator|registry|adapter|driver|engine|backend|frontend|peer|node|cluster|schema|type|mode|state|phase|stage|level|priority|severity|category|tag|label|flag|option|parameter|argument|value|field|property|attribute|key|id|uuid|name|title|description|content|text|data|info|metadata|settings|preferences|configuration|profile|account|identity|auth|authentication|authorization|permission|role|policy|rule|constraint|requirement|condition|criteria|standard|specification|interface|contract|definition|implementation|instance|object|module|package|library|framework|platform|environment|runtime|scope|namespace|domain|zone|region|location|url|uri|reference|pointer|handle|descriptor|manifest|index|catalog|repository|storage|cache|buffer|stream|file|document|record|entry|item|element|component|section|segment|chunk|block|unit|fragment|array|list|map|set|collection|group|batch|bundle|archive|snapshot|image|container|volume|mount|device|resource|asset|artifact|product|result|outcome|effect|impact|consequence|feedback|metric|indicator|measurement|statistic|analytics|report|summary|overview|detail|history|audit|trail|checkpoint)\b/gi, '<span class="term-bright-magenta">$1</span>');
  
  // 操作命令
  html = html.replace(/\b(start|stop|restart|install|uninstall|update|upgrade|enable|disable|add|remove|list|get|set|create|delete|edit|run|exec|build|test|deploy|show|display|print|echo|cat|ls|ll|la|cd|pwd|mkdir|rmdir|rm|cp|mv|ln|chmod|chown|touch|find|grep|sed|awk|sort|uniq|wc|head|tail|less|more|vi|vim|nano|open|kill|ps|top|htop|df|du|free|uptime|who|w|which|whereis|locate|man|help|clear|exit|quit|source|export|unset|alias|unalias)\b/gi, '<span class="term-bright-yellow">$1</span>');
  
  // 系统架构
  html = html.replace(/\b(service|daemon|process|pid|port|host|bind|listen|target|probe|runtime|memory|cpu|disk|network|connection|client|server|node|cluster|namespace|container|image|volume|secret|configmap|ingress|pod|deployment|heartbeat|queue|broker|router|proxy|agent|worker|scheduler|executor|handler|manager|controller|registry|factory|adapter|middleware|filter|hook|event|trigger|callback|listener|subscriber|publisher|producer|consumer)\b/gi, '<span class="term-cyan">$1</span>');
  
  // 平台和协议
  html = html.replace(/\b(whatsapp|telegram|slack|discord|wechat|email|sms|webhook|websocket|grpc|rest|http|https|tcp|udp|mqtt|amqp|kafka|rabbitmq|redis|mongodb|postgres|mysql|sqlite|elasticsearch|prometheus|grafana|jaeger|zipkin|brew|npm|yarn|pnpm|pip|gem|cargo|gradle|maven|apt|yum|dnf|pacman|choco|scoop|vcpkg|conan|cmake|make|gcc|clang|go|python|node|nodejs|ruby|rust|java|dotnet|swift|xcode|android|ios|linux|ubuntu|debian|centos|fedora|arch|windows|macos|darwin)\b/gi, '<span class="term-bright-cyan">$1</span>');
  
  // 连接相关
  html = html.replace(/\b(connect|connection|connected|connecting|disconnect|disconnected|reconnect|timeout|retry|ping|pong|handshake|establish|close|closed|abort|reset|refused|dropped|lost|unreachable|available|unavailable|idle|busy|congested|throttled|backoff|circuit|breaker|failover|loadbalance|sticky|persistent|keepalive|pool|max|min|active|waiting|queued|git|github|gitlab|bitbucket|svn|hg|commit|branch|tag|merge|rebase|cherry-pick|stash|checkout|reset|revert|clone|fork|pull|push|fetch|remote|origin|upstream|master|main|develop|feature|hotfix|release|head|index|worktree|blob|tree|ref|sha|hash)\b/gi, '<span class="term-bright-yellow">$1</span>');
  
  // 安全相关
  html = html.replace(/\b(security|audit|allowlist|blocklist|whitelist|blacklist|auth|authentication|authorization|verify|validate|certificate|token|key|password|credential|permission|role|policy|firewall|encrypt|decrypt|hash|ssl|tls)\b/gi, '<span class="term-bright-red">$1</span>');
  
  // 文件类型
  html = html.replace(/\b(json|yaml|yml|xml|toml|ini|conf|config|md|txt|log|js|ts|py|go|rs|java|cpp|c|h|sh|bash|zsh)\b/gi, '<span class="term-bright-magenta">$1</span>');
  
  // 环境变量
  html = html.replace(/\b([A-Z][A-Z0-9_]{2,})\b/g, '<span class="term-bright-cyan">$1</span>');
  
  // 日期时间
  html = html.replace(/(\d{4}-\d{2}-\d{2})/g, '<span class="term-bright-yellow">$1</span>');
  html = html.replace(/(\d{2}:\d{2}:\d{2})/g, '<span class="term-bright-yellow">$1</span>');
  
  // 数字
  html = html.replace(/(:\s*)(\d{1,5})\b/g, '$1<span class="term-number">$2</span>');
  
  // 布尔值
  html = html.replace(/\b(true|false|null|undefined|yes|no|on|off)\b/g, '<span class="term-bright-magenta">$1</span>');
  
  // 菱形符号
  html = html.replace(/(◇)/g, '<span class="term-diamond">$1</span>');
  
  // 箭头
  html = html.replace(/(=>|->|<-|→|←)/g, '<span class="term-operator">$1</span>');

  // 恢复被保护的HTML标签
  html = html.replace(/\x00(\d+)\x01/g, (match, index) => protectedSpans[parseInt(index)]);

  // 处理换行
  html = html.replace(/\n/g, '<br>');

  return html;
}

/**
 * 滚动终端到顶部
 * @param {HTMLElement} outputEl - 输出元素
 */
function scrollTerminalToTop(outputEl) {
  if (!outputEl) return;
  outputEl.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 滚动终端到底部
 * @param {HTMLElement} outputEl - 输出元素
 */
function scrollTerminalToBottom(outputEl) {
  if (!outputEl) return;
  outputEl.scrollTo({ top: outputEl.scrollHeight, behavior: 'smooth' });
}

/**
 * 清空终端输出
 */
function clearTerminalOutput() {
  const outputEl = document.getElementById('gateway-output');
  if (!outputEl) return;
  outputEl.innerHTML = '<div class="term-line term-dim">输出已清空</div>';
  outputEl.scrollTop = 0;
}

/**
 * 运行自定义 Gateway 命令
 */
async function runCustomGatewayCommand() {
  const input = document.getElementById('gateway-cmd-input');
  if (!input || !input.value.trim()) return;
  const cmd = input.value.trim();
  
  const systemCommands = ['npm', 'node', 'python', 'python3', 'pip', 'git', 'curl', 'wget'];
  const firstWord = cmd.split(' ')[0].toLowerCase();
  
  if (systemCommands.includes(firstWord)) {
    await runSystemCommand(cmd);
  } else {
    await runGatewayCommand(cmd);
  }
  
  input.value = '';
}

/**
 * 运行系统命令
 * @param {string} cmd - 命令
 */
async function runSystemCommand(cmd) {
  console.log('[System] Running command:', cmd);
  const outputEl = document.getElementById('gateway-output');
  if (!outputEl) return;

  outputEl.innerHTML = '<div class="term-line"><span class="term-prompt">$</span> <span class="term-command">' + escapeHtml(cmd) + '</span></div><div class="term-line term-dim">执行中...</div>';

  try {
    const result = await window.electronAPI.runSystemCommand(cmd);
    
    let output = '';
    if (result.success) {
      output = result.output || '命令执行成功（无输出）';
    } else {
      output = result.error || result.output || '命令执行失败';
    }
    
    const highlightedOutput = highlightTerminalOutput(output);
    outputEl.innerHTML = '<div class="term-line"><span class="term-prompt">$</span> <span class="term-command">' + escapeHtml(cmd) + '</span></div>' + highlightedOutput + '<div class="term-line term-dim">─ 执行' + (result.success ? '成功' : '失败') + ' ─</div>';
    
    outputEl.scrollTop = 0;
    
  } catch (e) {
    outputEl.innerHTML = '<div class="term-line"><span class="term-prompt">$</span> <span class="term-command">' + escapeHtml(cmd) + '</span></div><div class="term-line term-error">系统命令执行错误: ' + escapeHtml(e.message) + '</div>';
  }
}

/**
 * 启动系统终端
 */
async function openSystemTerminal() {
  try {
    const platform = window.electronAPI.platform;
    addLog('info', '正在启动系统终端...', { platform }, 'user');

    const result = await window.electronAPI.openSystemTerminal();

    if (result.success) {
      setGlobalStatus('终端已启动: ' + result.terminal, 'success');
      addLog('success', '系统终端已启动', { terminal: result.terminal, command: result.command }, 'user');
    } else {
      setGlobalStatus('启动终端失败: ' + result.error, 'error');
      addLog('error', '启动终端失败', { error: result.error }, 'user');
    }
  } catch (e) {
    setGlobalStatus('启动终端错误: ' + e.message, 'error');
    addLog('error', '启动终端异常', { error: e.message }, 'user');
  }
}

/**
 * 在系统终端中运行交互式命令
 * @param {string} command - 要运行的命令（configure/onboard/update）
 */
async function runInteractiveCommand(command) {
  try {
    // 【修复】根据平台构建正确的命令
    const isWin = navigator.platform.toLowerCase().includes('win');
    let fullCommand;
    if (isWin) {
      // Windows 上使用 node openclaw.mjs
      fullCommand = `node openclaw.mjs ${command}`;
    } else {
      // macOS/Linux 上使用 openclaw
      fullCommand = `openclaw ${command}`;
    }
    addLog('info', `正在终端中启动交互式命令: ${fullCommand}`, {}, 'user');

    // 使用主进程在终端中打开命令
    const result = await window.electronAPI.openSystemTerminalWithCommand(fullCommand);

    if (result.success) {
      setGlobalStatus(`已在终端中启动: ${fullCommand}`, 'success');
      addLog('success', '交互式命令已在终端中启动', { command: fullCommand, terminal: result.terminal }, 'user');
    } else {
      setGlobalStatus('启动交互式命令失败: ' + result.error, 'error');
      addLog('error', '启动交互式命令失败', { error: result.error }, 'user');
    }
  } catch (e) {
    setGlobalStatus('运行交互式命令错误: ' + e.message, 'error');
    addLog('error', '运行交互式命令异常', { error: e.message }, 'user');
  }
}

/**
 * 一键启动 Gateway
 */
async function startGatewayWithScript() {
  console.log('[Gateway] Starting with script...');
  const outputEl = document.getElementById('gateway-output');
  if (!outputEl) return;

  outputEl.innerHTML = '<div class="term-line"><span class="term-prompt">$</span> <span class="term-command">一键启动 Gateway</span></div><div class="term-line term-dim">正在打开终端并启动 Gateway...</div>';

  try {
    const result = await window.electronAPI.startGatewayScript();
    
    if (result.success) {
      const url = 'http://127.0.0.1:18789';
      outputEl.innerHTML = '<div class="term-line"><span class="term-prompt">$</span> <span class="term-command">一键启动 Gateway</span></div>' +
        '<div class="term-line term-success">✅ ' + escapeHtml(result.message) + '</div>' +
        '<div class="term-line">📍 访问地址: <span class="term-link" style="cursor: pointer; text-decoration: underline;" onclick="window.electronAPI.openExternal(\'' + url + '\')">' + url + '</span></div>' +
        '<div class="term-line term-dim">提示: 点击链接在外部浏览器中打开</div>';
      setGlobalStatus('Gateway 已通过脚本启动', 'success');
      addLog('success', 'Gateway 已通过脚本启动', '', 'user');
    } else {
      outputEl.innerHTML = '<div class="term-line"><span class="term-prompt">$</span> <span class="term-command">一键启动 Gateway</span></div>' +
        '<div class="term-line term-error">❌ 启动失败: ' + escapeHtml(result.error) + '</div>';
      setGlobalStatus('Gateway 脚本启动失败: ' + result.error, 'error');
      addLog('error', 'Gateway 脚本启动失败: ' + result.error, '', 'user');
    }
  } catch (e) {
    outputEl.innerHTML = '<div class="term-line"><span class="term-prompt">$</span> <span class="term-command">一键启动 Gateway</span></div>' +
      '<div class="term-line term-error">❌ 错误: ' + escapeHtml(e.message) + '</div>';
    addLog('error', 'Gateway 脚本启动异常: ' + e.message, '', 'user');
  }
}

/**
 * 添加终端控制按钮
 */
function addTerminalControls() {
  // 添加终端控制按钮到界面
  const terminalContainer = document.getElementById('gateway-terminal');
  if (!terminalContainer) return;
  
  // 检查是否已添加控制按钮
  if (terminalContainer.querySelector('.terminal-controls')) return;
  
  const controls = document.createElement('div');
  controls.className = 'terminal-controls';
  controls.innerHTML = `
    <button class="btn btn-sm" onclick="scrollTerminalToTop(document.getElementById('gateway-terminal-output'))">⬆️ 顶部</button>
    <button class="btn btn-sm" onclick="scrollTerminalToBottom(document.getElementById('gateway-terminal-output'))">⬇️ 底部</button>
    <button class="btn btn-sm" onclick="clearTerminalOutput()">🗑️ 清空</button>
  `;
  
  terminalContainer.insertBefore(controls, terminalContainer.firstChild);
}

/**
 * 初始化命令状态栏
 */
function initCommandStatusBar() {
  // 初始化命令状态栏的悬停提示功能
  const statusBar = document.getElementById('command-status-bar');
  if (!statusBar) return;
  
  // 添加悬停效果
  statusBar.addEventListener('mouseenter', () => {
    statusBar.classList.add('hover');
  });
  
  statusBar.addEventListener('mouseleave', () => {
    statusBar.classList.remove('hover');
  });
}
