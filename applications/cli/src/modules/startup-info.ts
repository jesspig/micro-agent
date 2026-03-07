/**
 * 启动信息显示模块
 *
 * 负责打印应用的启动信息和运行状态
 */

import { platform, arch, hostname } from 'os';
import { version as bunVersion } from 'bun';

// 颜色常量
const COLORS = {
  gray: '\x1b[90m',    // 灰色 - 标签
  cyan: '\x1b[36m',    // 青色 - ℹ 图标
  yellow: '\x1b[33m',  // 黄色 - ⚠ 图标
  reset: '\x1b[0m',
};

/** 启动状态信息收集器 */
export interface StartupInfo {
  tools: string[];
  skills: string[];
  models: {
    chat?: string;
    vision?: string;
    embed?: string;
    coder?: string;
    intent?: string;
  };
  memory: {
    mode: 'vector' | 'fulltext' | 'hybrid';
    embedModel?: string;
    storagePath?: string;
    autoSummarize?: boolean;
    summarizeThreshold?: number;
  };
  channels: string[];
  infoMessages: string[];  // 状态信息（青色 ℹ）
  warningMessages: string[];  // 警告信息（黄色 ⚠）
}

/** 创建默认启动信息 */
export function createDefaultStartupInfo(): StartupInfo {
  return {
    tools: [],
    skills: [],
    models: {},
    memory: { mode: 'fulltext' },
    channels: [],
    infoMessages: [],
    warningMessages: [],
  };
}

/**
 * 打印完整启动信息（与旧版格式一致）
 */
export function printStartupInfo(startupInfo: StartupInfo): void {
  console.log('─'.repeat(50));
  printTools(startupInfo);
  printSkills(startupInfo);
  printModels(startupInfo);
  printMemory(startupInfo);
  printChannels(startupInfo);
  printInfoMessages(startupInfo);
  printWarningMessages(startupInfo);
  console.log('─'.repeat(50));
}

/**
 * 打印工具信息
 */
function printTools(startupInfo: StartupInfo): void {
  if (startupInfo.tools.length > 0) {
    console.log(`  ${COLORS.gray}工具:${COLORS.reset} ${startupInfo.tools.join(', ')}`);
  }
}

/**
 * 打印技能信息
 */
function printSkills(startupInfo: StartupInfo): void {
  if (startupInfo.skills.length > 0) {
    console.log(`  ${COLORS.gray}技能:${COLORS.reset} ${startupInfo.skills.join(', ')}`);
  }
}

/**
 * 打印模型信息
 */
function printModels(startupInfo: StartupInfo): void {
  const chatModel = startupInfo.models.chat;
  const models = startupInfo.models;

  if (chatModel) {
    console.log(`  ${COLORS.gray}对话模型:${COLORS.reset} ${chatModel}`);
  }

  printModelWithInheritance('视觉模型', models.vision, chatModel);
  printModelIfExists('嵌入模型', models.embed);
  printModelWithInheritance('编程模型', models.coder, chatModel);
  printModelWithInheritance('意图模型', models.intent, chatModel);
}

/**
 * 打印单个模型信息（显示继承关系）
 */
function printModelWithInheritance(label: string, model?: string, chatModel?: string): void {
  if (model && model !== chatModel) {
    console.log(`  ${COLORS.gray}${label}:${COLORS.reset} ${model}`);
  } else if (chatModel) {
    console.log(`  ${COLORS.gray}${label}:${COLORS.reset} ${chatModel} (继承对话模型)`);
  }
}

/**
 * 打印单个模型信息（如果存在）
 */
function printModelIfExists(label: string, model?: string): void {
  if (model) {
    console.log(`  ${COLORS.gray}${label}:${COLORS.reset} ${model}`);
  }
}

/**
 * 打印记忆系统信息
 */
