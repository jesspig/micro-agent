/**
 * LogTape 日志配置模块
 *
 * 提供结构化 JSON 文件日志和人类可读的控制台输出
 * 
 * 日志策略：
 * - 文件日志：JSON Lines 格式（每行一个 JSON 对象），用于问题定位和调试
 * - 控制台日志：人类可读格式，支持颜色输出
 * - 日志文件存储在 ~/.micro-agent/logs/ 目录
 * - 按时间和大小滚动，自动保留最近 7 天的日志
 * - 支持敏感信息脱敏
 */

import { configure, getLogger, type Logger, type LogRecord, type Sink } from "@logtape/logtape";
import { join } from "node:path";
import { mkdirSync, statSync, readdirSync, unlinkSync, existsSync, writeFileSync, appendFileSync } from "node:fs";
import { LOGS_DIR } from "./constants.js";
import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_LOG_MAX_FILE_SIZE_MB,
  MIN_LOG_FILE_SIZE_MB,
  MAX_LOG_FILE_SIZE_MB,
  DEFAULT_LOG_GRANULARITY,
  LOG_RETENTION_DAYS,
  DEFAULT_LOG_SANITIZE,
} from "./constants.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 日志级别 */
export type LogLevel = "debug" | "info" | "warning" | "error";

/**
 * 日志配置选项
 */
export interface LoggerConfig {
  /** 控制台日志级别 */
  level?: LogLevel;
  /** 是否输出到控制台 */
  console?: boolean;
  /** 是否输出到文件 */
  file?: boolean;
  /** 自定义日志目录 */
  logDir?: string;
  /** 是否启用颜色输出（仅控制台） */
  color?: boolean;
  /** 是否开启敏感信息脱敏 */
  sanitize?: boolean;
  /** 单个日志文件最大大小（MB） */
  maxFileSize?: number;
  /** 日志颗粒度，格式如 1D/6H/30M */
  granularity?: string;
}

/**
 * 解析后的日志颗粒度
 */
interface ParsedGranularity {
  /** 原始值 */
  raw: string;
  /** 时间间隔（分钟） */
  minutes: number;
  /** 单位：D=天, H=小时, M=分钟 */
  unit: "D" | "H" | "M";
}

/**
 * 方法调用日志数据
 */
export interface MethodCallLogData {
  /** 方法名 */
  method: string;
  /** 类名或模块名 */
  module: string;
  /** 接收的参数 */
  params?: Record<string, unknown>;
  /** 调用来源 */
  caller?: string;
}

/**
 * 方法返回日志数据
 */
export interface MethodReturnLogData {
  /** 方法名 */
  method: string;
  /** 类名或模块名 */
  module: string;
  /** 返回值（脱敏后） */
  result?: unknown;
  /** 执行耗时（毫秒） */
  duration?: number;
}

/**
 * 方法错误日志数据
 */
export interface MethodErrorLogData {
  /** 方法名 */
  method: string;
  /** 类名或模块名 */
  module: string;
  /** 错误信息 */
  error: {
    name: string;
    message: string;
    stack?: string | undefined;
  };
  /** 接收的参数 */
  params?: Record<string, unknown>;
  /** 执行耗时（毫秒） */
  duration?: number;
}

// ============================================================================
// 全局状态
// ============================================================================

/** 是否已初始化 */
let initialized = false;

/** 当前控制台日志级别 */
let consoleLevel: LogLevel = "info";

/** 是否启用颜色 */
let colorEnabled = true;

/** 是否启用脱敏 */
let sanitizeEnabled = true;

/** 日志文件最大大小（字节） */
let maxFileSizeBytes = DEFAULT_LOG_MAX_FILE_SIZE_MB * 1024 * 1024;

/** 日志颗粒度 */
let granularity: ParsedGranularity = { raw: DEFAULT_LOG_GRANULARITY, minutes: 60, unit: "H" };

/** 当前日志文件路径 */
let currentLogFile: string | null = null;

/** 当前日志文件创建时间 */
let currentLogFileCreatedAt: number = 0;

/** 原始 console 方法（在 CLI 禁用全局 console 前保存） */
let originalConsole: {
  log: typeof console.log;
  info: typeof console.info;
  debug: typeof console.debug;
  warn: typeof console.warn;
  error: typeof console.error;
} | null = null;

/**
 * 设置原始 console 方法
 * 在 CLI 禁用全局 console 之前调用
 */
