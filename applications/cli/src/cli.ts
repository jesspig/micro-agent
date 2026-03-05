/**
 * MicroAgent CLI 主逻辑
 */

import { parseArgs } from 'util';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createApp } from './app';

// 版本号
const VERSION = (() => {
  try {
    const pkgPath = join(import.meta.dir, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/** 显示帮助 */
function showHelp(): void {
  console.log(`
MicroAgent - 轻量级 AI 助手框架

用法:
  micro-agent [命令] [选项]

命令:
  start       启动服务（连接 Agent Service + 飞书）
  status      显示状态

选项:
  -v, --verbose         详细日志
  -q, --quiet           静默模式
  -h, --help            显示帮助
      --version         显示版本

示例:
  micro-agent start             # 启动服务
  micro-agent start -v          # 详细模式
  micro-agent status
`);
}

/** 显示版本 */
function showVersion(): void {
  console.log(`MicroAgent v${VERSION}`);
}

/** 启动服务 */
async function startService(verbose: boolean, quiet: boolean): Promise<void> {
  const logLevel = quiet ? 'warn' : (verbose ? 'debug' : 'info');

  console.log('\x1b[2J\x1b[H');
  console.log();
  console.log('\x1b[1m\x1b[36mMicroAgent\x1b[0m');
  console.log('─'.repeat(50));

  if (logLevel === 'debug') {
    console.log('  \x1b[90m日志级别:\x1b[0m \x1b[36mDEBUG\x1b[0m (详细模式)');
  } else if (logLevel === 'warn') {
    console.log('  \x1b[90m日志级别:\x1b[0m \x1b[33mWARN\x1b[0m (静默模式)');
  }

  const app = await createApp({ logLevel });

  // 信号处理
  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShutterDown) return;
    isShutterDown = true;
    console.log();
    console.log('正在关闭...');
    await app.stop();
    console.log('已停止');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await app.start();
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

/** CLI 主入口 */
export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs({
    args: argv,
    options: {
      verbose: { type: 'boolean', short: 'v' },
      quiet: { type: 'boolean', short: 'q' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const { positionals } = parsed;
  const verbose = parsed.values.verbose as boolean;
  const quiet = parsed.values.quiet as boolean;
  const help = parsed.values.help as boolean;
  const version = parsed.values.version as boolean;

  if (help && positionals.length === 0) {
    showHelp();
    return;
  }

  if (version) {
    showVersion();
    return;
  }

  const command = positionals[0];

  switch (command) {
    case 'start':
      await startService(verbose, quiet);
      break;

    case undefined:
      showHelp();
      break;

    default:
      console.log(`未知命令: ${command}`);
      console.log('运行 micro-agent --help 查看帮助');
  }
}
