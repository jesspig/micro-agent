/**
 * 启动信息打印模块
 *
 * 负责打印应用的启动信息
 */

import type { Config } from '@micro-agent/types';

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
  infoMessages: string[];  // 状态信息（蓝色）
  warningMessages: string[];  // 警告信息（黄色）
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
 * 打印启动信息
 */
export function printStartupInfo(startupInfo: StartupInfo, config: Config): void {
  console.log('─'.repeat(50));
  printTools(startupInfo);
  printSkills(startupInfo);
  printModels(startupInfo, config);
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
    console.log(`  \x1b[90m工具:\x1b[0m ${startupInfo.tools.join(', ')}`);
  }
}

/**
 * 打印技能信息
 */
function printSkills(startupInfo: StartupInfo): void {
  if (startupInfo.skills.length > 0) {
    console.log(`  \x1b[90m技能:\x1b[0m ${startupInfo.skills.join(', ')}`);
  }
}

/**
 * 打印模型信息
 */
function printModels(startupInfo: StartupInfo, config: Config): void {
  const chatModel = config.agents.models?.chat;
  const models = startupInfo.models;

  if (chatModel) {
    console.log(`  \x1b[90m对话模型:\x1b[0m ${chatModel}`);
  }

  printModelIfDifferent('视觉模型', models.vision, chatModel);
  printModelIfExists('嵌入模型', models.embed);
  printModelIfDifferent('编程模型', models.coder, chatModel);
  printModelIfDifferent('意图模型', models.intent, chatModel);
}

/**
 * 打印单个模型信息（如果不同于对话模型）
 */
function printModelIfDifferent(label: string, model?: string, chatModel?: string): void {
  if (model && model !== chatModel) {
    console.log(`  \x1b[90m${label}:\x1b[0m ${model}`);
  } else if (chatModel) {
    console.log(`  \x1b[90m${label}:\x1b[0m ${chatModel} (继承对话模型)`);
  }
}

/**
 * 打印单个模型信息（如果存在）
 */
function printModelIfExists(label: string, model?: string): void {
  if (model) {
    console.log(`  \x1b[90m${label}:\x1b[0m ${model}`);
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
  console.log(`  \x1b[90m记忆:\x1b[0m ${modeLabel}${embedModelInfo}`);

  if (startupInfo.memory.autoSummarize && startupInfo.memory.summarizeThreshold) {
    console.log(`  \x1b[90m自动摘要:\x1b[0m ${startupInfo.memory.summarizeThreshold} 条消息`);
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
    console.log(`  \x1b[90m渠道:\x1b[0m ${startupInfo.channels.join(', ')}`);
  }
}

/**
 * 打印状态信息（蓝色）
 */
function printInfoMessages(startupInfo: StartupInfo): void {
  if (startupInfo.infoMessages.length > 0) {
    console.log();
    for (const info of startupInfo.infoMessages) {
      console.log(`  \x1b[36mℹ ${info}\x1b[0m`);
    }
  }
}

/**
 * 打印警告信息（黄色）
 */
function printWarningMessages(startupInfo: StartupInfo): void {
  if (startupInfo.warningMessages.length > 0) {
    console.log();
    for (const w of startupInfo.warningMessages) {
      console.log(`  \x1b[33m⚠ ${w}\x1b[0m`);
    }
  }
}