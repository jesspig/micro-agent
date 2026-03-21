/**
 * LogTape 日志配置模块
 *
 * 提供结构化 JSON 文件日志和人类可读的控制台输出
 */

import { configure, type Sink } from "@logtape/logtape";
import { join } from "node:path";
import { statSync, existsSync, writeFileSync } from "node:fs";
import { promises } from "node:fs";
import { LOGS_DIR } from "../constants.js";
import { createRollingFileSink, createConsoleSink } from "./sinks.js";
import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_LOG_MAX_FILE_SIZE_MB,
  MIN_LOG_FILE_SIZE_MB,
  MAX_LOG_FILE_SIZE_MB,
  DEFAULT_LOG_GRANULARITY,
  LOG_RETENTION_DAYS,
  DEFAULT_LOG_SANITIZE,
} from "../constants.js";

export type LogLevel = "debug" | "info" | "warning" | "error";

export interface LoggerConfig {
  level?: LogLevel;
  console?: boolean;
  file?: boolean;
  logDir?: string;
  color?: boolean;
  sanitize?: boolean;
  maxFileSize?: number;
  granularity?: string;
}

interface ParsedGranularity {
  raw: string;
  minutes: number;
  unit: "D" | "H" | "M";
}

let initialized = false;
let consoleLevel: LogLevel = "info";
let sanitizeEnabled = true;
let maxFileSizeBytes = DEFAULT_LOG_MAX_FILE_SIZE_MB * 1024 * 1024;
let granularity: ParsedGranularity = { raw: DEFAULT_LOG_GRANULARITY, minutes: 60, unit: "H" };
let currentLogFile: string | null = null;
let currentLogFileCreatedAt: number = 0;

export interface OriginalConsole {
  log: typeof console.log;
  info: typeof console.info;
  debug: typeof console.debug;
  warn: typeof console.warn;
  error: typeof console.error;
}

let originalConsoleRef: OriginalConsole | null = null;

export function setOriginalConsole(consoleRef: OriginalConsole): void {
  originalConsoleRef = consoleRef;
}

export function getOriginalConsole(): OriginalConsole | null {
  return originalConsoleRef;
}

export function parseGranularity(value: string): ParsedGranularity {
  const match = value.match(/^(\d+)([DHM])$/);
  if (!match) {
    return { raw: DEFAULT_LOG_GRANULARITY, minutes: 60, unit: "H" };
  }

  const num = parseInt(match[1]!, 10);
  const unit = match[2] as "D" | "H" | "M";

  let minutes: number;
  switch (unit) {
    case "D":
      minutes = num * 24 * 60;
      break;
    case "H":
      minutes = num * 60;
      break;
    case "M":
      minutes = num;
      break;
    default:
      minutes = 60;
  }

  return { raw: value, minutes, unit };
}

export function generateLogFileName(date: Date, gran: ParsedGranularity, iterator?: number): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  let baseName = `${year}-${month}-${day}`;

  switch (gran.unit) {
    case "D":
      break;
    case "H":
      const hour = String(date.getHours()).padStart(2, "0");
      baseName += `-${hour}`;
      break;
    case "M":
      const hourM = String(date.getHours()).padStart(2, "0");
      const minute = String(date.getMinutes()).padStart(2, "0");
      baseName += `-${hourM}-${minute}`;
      break;
  }

  if (iterator !== undefined && iterator > 0) {
    baseName += `-${iterator}`;
  }

  return `${baseName}.jsonl`;
}

export function getLogFilePath(logDir: string, gran: ParsedGranularity, maxSizeBytes: number): string {
  const now = Date.now();

  if (currentLogFile && currentLogFileCreatedAt > 0) {
    const elapsedMinutes = (now - currentLogFileCreatedAt) / (1000 * 60);

    if (elapsedMinutes >= gran.minutes) {
      currentLogFile = null;
      currentLogFileCreatedAt = 0;
    } else {
      try {
        const stats = statSync(currentLogFile);
        if (stats.size >= maxSizeBytes) {
          currentLogFile = null;
          currentLogFileCreatedAt = 0;
        }
      } catch {
        currentLogFile = null;
        currentLogFileCreatedAt = 0;
      }
    }
  }

  if (!currentLogFile) {
    const nowDate = new Date(now);
    let iterator = 0;
    let filePath = join(logDir, generateLogFileName(nowDate, gran, iterator));

    while (existsSync(filePath)) {
      try {
        const stats = statSync(filePath);
        if (stats.size < maxSizeBytes) {
          break;
        }
      } catch {
        break;
      }
      iterator++;
      filePath = join(logDir, generateLogFileName(nowDate, gran, iterator));
    }

    currentLogFile = filePath;
    currentLogFileCreatedAt = now;

    if (!existsSync(filePath)) {
      writeFileSync(filePath, "");
    }
  }

  return currentLogFile;
}

export function cleanupOldLogs(logDir: string): void {
  const cutoffTime = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  (async () => {
    try {
      const files = await promises.readdir(logDir);

      const deletePromises = [];
      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;

        const filePath = join(logDir, file);
        try {
          const stats = await promises.stat(filePath);
          if (stats.mtime.getTime() < cutoffTime) {
            deletePromises.push(promises.unlink(filePath));
          }
        } catch {
          // ignore
        }
      }

      await Promise.allSettled(deletePromises);
    } catch {
      // ignore
    }
  })();
}

export async function initLogger(config: LoggerConfig = {}): Promise<void> {
  if (initialized) {
    return;
  }

  parseLoggerConfig(config);

  const logDir = config.logDir ?? LOGS_DIR;
  const sinks = createLoggerSinks(config, logDir);
  await applyLogtapeConfig(sinks, config.console === true);

  initialized = true;
}

export function parseLoggerConfig(config: LoggerConfig): void {
  consoleLevel = config.level ?? DEFAULT_LOG_LEVEL;
  sanitizeEnabled = config.sanitize ?? DEFAULT_LOG_SANITIZE;

  const maxSizeMB = config.maxFileSize ?? DEFAULT_LOG_MAX_FILE_SIZE_MB;
  maxFileSizeBytes = Math.max(MIN_LOG_FILE_SIZE_MB, Math.min(MAX_LOG_FILE_SIZE_MB, maxSizeMB)) * 1024 * 1024;

  granularity = parseGranularity(config.granularity ?? DEFAULT_LOG_GRANULARITY);
}

export function createLoggerSinks(config: LoggerConfig, logDir: string): Record<string, Sink> {
  const sinks: Record<string, Sink> = {};

  if (config.file !== false) {
    sinks.jsonl = createRollingFileSink(logDir, granularity, maxFileSizeBytes, sanitizeEnabled);
  }

  if (config.console === true) {
    sinks.console = createConsoleSink(consoleLevel);
  }

  return sinks;
}

export async function applyLogtapeConfig(sinks: Record<string, Sink>, consoleEnabled: boolean): Promise<void> {
  await configure({
    sinks,
    loggers: [
      {
        category: ["microagent"],
        sinks: consoleEnabled ? ["jsonl", "console"] : ["jsonl"],
        lowestLevel: "debug",
      },
    ],
  });
}

export { getModuleLogger } from "./helpers.js";

export function isLoggerInitialized(): boolean {
  return initialized;
}

export function getDefaultLevel(): LogLevel {
  return consoleLevel;
}

export function getLoggerConfig() {
  return {
    level: consoleLevel,
    sanitize: sanitizeEnabled,
    maxFileSizeMB: maxFileSizeBytes / (1024 * 1024),
    granularity: granularity.raw,
  };
}