function printMemory(startupInfo: StartupInfo): void {
  const modeLabel = getMemoryModeLabel(startupInfo);
  const embedModelInfo = startupInfo.memory.embedModel
    ? ` (${startupInfo.memory.embedModel})`
    : '';
  console.log(`  ${COLORS.gray}记忆:${COLORS.reset} ${modeLabel}${embedModelInfo}`);

  if (startupInfo.memory.autoSummarize && startupInfo.memory.summarizeThreshold) {
    console.log(`  ${COLORS.gray}自动摘要:${COLORS.reset} ${startupInfo.memory.summarizeThreshold} 条消息`);
  }
}

/**
 * 获取记忆模式标签
 */
function getMemoryModeLabel(startupInfo: StartupInfo): string {
  return startupInfo.memory.mode === 'vector'
    ? '向量检索'
    : startupInfo.memory.mode === 'hybrid'
      ? '混合检索'
      : '全文检索';
}

/**
 * 打印渠道信息
 */
function printChannels(startupInfo: StartupInfo): void {
  if (startupInfo.channels.length > 0) {
    console.log(`  ${COLORS.gray}渠道:${COLORS.reset} ${startupInfo.channels.join(', ')}`);
  }
}

/**
 * 打印状态信息（青色 ℹ）
 */
function printInfoMessages(startupInfo: StartupInfo): void {
  if (startupInfo.infoMessages.length > 0) {
    console.log();
    for (const info of startupInfo.infoMessages) {
      console.log(`  ${COLORS.cyan}ℹ ${info}${COLORS.reset}`);
    }
  }
}

/**
 * 打印警告信息（黄色 ⚠）
 */
function printWarningMessages(startupInfo: StartupInfo): void {
  if (startupInfo.warningMessages.length > 0) {
    console.log();
    for (const w of startupInfo.warningMessages) {
      console.log(`  ${COLORS.yellow}⚠ ${w}${COLORS.reset}`);
    }
  }
}

// ============================================================
// 以下为 CLI 启动流程相关函数
// ============================================================

/**
 * 显示启动信息
 */
export function displayStartupInfo(options: {
  verbose?: boolean;
  configPath?: string;
  channels: string[];
  ipcPath?: string;
}): void {
  const { verbose, configPath, channels, ipcPath } = options;

  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║        Micro Agent CLI v1.0.0         ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');

  // 基本信息
  console.log('  系统信息:');
  console.log(`    平台: ${platform()} ${arch()}`);
  console.log(`    主机: ${hostname()}`);
  console.log(`    Bun: ${bunVersion}`);
  console.log('');

  // 配置信息
  if (verbose) {
    console.log('  配置:');
    console.log(`    配置文件: ${configPath ?? '默认'}`);
    console.log(`    IPC 路径: ${ipcPath ?? '默认'}`);
    console.log(`    启用通道: ${channels.join(', ') || '无'}`);
    console.log('');
  }

  // 启动状态
  console.log('  启动中...');
}

/**
 * 显示启动成功信息
 */
export function displaySuccessInfo(options: {
  channels: { type: string; connected: boolean }[];
  sessions: number;
  ipcPath: string;
}): void {
  const { channels, sessions, ipcPath } = options;

  console.log('');
  console.log('  ✅ 启动成功!');
  console.log('');
  console.log('  连接状态:');

  for (const channel of channels) {
    const status = channel.connected ? '✓' : '✗';
    console.log(`    ${status} ${channel.type}: ${channel.connected ? '已连接' : '未连接'}`);
  }

  console.log(`    IPC: ${ipcPath}`);
  console.log('');
  console.log(`  活跃会话: ${sessions}`);
  console.log('');
  console.log('  按 Ctrl+C 退出');
  console.log('');
}

/**
 * 显示启动失败信息
 */
export function displayErrorInfo(error: Error): void {
  console.log('');
  console.log('  ❌ 启动失败!');
  console.log('');
  console.log(`  错误: ${error.message}`);
  console.log('');
}

/**
 * 显示关闭信息
 */
export function displayShutdownInfo(): void {
  console.log('');
  console.log('  正在关闭...');
  console.log('');
}