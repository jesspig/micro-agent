/**
 * MicroAgent CLI 主逻辑
 */

import { parseArgs } from 'util';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createApp } from './app';
import { performConfigCheck } from './modules/config-check';
import { initLogging, getLogFilePath } from '@micro-agent/sdk/runtime';
import { runExtCommand } from './commands';

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

/**
 * 拦截第三方库的冗余日志
 * 
 * 过滤规则：
 * - `[info]:` - 飞书 SDK 的信息日志，抑制
 * - `[warn]:` - 飞书 SDK 的警告日志，显示
 * - `[error]:` - 飞书 SDK 的错误日志，显示
 */
function suppressThirdPartyLogs(): void {
  const originalLog = console.log;
  const originalError = console.error;

  // 拦截 console.log
  console.log = (...args: unknown[]) => {
    const str = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    
    // 飞书 SDK 的 [info]: 日志，抑制
    if (str.startsWith('[info]:')) {
      return;
    }
    
    // 飞书 SDK 的 [warn]: 日志，显示为黄色警告
    if (str.startsWith('[warn]:')) {
      console.error('\x1b[33m[飞书]\x1b[0m', str.slice(7).trim());
      return;
    }
    
    // 其他日志正常输出
    originalLog(...args);
  };

  // 拦截 console.error
  console.error = (...args: unknown[]) => {
    const str = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    
    // 飞书 SDK 的错误日志，显示为红色
    if (str.startsWith('[error]:')) {
      originalError('\x1b[31m[飞书错误]\x1b[0m', str.slice(8).trim());
      return;
    }
    
    // 其他错误正常输出
    originalError(...args);
  };
}

/** 初始化日志系统 */
async function initLoggingSystem(level: 'debug' | 'info' | 'warn' = 'info'): Promise<void> {
  // CLI 只启用文件日志，禁用控制台输出
  // 避免与 UI 输出混淆
  await initLogging({
    console: false,
    file: true,
    level,
    traceEnabled: level === 'debug',
  });
}

/** 显示帮助 */
function showHelp(): void {
  console.log(`
MicroAgent - 轻量级 AI 助手框架

用法:
  micro-agent [命令] [选项]

命令:
  start       启动服务（连接 Agent Service + 飞书）
  status      显示状态
  ext         扩展管理（工具、技能、通道）

选项:
  -c, --config <path>   配置文件路径
  -v, --verbose         详细日志
  -q, --quiet           静默模式
  -h, --help            显示帮助
      --version         显示版本

示例:
  micro-agent start             # 启动服务
  micro-agent start -v          # 详细模式
  micro-agent start -c ./config.yaml
  micro-agent status
  micro-agent ext list          # 列出扩展
`);
}

/** 显示版本 */
function showVersion(): void {
  console.log(`MicroAgent v${VERSION}`);
}

