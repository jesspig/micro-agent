#!/usr/bin/env bun
/**
 * MicroAgent CLI 主入口
 *
 * 提供 micro-agent 命令行工具
 *
 * 命令:
 *   micro-agent start [options]   启动 Agent 服务
 *   micro-agent status            显示配置和运行信息
 *   micro-agent config            生成默认配置文件
 */

import { configCommand, showConfigHelp } from "./options/config.js";
import { statusCommand, showStatusHelp } from "./options/status.js";
import { startCommand, showStartHelp } from "./options/start.js";

// ============================================================================
// 常量定义
// ============================================================================

/** 版本号 */
const VERSION = "0.1.0";

/** 命令名称 */
const COMMAND_NAME = "micro-agent";

// ============================================================================
// 帮助信息
// ============================================================================

/**
 * 显示主帮助信息
 */
function showMainHelp(): void {
  console.log(`
${COMMAND_NAME} - 基于 Bun + TypeScript 的轻量级 AI 助手

用法:
  ${COMMAND_NAME} <命令> [选项]

命令:
  start     启动 Agent 服务
  status    显示配置和运行信息
  config    生成默认配置文件

选项:
  --help, -h      显示帮助信息
  --version, -v   显示版本号

使用 "${COMMAND_NAME} <命令> --help" 查看命令详细帮助。

示例:
  ${COMMAND_NAME} config              # 初始化配置
  ${COMMAND_NAME} start               # 启动 Agent
  ${COMMAND_NAME} start --debug       # 调试模式启动
  ${COMMAND_NAME} status --verbose    # 显示详细状态

更多信息请访问: https://github.com/example/micro-agent
`);
}

/**
 * 显示版本号
 */
function showVersion(): void {
  console.log(`${COMMAND_NAME} v${VERSION}`);
}

// ============================================================================
// 参数解析
// ============================================================================

/**
 * 解析命令行参数
 *
 * 使用 Bun 原生解析，不依赖第三方库
 *
 * @param args - 命令行参数
 * @returns 解析结果
 */
function parseArgs(args: string[]): {
  command: string | null;
  options: Record<string, string | boolean>;
  positional: string[];
} {
  const result = {
    command: null as string | null,
    options: {} as Record<string, string | boolean>,
    positional: [] as string[],
  };

  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (!arg) {
      i++;
      continue;
    }

    // 长选项 --option 或 --option=value
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        // --option=value
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        result.options[key] = value;
      } else {
        // --option [value]
        const key = arg.slice(2);
        const nextArg = args[i + 1];

        // 检查是否是布尔选项
        if (
          nextArg &&
          !nextArg.startsWith("-") &&
          !["help", "version", "debug", "verbose", "force", "dry-run", "json"].includes(key)
        ) {
          result.options[key] = nextArg;
          i++;
        } else {
          result.options[key] = true;
        }
      }
    }
    // 短选项 -o 或 -o value
    else if (arg.startsWith("-") && arg.length > 1) {
      const flags = arg.slice(1);

      // 处理合并的短选项 -abc
      for (let j = 0; j < flags.length; j++) {
        const flag = flags[j];
        if (!flag) continue;

        // 映射短选项到长选项
        const optionMap: Record<string, string> = {
          h: "help",
          v: "version",
          d: "debug",
          c: "config",
          m: "model",
          f: "force",
        };

        const longOption = optionMap[flag] ?? flag;

        // 检查是否需要值
        if (
          j === flags.length - 1 &&
          ["config", "model", "log-level"].includes(longOption)
        ) {
          const nextArg = args[i + 1];
          if (nextArg && !nextArg.startsWith("-")) {
            result.options[longOption] = nextArg;
            i++;
          } else {
            result.options[longOption] = true;
          }
        } else {
          result.options[longOption] = true;
        }
      }
    }
    // 位置参数
    else {
      // 第一个位置参数是命令
      if (!result.command && !arg.includes("-")) {
        result.command = arg;
      } else {
        result.positional.push(arg);
      }
    }

    i++;
  }

  return result;
}

// ============================================================================
// 命令分发
// ============================================================================

/**
 * 执行命令
 *
 * @param command - 命令名称
 * @param options - 命令选项
 */
async function executeCommand(
  command: string | null,
  options: Record<string, string | boolean>
): Promise<void> {
  // 全局选项处理
  if (options.help) {
    if (command) {
      showCommandHelp(command);
    } else {
      showMainHelp();
    }
    process.exit(0);
  }

  if (options.version) {
    showVersion();
    process.exit(0);
  }

  // 无命令时显示帮助
  if (!command) {
    showMainHelp();
    process.exit(0);
  }

  // 命令分发
  switch (command) {
    case "start": {
      const startOpts: {
        config?: string;
        model?: string;
        debug?: boolean;
        logLevel?: "debug" | "info" | "warn" | "error";
      } = {
        debug: !!options.debug,
      };
      if (options.config) startOpts.config = options.config as string;
      if (options.model) startOpts.model = options.model as string;
      if (options["log-level"]) startOpts.logLevel = options["log-level"] as "debug" | "info" | "warn" | "error";

      await startCommand(startOpts);
      break;
    }

    case "status":
      await statusCommand({
        verbose: !!options.verbose,
        json: !!options.json,
      });
      break;

    case "config":
      await configCommand({
        force: !!options.force,
        dryRun: !!options["dry-run"],
      });
      break;

    default:
      console.log(`\n❌ 未知命令: ${command}`);
      console.log(`   运行 '${COMMAND_NAME} --help' 查看可用命令\n`);
      process.exit(1);
  }
}

/**
 * 显示命令帮助
 *
 * @param command - 命令名称
 */
function showCommandHelp(command: string): void {
  switch (command) {
    case "start":
      showStartHelp();
      break;
    case "status":
      showStatusHelp();
      break;
    case "config":
      showConfigHelp();
      break;
    default:
      console.log(`\n❌ 未知命令: ${command}\n`);
  }
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * CLI 主入口
 */
async function main(): Promise<void> {
  // 获取命令行参数（跳过 node/bun 和脚本路径）
  const args = process.argv.slice(2);

  // 解析参数
  const { command, options } = parseArgs(args);

  // 执行命令
  try {
    await executeCommand(command, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`\n❌ 执行失败: ${message}\n`);
    process.exit(1);
  }
}

// 启动 CLI
main();

// ============================================================================
// 导出
// ============================================================================

export {
  parseArgs,
  executeCommand,
  showMainHelp,
  showVersion,
  VERSION,
  COMMAND_NAME,
};

export { configCommand, showConfigHelp } from "./options/config.js";
export { statusCommand, showStatusHelp } from "./options/status.js";
export { startCommand, showStartHelp } from "./options/start.js";
