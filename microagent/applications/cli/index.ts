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

// ============================================================================
// 全局静默配置（禁用所有 console 输出，包括第三方 SDK）
// 注意：保存原始 console 供日志系统使用
// ============================================================================
import { setOriginalConsole } from "../shared/logger.js";

// 保存原始 console 方法
setOriginalConsole({
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
});

// 禁用全局 console（第三方 SDK 将无法输出）
console.log = console.info = console.debug = console.warn = console.error = () => {};

// ============================================================================
// 导入模块
// ============================================================================

import { configCommand, showConfigHelp } from "./options/config.js";
import { statusCommand, showStatusHelp } from "./options/status.js";
import { startCommand, showStartHelp } from "./options/start.js";
import {
  cliLogger,
  createTimer,
  sanitize,
  logMethodCall,
  logMethodReturn,
  logMethodError,
  initLogger,
} from "../shared/logger.js";

const logger = cliLogger();

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
 * 显示主帮助信息（保留接口，但不做任何输出）
 */
function showMainHelp(): void {
  // 已移除所有 console.log 调用
}

/**
 * 显示版本号（保留接口，但不做任何输出）
 */
function showVersion(): void {
  // 已移除所有 console.log 调用
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
  const timer = createTimer();
  logMethodCall(logger, { method: "parseArgs", module: "CLI", params: { argCount: args.length } });

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

  logMethodReturn(logger, { method: "parseArgs", module: "CLI", result: sanitize(result), duration: timer() });
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
  const timer = createTimer();
  logMethodCall(logger, { method: "executeCommand", module: "CLI", params: { command, options } });

  try {
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
    logger.info("CLI命令执行", { command, options });
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
        logger.warn("未知命令", { command });
        process.exit(1);
    }

    logMethodReturn(logger, { method: "executeCommand", module: "CLI", result: { success: true }, duration: timer() });
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, {
      method: "executeCommand",
      module: "CLI",
      error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) },
      params: { command, options },
      duration: timer(),
    });
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
      process.exit(1);
  }
}

// ============================================================================
// 全局错误处理
// ============================================================================

/**
 * 设置全局错误处理器
 * 防止 SDK 内部错误导致进程崩溃
 */
function setupGlobalErrorHandlers(): void {
  const timer = createTimer();
  logMethodCall(logger, { method: "setupGlobalErrorHandlers", module: "CLI", params: {} });

  // 捕获未处理的 Promise rejection
  process.on("unhandledRejection", (reason, _promise) => {
    const message = reason instanceof Error ? reason.message : String(reason);

    // 网络错误（如 ECONNREFUSED）静默处理
    if (message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT") || message.includes("ENOTFOUND")) {
      logger.debug("网络错误已静默处理", { errorType: "unhandledRejection", message });
      return;
    }

    // 其他严重错误记录日志
    logger.error("未处理的 Promise rejection", { message, reason: sanitize(reason) });
    process.exit(1);
  });

  // 捕获未捕获的异常
  process.on("uncaughtException", (error) => {
    const message = error.message || String(error);

    // 网络错误静默处理
    if (message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT") || message.includes("ENOTFOUND")) {
      logger.debug("网络错误已静默处理", { errorType: "uncaughtException", message });
      return;
    }

    // 其他严重错误记录日志
    logger.error("未捕获的异常", { name: error.name, message: error.message, stack: error.stack });
    process.exit(1);
  });

  logMethodReturn(logger, { method: "setupGlobalErrorHandlers", module: "CLI", result: { success: true }, duration: timer() });
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * CLI 主入口
 */
async function main(): Promise<void> {
  const timer = createTimer();

  // 先获取命令行参数（跳过 node/bun 和脚本路径）
  const args = process.argv.slice(2);

  // 解析参数（提前解析以确定日志级别）
  const { command, options } = parseArgs(args);

  // 尝试加载配置以获取日志设置
  let logConfig: {
    level?: "debug" | "info" | "warning" | "error";
    sanitize?: boolean;
    maxFileSize?: number;
    granularity?: string;
  } = {};

  // 尝试加载配置文件中的日志设置
  if (command === "start" || command === "status") {
    try {
      const { loadSettings } = await import("../config/loader.js");
      const settings = await loadSettings(options.config as string | undefined);
      
      if (settings.logs) {
        logConfig = {
          level: settings.logs.level as "debug" | "info" | "warning" | "error",
          sanitize: settings.logs.sanitize,
          maxFileSize: settings.logs.maxFileSize,
          granularity: settings.logs.granularity,
        };
      }
    } catch {
      // 配置加载失败，使用默认配置
    }
  }

  // CLI 参数覆盖配置文件
  if (options.debug) {
    logConfig.level = "debug";
  } else if (options["log-level"]) {
    const levelMap: Record<string, "debug" | "info" | "warning" | "error"> = {
      debug: "debug",
      info: "info",
      warn: "warning",
      warning: "warning",
      error: "error",
    };
    logConfig.level = levelMap[options["log-level"] as string] ?? "info";
  }

  // 构建日志配置（只包含有值的属性）
  const loggerConfig: {
    console: boolean;
    level: "debug" | "info" | "warning" | "error";
    sanitize?: boolean;
    maxFileSize?: number;
    granularity?: string;
  } = {
    console: true,
    level: logConfig.level ?? "info",
  };
  
  if (logConfig.sanitize !== undefined) {
    loggerConfig.sanitize = logConfig.sanitize;
  }
  if (logConfig.maxFileSize !== undefined) {
    loggerConfig.maxFileSize = logConfig.maxFileSize;
  }
  if (logConfig.granularity !== undefined) {
    loggerConfig.granularity = logConfig.granularity;
  }

  // 初始化日志系统
  await initLogger(loggerConfig);

  logMethodCall(logger, { method: "main", module: "CLI", params: { argv: args } });

  try {
    // 设置全局错误处理器
    setupGlobalErrorHandlers();

    // 执行命令
    await executeCommand(command, options);

    logMethodReturn(logger, { method: "main", module: "CLI", result: { success: true }, duration: timer() });
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, {
      method: "main",
      module: "CLI",
      error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) },
      params: {},
      duration: timer(),
    });
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
