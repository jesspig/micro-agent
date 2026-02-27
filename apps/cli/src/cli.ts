#!/usr/bin/env bun

/**
 * MicroAgent CLI 入口
 *
 * 命令:
 * - start: 启动服务
 * - status: 显示状态
 * - ext: 扩展管理
 */

import { parseArgs } from 'util';
import { createApp } from './app';
import { loadConfig, getConfigStatus } from '@micro-agent/config';
import { initLogging, getLogFilePath } from '@micro-agent/runtime';
import type { App } from '@micro-agent/types';

const VERSION = '0.2.1';

/** 初始化日志系统 */
async function initLoggingSystem(level: 'debug' | 'info' | 'warn' = 'info'): Promise<void> {
  await initLogging({
    console: true,
    file: true,
    level,
    traceEnabled: level === 'debug',
  });
}

/** 显示帮助信息 */
function showHelp(): void {
  console.log(`
MicroAgent - 轻量级 AI 助手框架

用法:
  micro-agent [命令] [选项]

命令:
  start       启动服务（连接外部通道）
  status      显示状态
  ext         扩展管理

选项:
  -c, --config <path>   配置文件路径
  -v, --verbose         显示详细日志（工具调用详情）
  -q, --quiet           静默模式，仅显示警告和错误
  -h, --help            显示帮助
      --version         显示版本

日志级别:
  默认      显示 INFO 级别日志，工具调用摘要
  -v        显示 DEBUG 级别日志，工具调用详情
  -q        仅显示 WARNING 和 ERROR 日志

示例:
  micro-agent start             # 启动服务
  micro-agent start -v          # 详细模式，查看工具调用详情
  micro-agent start -q          # 静默模式
  micro-agent start -c ./config.yaml
  micro-agent status
`);
}

/** 显示版本 */
function showVersion(): void {
  console.log(`MicroAgent v${VERSION}`);
}

/** 显示状态 */
function showStatus(app: App): void {
  const channels = app.getRunningChannels();
  const provider = app.getProviderStatus();

  console.log();
  console.log('\x1b[1m\x1b[36mMicroAgent 状态\x1b[0m');
  console.log('─'.repeat(50));
  console.log(`  \x1b[2m通道:\x1b[0m ${channels.length > 0 ? channels.join(', ') : '无'}`);
  console.log(`  \x1b[2mProvider:\x1b[0m ${provider}`);
  console.log();
}

/** 启动服务 */
async function startService(configPath?: string, logLevel: 'debug' | 'info' | 'warn' = 'info'): Promise<void> {
  // 初始化日志
  await initLoggingSystem(logLevel);

  console.log('\x1b[2J\x1b[H'); // 清屏
  console.log();
  console.log('\x1b[1m\x1b[36mMicroAgent\x1b[0m');
  console.log('─'.repeat(50));
  
  // 显示日志级别
  if (logLevel === 'debug') {
    console.log('  \x1b[90m日志级别:\x1b[0m \x1b[36mDEBUG\x1b[0m (详细模式)');
  } else if (logLevel === 'warn') {
    console.log('  \x1b[90m日志级别:\x1b[0m \x1b[33mWARN\x1b[0m (静默模式)');
  }

  // 检查配置状态
  const baseConfig = loadConfig(configPath ? { configPath } : {});
  const configStatus = getConfigStatus(baseConfig);

  // 显示缺失项警告（但不阻止启动）
  if (configStatus.missingRequired.length > 0) {
    console.log();
    console.log('\x1b[33m  ⚠ 配置不完整\x1b[0m');
    console.log();
    console.log('  缺少必填项：');
    for (const item of configStatus.missingRequired) {
      console.log(`    \x1b[31m✗\x1b[0m ${item}`);
    }
    console.log();
    console.log('  请编辑 \x1b[36m~/.micro-agent/settings.yaml\x1b[0m 完成配置后重启');
    console.log('─'.repeat(50));
  }

  const app = await createApp(configPath);

  // 信号处理
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log();
    console.log('正在关闭...');
    try {
      await app.stop();
      console.log('已停止');
      process.exit(0);
    } catch (error) {
      console.error('关闭失败:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 启动
  try {
    await app.start();
    const runningChannels = app.getRunningChannels();
    const hasChannels = runningChannels.length > 0;

    // 日志文件路径
    console.log(`  \x1b[2m日志文件:\x1b[0m ${getLogFilePath()}`);

    // 未配置通道时显示警告
    if (!hasChannels) {
      console.log();
      console.log('\x1b[33m  ⚠ 未配置消息通道\x1b[0m');
      console.log();
      console.log('  Agent 已启动但无法接收消息。');
      console.log();
      console.log('  请编辑 \x1b[36m~/.micro-agent/settings.yaml\x1b[0m 启用飞书等通道');
      console.log('─'.repeat(50));
    } else {
      console.log();
      console.log('按 Ctrl+C 停止');
      console.log('─'.repeat(50));
    }
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

/** CLI 主入口 */
export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  // 解析全局选项
  const parsed = parseArgs({
    args: argv,
    options: {
      config: { type: 'string', short: 'c' },
      verbose: { type: 'boolean', short: 'v' },
      quiet: { type: 'boolean', short: 'q' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const helpVal = parsed.values.help as boolean | undefined;
  const versionVal = parsed.values.version as boolean | undefined;
  const verboseVal = parsed.values.verbose as boolean | undefined;
  const quietVal = parsed.values.quiet as boolean | undefined;
  const configVal = parsed.values.config as string | undefined;
  const { positionals } = parsed;

  // 全局选项
  if (helpVal && positionals.length === 0) {
    showHelp();
    return;
  }

  if (versionVal) {
    showVersion();
    return;
  }

  const command = positionals[0];
  const configPath = typeof configVal === 'string' ? configVal : undefined;
  
  // 日志级别：quiet > verbose > 默认
  const logLevel = quietVal ? 'warn' : (verboseVal ? 'debug' : 'info');

  switch (command) {
    case 'start':
      await startService(configPath, logLevel);
      break;

    case 'status': {
      const app = await createApp(configPath);
      showStatus(app);
      break;
    }

    case 'ext': {
      const { runExtCommand } = await import('./commands/ext');
      await runExtCommand(positionals.slice(1));
      break;
    }

    case undefined:
      showHelp();
      break;

    default:
      console.log(`未知命令: ${command}`);
      console.log('运行 micro-agent --help 查看帮助');
  }
}

// 直接运行时执行
if (import.meta.main) {
  runCli();
}