export function setOriginalConsole(console: {
  log: typeof globalThis.console.log;
  info: typeof globalThis.console.info;
  debug: typeof globalThis.console.debug;
  warn: typeof globalThis.console.warn;
  error: typeof globalThis.console.error;
}): void {
  originalConsole = console;
}

// ============================================================================
// 颜色定义（ANSI 转义码）
// ============================================================================

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

/** 日志级别背景色（用于标签） */
const LEVEL_BG_COLORS: Record<string, string> = {
  debug: "\x1b[100m", // 灰色背景
  info: "\x1b[44m",   // 蓝色背景
  warning: "\x1b[43m", // 黄色背景
  error: "\x1b[41m",  // 红色背景
};

// ============================================================================
// 敏感信息脱敏
// ============================================================================

/** 敏感字段名称列表 */
const SENSITIVE_FIELDS = [
  "token",
  "accessToken",
  "access_token",
  "secret",
  "key",
  "password",
  "credential",
  "authorization",
  "clientSecret",
  "client_secret",
  "appSecret",
  "app_secret",
  "apiKey",
  "api_key",
  "corpId",
  "corp_id",
  "botId",
  "bot_id",
];

/** Token 可见长度 */
const TOKEN_VISIBLE_LENGTH = 8;

/**
 * 脱敏 token 显示
 */
function maskToken(token: string): string {
  if (!token || token.length <= TOKEN_VISIBLE_LENGTH * 2) {
    return "***";
  }
  const start = token.substring(0, TOKEN_VISIBLE_LENGTH);
  const end = token.substring(token.length - TOKEN_VISIBLE_LENGTH);
  return `${start}...${end}`;
}

/**
 * 脱敏字符串中的敏感信息
 */
function sanitizeString(str: string): string {
  let sanitized = str;

  // 替换常见的 token 格式
  sanitized = sanitized.replace(
    /(Bearer\s+|QQBot\s+)([A-Za-z0-9_-]+)/gi,
    (_, prefix) => `${prefix}***`
  );

  // 匹配 JSON 中的敏感字段
  for (const field of SENSITIVE_FIELDS) {
    const jsonPattern = new RegExp(`("${field}"\\s*:\\s*")([^"]+)(")`, "gi");
    sanitized = sanitized.replace(jsonPattern, `$1***$3`);

    const kvPattern = new RegExp(`(${field}=)([^&\\s]+)`, "gi");
    sanitized = sanitized.replace(kvPattern, `$1***`);
  }

  return sanitized;
}

/**
 * 脱敏对象中的敏感字段
 */
