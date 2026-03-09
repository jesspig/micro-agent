/**
 * 配置状态检查模块
 *
 * 在 CLI 启动时检查配置完整性，显示缺失项警告
 */

import { loadConfig, getConfigStatus, type ConfigStatus } from '@micro-agent/sdk';

/** 配置项的中文显示名称映射 */
const CONFIG_ITEM_LABELS: Record<string, string> = {
  'agents.models.chat': '对话模型 (agents.models.chat)',
  'providers': 'Provider',
  'channels': '消息通道',
};

/**
 * 获取配置状态
 *
 * 检查配置完整性，返回状态信息
 */
export function checkConfigStatus(configPath?: string): ConfigStatus {
  const config = loadConfig(configPath ? { configPath } : {});
  return getConfigStatus(config);
}

/**
 * 显示配置缺失警告
 *
 * 以友好格式显示缺失的配置项
 */
export function displayConfigWarnings(status: ConfigStatus): void {
  if (status.missingRequired.length === 0) {
    return;
  }

  console.log('');
  console.log('\x1b[33m  ⚠ 配置不完整\x1b[0m');
  console.log('');

  // 区分缺失类型
  const missingItems = status.missingRequired.map(item => {
    const label = CONFIG_ITEM_LABELS[item] || item;
    return `未配置 ${label}`;
  });

  for (const item of missingItems) {
    console.log(`    \x1b[31m•\x1b[0m ${item}`);
  }

  console.log('');
  console.log('  请编辑 \x1b[36m~/.micro-agent/settings.yaml\x1b[0m 完成配置后重启');
  console.log('─'.repeat(50));
}

/**
 * 执行配置检查并显示警告
 *
 * 在启动时调用，检查配置完整性
 * 配置不完整不会阻止启动，仅显示警告
 */
export function performConfigCheck(configPath?: string): ConfigStatus {
  const status = checkConfigStatus(configPath);
  displayConfigWarnings(status);
  return status;
}
