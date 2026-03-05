// Gateway 修复脚本
// 通过恢复备份配置来修复 Gateway

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const OPENCLAW_CONFIG_DIR = path.join(require('os').homedir(), '.openclaw');
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_CONFIG_DIR, 'openclaw.json');
const BACKUP_DIR = path.join(OPENCLAW_CONFIG_DIR, 'backups');

async function repairGateway() {
  console.log('🔧 开始修复 Gateway...');

  try {
    // 1. 查找可用的备份
    console.log('📋 查找可用备份...');
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('openclaw.json.backup.'))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (backups.length === 0) {
      console.error('❌ 未找到可用备份');
      return { success: false, error: '未找到可用备份' };
    }

    // 2. 查找包含有效 token 的备份
    console.log('🔍 查找包含有效 token 的备份...');
    let validBackup = null;
    for (const backup of backups) {
      try {
        const content = JSON.parse(fs.readFileSync(backup.path, 'utf8'));
        const token = content.gateway?.auth?.token;
        if (token && !token.startsWith('DESTROYED_')) {
          validBackup = backup;
          console.log(`✅ 找到有效备份: ${backup.name}`);
          break;
        }
      } catch (e) {
        console.log(`⚠️ 备份 ${backup.name} 无效: ${e.message}`);
      }
    }

    if (!validBackup) {
      console.error('❌ 未找到包含有效 token 的备份');
      return { success: false, error: '未找到包含有效 token 的备份' };
    }

    // 3. 读取当前配置
    console.log('📖 读取当前配置...');
    let currentConfig = {};
    try {
      currentConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.log('⚠️ 当前配置读取失败，将使用备份完整替换');
    }

    // 4. 读取备份配置
    console.log('📖 读取备份配置...');
    const backupConfig = JSON.parse(fs.readFileSync(validBackup.path, 'utf8'));

    // 5. 恢复配置（保留一些当前设置）
    console.log('🔄 恢复配置...');
    const restoredConfig = {
      ...backupConfig,
      wizard: currentConfig.wizard || backupConfig.wizard,
      meta: {
        ...backupConfig.meta,
        lastTouchedAt: new Date().toISOString(),
        lastTouchedVersion: currentConfig.meta?.lastTouchedVersion || backupConfig.meta?.lastTouchedVersion
      }
    };

    // 6. 保存恢复的配置
    console.log('💾 保存恢复的配置...');
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(restoredConfig, null, 2));
    console.log('✅ 配置已恢复');

    // 7. 尝试启动 Gateway
    console.log('🚀 尝试启动 Gateway...');
    try {
      const { stdout, stderr } = await execAsync('openclaw gateway start', { timeout: 10000 });
      console.log('Gateway 启动输出:', stdout);
      if (stderr) console.log('Gateway 启动警告:', stderr);
    } catch (e) {
      console.log('⚠️ Gateway 启动命令执行结果:', e.message);
    }

    // 8. 等待 Gateway 启动
    console.log('⏳ 等待 Gateway 启动...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 9. 验证 Gateway 状态
    console.log('🔍 验证 Gateway 状态...');
    try {
      const { stdout } = await execAsync('openclaw gateway status', { timeout: 5000 });
      console.log('Gateway 状态:', stdout);

      if (stdout.includes('RPC probe: connected') || stdout.includes('connected')) {
        console.log('✅ Gateway 修复成功！');
        return { success: true, message: 'Gateway 修复成功' };
      } else {
        console.log('⚠️ Gateway 可能未完全启动，请手动检查');
        return { success: true, message: '配置已恢复，Gateway 可能需要手动启动' };
      }
    } catch (e) {
      console.log('⚠️ Gateway 状态检查失败:', e.message);
      return { success: true, message: '配置已恢复，请手动启动 Gateway' };
    }

  } catch (error) {
    console.error('❌ 修复失败:', error.message);
    return { success: false, error: error.message };
  }
}

// 执行修复
repairGateway().then(result => {
  console.log('\n📊 修复结果:', result);
  process.exit(result.success ? 0 : 1);
}).catch(error => {
  console.error('❌ 修复过程出错:', error);
  process.exit(1);
});