function sanitizeObject<T>(obj: T, depth: number = 0): T {
  // 防止无限递归
  if (depth > 10) {
    return obj;
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj) as T;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1)) as T;
  }

  if (obj instanceof Date) {
    return obj;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      if (typeof value === "string") {
        result[key] = maskToken(value);
      } else {
        result[key] = "[REDACTED]";
      }
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeObject(value, depth + 1);
    } else if (typeof value === "string") {
      result[key] = sanitizeString(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * 脱敏日志记录属性
 */
function sanitizeProperties(props: Record<string, unknown>): Record<string, unknown> {
  if (!sanitizeEnabled) {
    return props;
  }
  return sanitizeObject(props);
}

// ============================================================================
// 颗粒度解析
// ============================================================================

/**
 * 解析颗粒度字符串
 * 
 * @param value - 颗粒度字符串，如 "1D", "6H", "30M"
 * @returns 解析后的颗粒度信息
 */
function parseGranularity(value: string): ParsedGranularity {
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

// ============================================================================
// 日志文件名生成
// ============================================================================

/**
 * 生成日志文件名
 * 
 * 文件名精度由单位决定：
 * - D: YYYY-MM-DD.jsonl（精确到天）
 * - H: YYYY-MM-DD-HH.jsonl（精确到小时）
 * - M: YYYY-MM-DD-HH-MM.jsonl（精确到分钟）
 * 
 * @param date - 日期
 * @param granularity - 颗粒度信息
 * @param iterator - 迭代器（用于大小滚动）
 */
function generateLogFileName(date: Date, gran: ParsedGranularity, iterator?: number): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  
  let baseName = `${year}-${month}-${day}`;

  // 根据单位决定文件名精度
  switch (gran.unit) {
    case "D":
      // 精确到天，不添加时间部分
      break;
    case "H":
      // 精确到小时
      const hour = String(date.getHours()).padStart(2, "0");
      baseName += `-${hour}`;
      break;
    case "M":
      // 精确到分钟
      const hourM = String(date.getHours()).padStart(2, "0");
      const minute = String(date.getMinutes()).padStart(2, "0");
      baseName += `-${hourM}-${minute}`;
      break;
  }

  // 添加迭代器（大小滚动时使用）
  if (iterator !== undefined && iterator > 0) {
    baseName += `-${iterator}`;
  }

  return `${baseName}.jsonl`;
}

/**
 * 获取当前应该使用的日志文件路径
 * 
 * 检查是否需要滚动：
 * 1. 时间滚动：当前时间超出颗粒度范围
 * 2. 大小滚动：当前文件超出最大大小
 */
function getLogFilePath(logDir: string, gran: ParsedGranularity, maxSizeBytes: number): string {
  const now = Date.now();
  
  // 检查是否需要新建文件
  if (currentLogFile && currentLogFileCreatedAt > 0) {
    const elapsedMinutes = (now - currentLogFileCreatedAt) / (1000 * 60);
    
    // 时间滚动
    if (elapsedMinutes >= gran.minutes) {
      currentLogFile = null;
      currentLogFileCreatedAt = 0;
    } else {
      // 大小滚动
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
  
  // 创建新文件
  if (!currentLogFile) {
    const nowDate = new Date(now);
    let iterator = 0;
    let filePath = join(logDir, generateLogFileName(nowDate, gran, iterator));
    
    // 查找可用的文件名（处理大小滚动）
    while (existsSync(filePath)) {
      try {
        const stats = statSync(filePath);
        if (stats.size < maxSizeBytes) {
          // 文件存在且未满，使用它
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
    
    // 确保文件存在
    if (!existsSync(filePath)) {
      writeFileSync(filePath, "");
    }
  }
  
  return currentLogFile;
}

// ============================================================================
// 日志清理
// ============================================================================

/**
 * 清理过期日志文件
 */
function cleanupOldLogs(logDir: string): void {
  const cutoffTime = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  
  try {
    const files = readdirSync(logDir);
    
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      
      const filePath = join(logDir, file);
      try {
        const stats = statSync(filePath);
        if (stats.mtime.getTime() < cutoffTime) {
          unlinkSync(filePath);
        }
      } catch {
        // 忽略错误
      }
    }
  } catch {
    // 忽略错误
  }
}

// ============================================================================
// 格式化器
// ============================================================================

/** JSON Lines 格式化器 */
function jsonFormatter(record: LogRecord): string {
  const entry = {
    timestamp: new Date(record.timestamp).toISOString(),
    level: record.level,
    category: record.category,
    message: record.message,
    properties: sanitizeProperties(record.properties),
  };
  return JSON.stringify(entry) + "\n";
}

/**
 * 人类可读的控制台格式化器
 * 
 * 输出格式：
 * [时间] 级别 [分类] 消息 | 属性1=值1 属性2=值2 ...
 */
function humanReadableFormatter(record: LogRecord): string {
  const timestamp = new Date(record.timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  const level = record.level.toUpperCase().padEnd(7);
  const category = record.category.slice(1).join("."); // 去掉 "microagent" 前缀
  const message = typeof record.message === "string" 
    ? record.message 
    : JSON.stringify(record.message);
  
  // 格式化属性（脱敏）
  let propsStr = "";
  if (record.properties && Object.keys(record.properties).length > 0) {
    const sanitizedProps = sanitizeProperties(record.properties);
    propsStr = " | " + formatProperties(sanitizedProps);
  }
  
  // 应用颜色
  if (colorEnabled) {
    const bgLevel = LEVEL_BG_COLORS[record.level] ?? "";
    const coloredLevel = `${bgLevel}${COLORS.bold}${COLORS.white} ${level.trim()} ${COLORS.reset}`;
    const coloredTimestamp = `${COLORS.dim}${timestamp}${COLORS.reset}`;
    const coloredCategory = `${COLORS.cyan}${category}${COLORS.reset}`;
    
    return `${coloredTimestamp} ${coloredLevel} [${coloredCategory}] ${message}${propsStr}`;
  }
  
  return `[${timestamp}] ${level} [${category}] ${message}${propsStr}`;
}

/**
 * 格式化属性对象为易读字符串
 */
function formatProperties(props: Record<string, unknown>, _indent = 0): string {
  const entries: string[] = [];
  
  for (const [key, value] of Object.entries(props)) {
    const formattedValue = formatValue(value, _indent);
    entries.push(`${key}=${formattedValue}`);
  }
  
  return entries.join(" ");
}

/**
 * 格式化单个值
 */
function formatValue(value: unknown, indent = 0): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  
  if (typeof value === "string") {
    // 长字符串截断
    if (value.length > 100) {
      return `"${value.substring(0, 100)}..."`;
    }
    return `"${value}"`;
  }
  
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.length <= 3 && value.every(v => typeof v !== "object")) {
      return `[${value.map(v => formatValue(v, indent)).join(", ")}]`;
    }
    return `[${value.length} items]`;
  }
  
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return "{}";
    if (keys.length <= 3) {
      const inner = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k}:${formatValue(v, indent + 1)}`)
        .join(", ");
      return `{${inner}}`;
    }
    return `{${keys.length} keys}`;
  }
  
  return String(value);
}

// ============================================================================
// 自定义文件 Sink（支持滚动）
// ============================================================================

/**
 * 创建支持滚动的文件 Sink
 */
function createRollingFileSink(logDir: string, gran: ParsedGranularity, maxSizeBytes: number): Sink {
  // 确保目录存在
  try {
    mkdirSync(logDir, { recursive: true });
  } catch {
    // 忽略
  }
  
  // 清理旧日志
  cleanupOldLogs(logDir);
  
  return (record: LogRecord) => {
    const filePath = getLogFilePath(logDir, gran, maxSizeBytes);
    const formatted = jsonFormatter(record);
    
    try {
      appendFileSync(filePath, formatted, "utf-8");
    } catch {
      // 忽略写入错误
    }
  };
}

// ============================================================================
// 日志配置函数
// ============================================================================

/**
 * 初始化日志系统
 * 
 * @param config - 日志配置
 */
export async function initLogger(config: LoggerConfig = {}): Promise<void> {
  if (initialized) {
    return;
  }

  // 解析配置
  consoleLevel = config.level ?? DEFAULT_LOG_LEVEL;
  colorEnabled = config.color !== false;
  sanitizeEnabled = config.sanitize ?? DEFAULT_LOG_SANITIZE;
  
  // 解析文件大小（clamp 到有效范围）
  const maxSizeMB = config.maxFileSize ?? DEFAULT_LOG_MAX_FILE_SIZE_MB;
  maxFileSizeBytes = Math.max(MIN_LOG_FILE_SIZE_MB, Math.min(MAX_LOG_FILE_SIZE_MB, maxSizeMB)) * 1024 * 1024;
  
  // 解析颗粒度
  granularity = parseGranularity(config.granularity ?? DEFAULT_LOG_GRANULARITY);
  
  const logDir = config.logDir ?? LOGS_DIR;

  // 构建 sinks 配置
  const sinks: Record<string, Sink> = {};

  // JSON 文件 sink（主 sink）- 使用自定义滚动 sink
  if (config.file !== false) {
    sinks.jsonl = createRollingFileSink(logDir, granularity, maxFileSizeBytes);
  }

  // 控制台 sink（可选）- 使用配置的日志级别过滤
  if (config.console === true) {
    sinks.console = (record: LogRecord) => {
      // 根据控制台日志级别过滤
      const levelPriority: Record<string, number> = {
        debug: 0,
        info: 1,
        warning: 2,
        error: 3,
      };
      
      const recordPriority = levelPriority[record.level] ?? 1;
      const configPriority = levelPriority[consoleLevel] ?? 1;
      
      if (recordPriority < configPriority) {
        return; // 低于配置级别的日志不输出到控制台
      }
      
      const output = humanReadableFormatter(record);
      const con = originalConsole ?? console;
      
      if (record.level === "error") {
        con.error(output);
      } else if (record.level === "warning") {
        con.warn(output);
      } else {
        con.log(output);
      }
    };
  }

  // 配置 logtape
  // 注意：文件日志始终使用 debug 级别（记录所有日志）
  // 控制台日志由 sink 内部根据 consoleLevel 过滤
  await configure({
    sinks,
    loggers: [
      {
        category: ["microagent"],
        sinks: config.console === true ? ["jsonl", "console"] : ["jsonl"],
        lowestLevel: "debug", // 文件始终记录所有级别，控制台由 sink 过滤
      },
    ],
  });

  initialized = true;
}

/**
 * 获取指定分类的 Logger
 * 
 * @param category - 日志分类，如 ["runtime", "kernel", "agent-loop"]
 * @returns Logger 实例
 */
export function getModuleLogger(category: string[]): Logger {
  return getLogger(["microagent", ...category]);
}

// ============================================================================
// 便捷函数 - 按模块获取 Logger
// ============================================================================

/** Runtime Kernel */
export const kernelLogger = () => getModuleLogger(["runtime", "kernel"]);

/** Runtime Provider */
export const providerLogger = () => getModuleLogger(["runtime", "provider"]);

/** Runtime Tool */
export const toolLogger = () => getModuleLogger(["runtime", "tool"]);

/** Runtime Session */
export const sessionLogger = () => getModuleLogger(["runtime", "session"]);

/** Runtime Bus */
export const busLogger = () => getModuleLogger(["runtime", "bus"]);

/** Runtime Channel */
export const channelLogger = () => getModuleLogger(["runtime", "channel"]);

/** Runtime Memory */
export const memoryLogger = () => getModuleLogger(["runtime", "memory"]);

/** Runtime Skill */
export const skillLogger = () => getModuleLogger(["runtime", "skill"]);

/** Applications Builder */
export const builderLogger = () => getModuleLogger(["applications", "builder"]);

/** Applications Config */
export const configLogger = () => getModuleLogger(["applications", "config"]);

/** Applications CLI */
export const cliLogger = () => getModuleLogger(["applications", "cli"]);

/** Applications Providers */
export const providersLogger = () => getModuleLogger(["applications", "providers"]);

/** Applications Channels */
export const channelsLogger = () => getModuleLogger(["applications", "channels"]);

/** Applications Tools */
export const toolsLogger = () => getModuleLogger(["applications", "tools"]);

/** Applications MCP */
export const mcpLogger = () => getModuleLogger(["applications", "mcp"]);

/** Applications Skills */
export const skillsLogger = () => getModuleLogger(["applications", "skills"]);

/** Applications Prompts */
export const promptsLogger = () => getModuleLogger(["applications", "prompts"]);

/** Applications Shared */
export const sharedLogger = () => getModuleLogger(["applications", "shared"]);

// ============================================================================
// 辅助函数 - 方法调用日志
// ============================================================================

/**
 * 记录方法调用开始
 */
export function logMethodCall(
  logger: Logger,
  data: MethodCallLogData
): void {
  logger.debug("方法调用开始", {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * 记录方法调用返回
 */
export function logMethodReturn(
  logger: Logger,
  data: MethodReturnLogData
): void {
  logger.debug("方法调用返回", {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * 记录方法调用错误
 */
export function logMethodError(
  logger: Logger,
  data: MethodErrorLogData
): void {
  logger.error("方法调用错误", {
    ...data,
    timestamp: Date.now(),
  });
}

/**
 * 创建计时器
 */
export function createTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

/**
 * 脱敏对象（移除敏感信息）
 * 
 * @deprecated 使用配置 sanitize 选项代替
 */
export function sanitize(obj: unknown, maxDepth = 3): unknown {
  if (!sanitizeEnabled) {
    return obj;
  }
  
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== "object") {
    if (typeof obj === "string" && obj.length > 500) {
      return obj.substring(0, 500) + "...[truncated]";
    }
    return obj;
  }

  if (maxDepth <= 0) {
    return "[max depth reached]";
  }

  if (Array.isArray(obj)) {
    if (obj.length > 10) {
      return [...obj.slice(0, 10).map(v => sanitize(v, maxDepth - 1)), `...${obj.length - 10} more items`];
    }
    return obj.map(v => sanitize(v, maxDepth - 1));
  }

  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some(sk => key.toLowerCase().includes(sk))) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = sanitize(value, maxDepth - 1);
    }
  }
  
  return result;
}

// 导出初始化状态检查
export const isLoggerInitialized = () => initialized;

// 导出获取默认日志级别
export const getDefaultLevel = () => consoleLevel;

// 导出获取当前配置
export const getLoggerConfig = () => ({
  level: consoleLevel,
  sanitize: sanitizeEnabled,
  maxFileSizeMB: maxFileSizeBytes / (1024 * 1024),
  granularity: granularity.raw,
});

// ============================================================================
// 导出日志装饰器和工具函数（用于简化方法日志记录）
// ============================================================================

export * from "./log-decorator.js";
