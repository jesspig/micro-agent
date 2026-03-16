/**
 * config 命令实现
 *
 * 生成默认配置文件到 workspace/.agent/
 * 复制模板文件
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, existsSync } from "node:fs";
import {
  MICRO_AGENT_DIR,
  WORKSPACE_DIR,
  AGENT_DIR,
  SESSIONS_DIR,
  LOGS_DIR,
  HISTORY_DIR,
  SKILLS_DIR,
} from "../../shared/constants.js";
import {
  cliLogger,
  createTimer,
  logMethodCall,
  logMethodReturn,
  logMethodError,
} from "../../shared/logger.js";

const logger = cliLogger();

// ============================================================================
// 常量定义
// ============================================================================

/** 模板目录（相对于当前文件） */
const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "templates"
);

/** 需要复制到 Agent 目录的模板文件 */
const AGENT_TEMPLATE_FILES: Array<{ src: string; dest: string }> = [
  { src: "AGENTS.md", dest: "AGENTS.md" },
  { src: "SOUL.md", dest: "SOUL.md" },
  { src: "USER.md", dest: "USER.md" },
  { src: "TOOLS.md", dest: "TOOLS.md" },
  { src: "HEARTBEAT.md", dest: "HEARTBEAT.md" },
  { src: "MEMORY.md", dest: "MEMORY.md" },
  { src: "mcp.json", dest: "mcp.json" },
];

/** 需要复制到根目录的配置文件 */
const ROOT_TEMPLATE_FILES: Array<{ src: string; dest: string }> = [
  { src: "settings.example.yaml", dest: "settings.yaml" },
];

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 复制文件
 * @param src - 源文件路径
 * @param dest - 目标文件路径
 * @returns 是否成功复制
 */
async function copyFile(src: string, dest: string): Promise<boolean> {
  const timer = createTimer();
  logMethodCall(logger, { method: "copyFile", module: "CLI", params: { src, dest } });

  try {
    const srcFile = Bun.file(src);
    const exists = await srcFile.exists();

    if (!exists) {
      logger.debug("源文件不存在", { src });
      logMethodReturn(logger, { method: "copyFile", module: "CLI", result: { success: false, reason: "src_not_found" }, duration: timer() });
      return false;
    }

    const destFile = Bun.file(dest);
    const destExists = await destFile.exists();

    if (destExists) {
      logger.debug("目标文件已存在", { dest });
      logMethodReturn(logger, { method: "copyFile", module: "CLI", result: { success: false, reason: "dest_exists" }, duration: timer() });
      return false;
    }

    // 读取源文件内容并写入目标
    const content = await srcFile.text();
    await Bun.write(dest, content);

    logger.debug("文件复制成功", { src, dest });
    logMethodReturn(logger, { method: "copyFile", module: "CLI", result: { success: true }, duration: timer() });
    return true;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, {
      method: "copyFile",
      module: "CLI",
      error: { name: error.name, message: error.message },
      params: { src, dest },
      duration: timer(),
    });
    return false;
  }
}

// ============================================================================
// config 命令实现
// ============================================================================

/**
 * config 命令选项
 */
export interface ConfigOptions {
  /** 强制覆盖已存在的文件 */
  force?: boolean;
  /** 仅显示将要创建的文件 */
  dryRun?: boolean;
}

/**
 * config 命令结果
 */
export interface ConfigResult {
  /** 创建的目录列表 */
  directories: string[];
  /** 创建的文件列表 */
  files: string[];
  /** 跳过的文件列表 */
  skipped: string[];
  /** 错误列表 */
  errors: string[];
}

/**
 * 执行 config 命令
 *
 * @param options - 命令选项
 * @returns 执行结果
 */
export async function configCommand(
  options: ConfigOptions = {}
): Promise<ConfigResult> {
  const timer = createTimer();
  logMethodCall(logger, { method: "configCommand", module: "CLI", params: { force: options.force, dryRun: options.dryRun } });

  const result: ConfigResult = {
    directories: [],
    files: [],
    skipped: [],
    errors: [],
  };

  try {
    // 1. 创建目录结构
    logger.debug("创建目录结构");
    const directories = [
      MICRO_AGENT_DIR,
      WORKSPACE_DIR,
      AGENT_DIR,
      SESSIONS_DIR,
      LOGS_DIR,
      HISTORY_DIR,
      SKILLS_DIR,
    ];

    for (const dir of directories) {
      const exists = existsSync(dir);

      if (!exists) {
        if (options.dryRun) {
          result.directories.push(dir);
        } else {
          try {
            mkdirSync(dir, { recursive: true });
            result.directories.push(dir);
            logger.debug("目录创建成功", { dir });
          } catch (err) {
            const error = err as Error;
            const message = error.message;
            result.errors.push(`目录创建失败: ${dir} - ${message}`);
            logger.error("目录创建失败", { dir, error: message });
          }
        }
      } else {
        result.skipped.push(dir);
      }
    }

    // 2. 复制 Agent 目录模板文件
    logger.debug("复制 Agent 目录模板文件");
    for (const { src: srcFile, dest: destFile } of AGENT_TEMPLATE_FILES) {
      const src = join(TEMPLATES_DIR, srcFile);
      const dest = join(AGENT_DIR, destFile);

      if (options.dryRun) {
        const destExists = await Bun.file(dest).exists();
        if (destExists && !options.force) {
          result.skipped.push(destFile);
        } else {
          result.files.push(destFile);
        }
        continue;
      }

      const destExists = await Bun.file(dest).exists();

      if (destExists && !options.force) {
        result.skipped.push(destFile);
        continue;
      }

      const copied = await copyFile(src, dest);
      if (copied) {
        result.files.push(destFile);
      } else {
        result.skipped.push(destFile);
      }
    }

    // 3. 复制根目录配置文件（settings.yaml）
    logger.debug("复制根目录配置文件");
    for (const { src: srcFile, dest: destFile } of ROOT_TEMPLATE_FILES) {
      const src = join(TEMPLATES_DIR, srcFile);
      const dest = join(MICRO_AGENT_DIR, destFile);

      if (options.dryRun) {
        const destExists = await Bun.file(dest).exists();
        if (destExists && !options.force) {
          result.skipped.push(destFile);
        } else {
          result.files.push(destFile);
        }
        continue;
      }

      const destExists = await Bun.file(dest).exists();

      if (destExists && !options.force) {
        result.skipped.push(destFile);
        continue;
      }

      const copied = await copyFile(src, dest);
      if (copied) {
        result.files.push(destFile);
      } else {
        result.skipped.push(destFile);
      }
    }

    logger.info("配置命令执行完成", {
      directoryCount: result.directories.length,
      fileCount: result.files.length,
      skippedCount: result.skipped.length,
      errorCount: result.errors.length,
      dryRun: options.dryRun,
    });
    logMethodReturn(logger, { method: "configCommand", module: "CLI", result: { directories: result.directories.length, files: result.files.length, skipped: result.skipped.length, errors: result.errors.length }, duration: timer() });
    return result;
  } catch (err) {
    const error = err as Error;
    logMethodError(logger, {
      method: "configCommand",
      module: "CLI",
      error: { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) },
      params: { force: options.force, dryRun: options.dryRun },
      duration: timer(),
    });
    throw error;
  }
}

/**
 * 显示 config 命令帮助信息（保留接口，但不做任何输出）
 */
export function showConfigHelp(): void {
  // 已移除所有 console.log 调用
}