/** 启动服务 */
async function startService(verbose: boolean, quiet: boolean, configPath?: string): Promise<void> {
  const logLevel = quiet ? 'warn' : (verbose ? 'debug' : 'info');

  // 设置 verbose 环境变量，供日志处理器判断
  if (verbose) {
    process.env.MICRO_AGENT_VERBOSE = 'true';
  }

  // 拦截第三方库的冗余日志（必须在最前面）
  suppressThirdPartyLogs();

  // 初始化日志系统
  await initLoggingSystem(logLevel);

  // 清屏并显示标题（UI 元素，使用 console.log）
  console.log('\x1b[2J\x1b[H');
  console.log();
  console.log('\x1b[1m\x1b[36mMicroAgent\x1b[0m');
  console.log('─'.repeat(50));

  // 检查配置状态（显示警告但不阻止启动）
  performConfigCheck(configPath);
  
  const app = await createApp({ 
    logLevel,
    verbose,
    configPath,
  });

  // 信号处理
  let isShutterDown = false;
  const shutdown = async () => {
    if (isShutterDown) return;
    isShutterDown = true;
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

  try {
    await app.start();
    
    // 显示日志文件路径（UI 元素）
    console.log(`  \x1b[2m日志文件:\x1b[0m ${getLogFilePath()}`);
    console.log();
    console.log('按 Ctrl+C 停止');
    console.log('─'.repeat(50));
  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

/** 显示状态 */
async function showStatus(): Promise<void> {
  console.log();
  console.log('MicroAgent 状态');
  console.log('─'.repeat(50));

  // 从 SDK 导入配置相关模块
  const { loadConfig, getConfigStatus, USER_CONFIG_DIR } = await import('@micro-agent/sdk');
  const { existsSync } = await import('fs');
  const { join } = await import('path');
  const { homedir } = await import('os');

  const configPath = join(USER_CONFIG_DIR, 'settings.yaml');
  const configExists = existsSync(configPath);
  const displayPath = configPath.replace(homedir(), '~');

  console.log(`  配置文件: ${configExists ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${displayPath}`);

  if (!configExists) {
    console.log();
    console.log('  \x1b[33m提示:\x1b[0m 请运行 \x1b[36mmicro-agent start\x1b[0m 初始化配置');
    console.log();
    return;
  }

  // 加载并显示配置状态
  try {
    const config = loadConfig({});
    const status = getConfigStatus(config);

    console.log();

    // 显示 Provider 状态
    const providerNames = Object.keys(config.providers || {});
    if (providerNames.length > 0) {
      console.log(`  Provider: \x1b[32m✓\x1b[0m ${providerNames.join(', ')}`);
    } else {
      console.log('  Provider: \x1b[33m未配置\x1b[0m');
    }

    // 显示模型配置
    const models = config.agents?.models;
    if (models?.chat) {
      console.log(`  对话模型: \x1b[32m✓\x1b[0m ${models.chat}`);
    } else {
      console.log('  对话模型: \x1b[33m未配置\x1b[0m');
    }
    if (models?.embed) {
      console.log(`  嵌入模型: \x1b[32m✓\x1b[0m ${models.embed}`);
    }

    // 显示通道状态
    const channels = Object.entries(config.channels || {})
      .filter(([, ch]) => ch && typeof ch === 'object' && 'enabled' in ch && (ch as { enabled?: boolean }).enabled)
      .map(([name]) => name);

    console.log();
    if (channels.length > 0) {
      console.log(`  启用通道: \x1b[32m✓\x1b[0m ${channels.join(', ')}`);
    } else {
      console.log('  启用通道: \x1b[33m无\x1b[0m');
    }

    // 显示配置缺失警告
    if (status.missingRequired.length > 0) {
      console.log();
      console.log('  \x1b[33m⚠ 配置不完整:\x1b[0m');
      for (const item of status.missingRequired) {
        console.log(`    \x1b[31m•\x1b[0m 未配置 ${item}`);
      }
    }

    console.log();
    console.log('─'.repeat(50));
    console.log('  运行 \x1b[36mmicro-agent start\x1b[0m 启动服务');
    console.log();
  } catch (error) {
    console.log();
    console.log(`  \x1b[31m配置加载失败:\x1b[0m ${(error as Error).message}`);
    console.log();
  }
}

/** CLI 主入口 */
export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
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

  const { positionals } = parsed;
  const verbose = parsed.values.verbose as boolean;
  const quiet = parsed.values.quiet as boolean;
  const help = parsed.values.help as boolean;
  const version = parsed.values.version as boolean;
  const configPath = parsed.values.config as string | undefined;

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
      await startService(verbose, quiet, configPath);
      break;

    case 'status':
      await showStatus();
      break;

    case 'ext':
      // ext 子命令参数从第二个位置参数开始
      await runExtCommand(positionals.slice(1));
      break;

    case undefined:
      showHelp();
      break;

    default:
      console.log(`未知命令: ${command}`);
      console.log('运行 micro-agent --help 查看帮助');
  }
}