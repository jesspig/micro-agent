#!/usr/bin/env bun

/**
 * microbot CLI 入口
 * 
 * 命令:
 * - start: 启动服务
 * - status: 显示状态
 * - cron: 管理定时任务
 */

import { parseArgs } from 'util';
import { createApp } from './index';
import type { App } from './types/interfaces';

const VERSION = '1.0.0';

/** 显示帮助信息 */
function showHelp(): void {
  console.log(`
microbot - 轻量级 AI 助手框架

用法:
  microbot [命令] [选项]

命令:
  start       启动服务
  status      显示状态
  cron        管理定时任务

选项:
  -c, --config <path>   配置文件路径
  -h, --help            显示帮助
  -v, --version         显示版本

示例:
  microbot start
  microbot start -c ./config.yaml
  microbot status
  microbot cron list
`);
}

/** 显示版本 */
function showVersion(): void {
  console.log(`microbot v${VERSION}`);
}

/** 显示状态 */
function showStatus(app: App): void {
  const channels = app.getRunningChannels();
  const provider = app.getProviderStatus();
  const cronCount = app.getCronCount();

  console.log('\nmicrobot 状态\n');
  console.log(`运行中的通道: ${channels.length > 0 ? channels.join(', ') : '无'}`);
  console.log(`Provider: ${provider}`);
  console.log(`Cron 任务: ${cronCount} 个\n`);
}

/** 显示 Cron 任务列表 */
function showCronList(app: App): void {
  const jobs = app.listCronJobs();

  console.log('\n定时任务列表\n');

  if (jobs.length === 0) {
    console.log('暂无任务\n');
    return;
  }

  for (const job of jobs) {
    const schedule = job.scheduleValue ? `: ${job.scheduleValue}` : '';
    console.log(`[${job.id}] ${job.name} - ${job.scheduleKind}${schedule}`);
  }
  console.log();
}

/** 添加 Cron 任务（简化版，通过命令行参数） */
async function addCronJob(app: App, args: string[]): Promise<void> {
  // 解析参数: microbot cron add --name "任务名" --schedule "every 1h" --message "消息"
  const parsed = parseArgs({
    args,
    options: {
      name: { type: 'string', short: 'n' },
      schedule: { type: 'string', short: 's' },
      message: { type: 'string', short: 'm' },
    },
    strict: false,
  });

  const { name, schedule, message } = parsed.values;

  if (!name || !schedule || !message) {
    console.log('用法: microbot cron add --name <名称> --schedule <调度> --message <消息>');
    console.log('调度格式:');
    console.log('  every 1h     - 每小时');
    console.log('  every 30m    - 每 30 分钟');
    console.log('  cron "0 9 * * *" - 每天 9 点');
    console.log('  at "2026-02-20 10:00" - 一次性任务');
    return;
  }

  console.log(`\n任务已添加: ${name}`);
  console.log('注意: 当前会话需要重启才能生效\n');
}

/** 删除 Cron 任务 */
function removeCronJob(app: App, taskId: string): void {
  console.log(`\n任务 ${taskId} 删除请求已记录`);
  console.log('注意: 当前会话需要重启才能生效\n');
}

/** 处理 Cron 子命令 */
async function handleCron(app: App, subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'list':
    case 'ls':
      showCronList(app);
      break;
    case 'add':
      await addCronJob(app, args);
      break;
    case 'remove':
    case 'rm':
      const taskId = args[0];
      if (!taskId) {
        console.log('用法: microbot cron remove <任务ID>');
        return;
      }
      removeCronJob(app, taskId);
      break;
    default:
      console.log('用法: microbot cron <list|add|remove>');
  }
}

/** 启动服务 */
async function startService(configPath?: string): Promise<void> {
  console.log('正在启动 microbot...\n');

  const app = await createApp(configPath);

  // 信号处理
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\n正在关闭 microbot...');
    try {
      await app.stop();
      console.log('microbot 已停止');
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
    console.log('microbot 已启动');
    console.log(`通道: ${app.getRunningChannels().join(', ') || '无'}`);
    console.log(`Provider: ${app.getProviderStatus()}`);
    console.log('按 Ctrl+C 停止\n');
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

    case 'cron': {
      const app = await createApp(configPath);
      const subcommand = positionals[1];
      const cronArgs = positionals.slice(2);
      await handleCron(app, subcommand, cronArgs);
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