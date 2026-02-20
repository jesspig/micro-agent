#!/usr/bin/env bun

/**
 * MicroBot CLI 入口
 * 
 * 命令:
 * - start: 启动服务
 * - status: 显示状态
 */

import { parseArgs } from 'util';
import { configure, getConsoleSink, getLogger } from '@logtape/logtape';
import { prettyFormatter } from '@logtape/pretty';
import { createApp } from './index';
import { loadConfig, getConfigStatus } from '@microbot/core/config';
import type { App } from './core/types/interfaces';

const VERSION = '0.1.0';

/** 初始化 LogTape */
async function initLogTape(): Promise<void> {
  await configure({
    sinks: {
      console: getConsoleSink({ formatter: prettyFormatter }),
    },
    loggers: [
      { category: [], sinks: ['console'], lowestLevel: 'info' },
      { category: ['logtape', 'meta'], lowestLevel: 'warning' },
    ],
    reset: true,
  });
}

const log = getLogger(['cli']);

/** 显示帮助信息 */
function showHelp(): void {
  console.log(`
MicroBot - 轻量级 AI 助手框架

用法:
  microbot [命令] [选项]

命令:
  start       启动服务
  status      显示状态

选项:
  -c, --config <path>   配置文件路径
  -h, --help            显示帮助
  -v, --version         显示版本

示例:
  microbot start
  microbot start -c ./config.yaml
  microbot status
`);
}

/** 显示版本 */
function showVersion(): void {
  console.log(`MicroBot v${VERSION}`);
}

/** 显示状态 */
function showStatus(app: App): void {
  const channels = app.getRunningChannels();
  const provider = app.getProviderStatus();

  console.log();
  console.log('\x1b[1m\x1b[36mMicroBot 状态\x1b[0m');
  console.log('─'.repeat(50));
  console.log(`  \x1b[2m通道:\x1b[0m ${channels.length > 0 ? channels.join(', ') : '无'}`);
  console.log(`  \x1b[2mProvider:\x1b[0m ${provider}`);
  console.log();
}

/** 启动服务 */
async function startService(configPath?: string): Promise<void> {
  console.log('\x1b[2J\x1b[H'); // 清屏
  console.log();
  console.log('\x1b[1m\x1b[36mMicroBot\x1b[0m');
  console.log('─'.repeat(50));

  // 检查配置状态
  const baseConfig = loadConfig(configPath ? { configPath } : {});
  const configStatus = getConfigStatus(baseConfig);

  if (configStatus.needsSetup) {
    console.log();
    console.log('\x1b[33m  ⚠ 未检测到用户配置\x1b[0m');
    console.log();
    console.log('  请编辑 ~/.microbot/settings.yaml 配置：');
    console.log('    1. 在 providers 中添加模型提供商');
    console.log('    2. 在 channels 中启用消息通道');
    console.log();
    console.log('  示例配置：');
    console.log('    \x1b[2mproviders:\x1b[0m');
    console.log('    \x1b[2m  ollama:\x1b[0m');
    console.log('    \x1b[2m    baseUrl: http://localhost:11434/v1\x1b[0m');
    console.log('    \x1b[2m    models: [qwen3]\x1b[0m');
    console.log();
  }

  const app = await createApp(configPath);

  // 信号处理
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log();
    log.info('正在关闭...');
    try {
      await app.stop();
      log.info('已停止');
      process.exit(0);
    } catch (error) {
      log.error('关闭失败: {error}', { error });
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 启动
  try {
    await app.start();
    const routerStatus = app.getRouterStatus();
    console.log('─'.repeat(50));
    console.log(`  \x1b[2m通道:\x1b[0m ${app.getRunningChannels().join(', ') || '无'}`);
    console.log(`  \x1b[2m模型:\x1b[0m ${routerStatus.chatModel}`);
    if (routerStatus.auto) {
      const mode = routerStatus.max ? '性能优先' : '速度优先';
      console.log(`  \x1b[2m路由:\x1b[0m 自动 (${mode})`);
    } else {
      console.log(`  \x1b[2m路由:\x1b[0m 固定`);
    }
    console.log();
    log.debug('按 Ctrl+C 停止');
    console.log('─'.repeat(50));
  } catch (error) {
    log.error('启动失败: {error}', { error });
    process.exit(1);
  }
}

/** CLI 主入口 */
export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  // 初始化 LogTape（必须在所有日志调用之前）
  await initLogTape();

  // 解析全局选项
  const parsed = parseArgs({
    args: argv,
    options: {
      config: { type: 'string', short: 'c' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    allowPositionals: true,
    strict: false,
  });

  const { help, version, config } = parsed.values;
  const positionals = parsed.positionals;

  // 全局选项
  if (help && positionals.length === 0) {
    showHelp();
    return;
  }

  if (version) {
    showVersion();
    return;
  }

  const command = positionals[0];
  const configPath = typeof config === 'string' ? config : undefined;

  switch (command) {
    case 'start':
      await startService(configPath);
      break;

    case 'status': {
      const app = await createApp(configPath);
      showStatus(app);
      break;
    }

    case undefined:
      showHelp();
      break;

    default:
      log.warn('未知命令: {command}', { command });
      log.info('运行 microbot --help 查看帮助');
  }
}

// 直接运行时执行
if (import.meta.main) {
  runCli();
}
