#!/usr/bin/env bun

/**
 * MicroBot CLI 入口
 *
 * 命令:
 * - start: 启动服务
 * - chat:  交互式对话
 * - status: 显示状态
 * - ext: 扩展管理
 */

import { parseArgs } from 'util';
import { createInterface } from 'readline';
import { initLogger } from '@microbot/config';
import { createApp } from './app';
import { loadConfig, getConfigStatus } from '@microbot/config';
import type { App } from '@microbot/types';

const VERSION = '0.2.0';

/** 显示帮助信息 */
function showHelp(): void {
  console.log(`
MicroBot - 轻量级 AI 助手框架

用法:
  microbot [命令] [选项]

命令:
  start       启动服务（连接外部通道）
  chat        交互式对话（终端直接对话）
  status      显示状态
  ext         扩展管理

选项:
  -c, --config <path>   配置文件路径
  -v, --verbose         显示详细日志
  -h, --help            显示帮助
      --version         显示版本

示例:
  microbot chat              # 终端对话
  microbot start             # 启动服务连接飞书/钉钉
  microbot start -v
  microbot start -c ./config.yaml
  microbot status
  microbot ext list
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

/** 交互式对话模式 */
async function chatService(configPath?: string): Promise<void> {
  console.log('\x1b[2J\x1b[H');
  console.log();
  console.log('\x1b[1m\x1b[36mMicroBot Chat\x1b[0m');
  console.log('─'.repeat(50));

  const baseConfig = loadConfig(configPath ? { configPath } : {});
  const configStatus = getConfigStatus(baseConfig);

  if (configStatus.missingRequired.length > 0) {
    console.log();
    console.log('\x1b[33m  ⚠ 配置不完整\x1b[0m');
    console.log();
    console.log('  缺少必填项：');
    for (const item of configStatus.missingRequired) {
      console.log(`    \x1b[31m✗\x1b[0m ${item}`);
    }
    console.log();
    console.log('  请编辑 \x1b[36m~/.microbot/settings.yaml\x1b[0m 完成配置');
    console.log('─'.repeat(50));
    console.log();
    process.exit(1);
  }

  const app = await createApp(configPath);
  await app.start();

  const routerStatus = app.getRouterStatus();
  console.log(`  \x1b[2m对话模型:\x1b[0m ${routerStatus.chatModel}`);
  console.log('─'.repeat(50));
  console.log();
  console.log('输入消息开始对话，输入 /exit 退出');
  console.log();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise(resolve => {
      rl.question(prompt, resolve);
    });
  };

  // 主对话循环
  try {
    while (true) {
      const input = await question('\x1b[1m你:\x1b[0m ');

      if (!input.trim()) continue;
      if (input.trim().toLowerCase() === '/exit') {
        break;
      }

      try {
        // 发送消息到 Agent（响应已由 CliChannel 输出）
        await app.chat(input.trim());
      } catch (error) {
        console.log();
        console.log(`\x1b[31m错误: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
        console.log();
      }
    }
  } finally {
    rl.close();
    await app.stop();
    console.log('再见！');
  }
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
    console.log('  请编辑 \x1b[36m~/.microbot/settings.yaml\x1b[0m 完成配置后重启');
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
    const routerStatus = app.getRouterStatus();
    const runningChannels = app.getRunningChannels();
    const hasChannels = runningChannels.length > 0;

    console.log('─'.repeat(50));

    // 通道状态显示
    if (hasChannels) {
      console.log(`  \x1b[2m通道:\x1b[0m ${runningChannels.join(', ')}`);
    } else {
      console.log(`  \x1b[33m通道: 未配置\x1b[0m`);
    }

    console.log(`  \x1b[2m对话模型:\x1b[0m ${routerStatus.chatModel}`);
    if (routerStatus.visionModel) {
      console.log(`  \x1b[2m视觉模型:\x1b[0m ${routerStatus.visionModel}`);
    }
    if (routerStatus.coderModel) {
      console.log(`  \x1b[2m编程模型:\x1b[0m ${routerStatus.coderModel}`);
    }

    // 未配置通道时显示警告
    if (!hasChannels) {
      console.log();
      console.log('\x1b[33m  ⚠ 未配置消息通道\x1b[0m');
      console.log();
      console.log('  Agent 已启动但无法接收消息。请选择以下方式之一：');
      console.log();
      console.log('  \x1b[36m1. 配置外部通道\x1b[0m');
      console.log('     编辑 ~/.microbot/settings.yaml，启用飞书/钉钉等通道');
      console.log();
      console.log('  \x1b[36m2. 使用交互模式\x1b[0m');
      console.log('     运行: microbot chat');
      console.log();
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
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const helpVal = parsed.values.help as boolean | undefined;
  const versionVal = parsed.values.version as boolean | undefined;
  const configVal = parsed.values.config as string | undefined;
  const verboseVal = parsed.values.verbose as boolean | undefined;
  const { positionals } = parsed;

  // 初始化日志（必须在所有日志调用之前）
  await initLogger({ verbose: verboseVal });

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

  switch (command) {
    case 'start':
      await startService(configPath);
      break;

    case 'chat':
      await chatService(configPath);
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
      console.log('运行 microbot --help 查看帮助');
  }
}

// 直接运行时执行
if (import.meta.main) {
  runCli();
}
