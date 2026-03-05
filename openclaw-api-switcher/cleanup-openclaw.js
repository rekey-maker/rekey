#!/usr/bin/env node
/**
 * 清理 OpenClaw 冗余配置脚本
 * 删除 ~/.openclaw/openclaw.json 中的 models.providers
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const BACKUP_DIR = path.join(os.homedir(), '.openclaw', 'backups');

function main() {
  console.log('🔍 检查 OpenClaw 配置...');
  
  // 检查文件是否存在
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
    console.log('✅ OpenClaw 配置文件不存在，无需清理');
    return;
  }
  
  // 读取配置
  let config;
  try {
    config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('❌ 读取配置文件失败:', e.message);
    process.exit(1);
  }
  
  // 检查是否有 providers
  if (!config.models?.providers) {
    console.log('✅ 没有需要清理的 providers');
    return;
  }
  
  const providerNames = Object.keys(config.models.providers);
  console.log(`📋 发现 ${providerNames.length} 个需要清理的 providers:`);
  providerNames.forEach(name => console.log(`   - ${name}`));
  
  // 创建备份
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const backupPath = path.join(BACKUP_DIR, `openclaw.json.backup.${Date.now()}`);
  fs.copyFileSync(OPENCLAW_CONFIG_PATH, backupPath);
  console.log(`💾 已创建备份: ${backupPath}`);
  
  // 删除 providers
  delete config.models.providers;
  
  // 如果 models 为空对象，保留 mode 字段
  if (config.models && Object.keys(config.models).length === 0) {
    config.models = { mode: 'merge' };
  }
  
  // 保存修改后的配置
  try {
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    console.log('✅ 清理完成！');
    console.log('📍 OpenClaw 配置路径:', OPENCLAW_CONFIG_PATH);
    console.log('💡 提示: 如果清理后 OpenClaw 工作异常，可以从备份恢复');
  } catch (e) {
    console.error('❌ 保存配置文件失败:', e.message);
    process.exit(1);
  }
}

main();
