/**
 * 日志配置模块
 * 
 * 提供统一的结构化日志配置，支持控制台和文件输出。
 * 日志格式为 JSON Lines，便于 CLI 端解析和美化。
 */

// ============================================================
// 常量定义
// ============================================================

/** 日志限制常量 */
const LOG_LIMITS = {
  /** 工具输入摘要最大长度 */
  TOOL_INPUT_MAX_LENGTH: 60,
  /** 工具输入值最大显示长度 */
  TOOL_INPUT_VALUE_MAX_LENGTH: 30,
  /** 工具输入最大条目数 */
  TOOL_INPUT_MAX_ENTRIES: 3,
  /** 工具输出摘要最大长度 */
  TOOL_OUTPUT_MAX_LENGTH: 80,
  /** 内容预览长度 */
  CONTENT_PREVIEW_LENGTH: 100,
  /** 毫秒转秒阈值 */
  MS_TO_S_THRESHOLD: 1000,
} as const;

/** 文件管理常量 */
const FILE_CONSTANTS = {
  /** 最大文件大小：10MB */
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  /** 最大保留日志文件数 */
  MAX_FILES: 30,
  /** 批次号填充位数 */
  BATCH_NUMBER_PADDING: 3,
} as const;

import { 
  configure, 
  getConsoleSink, 
  reset, 
  type LogRecord, 
  type Sink,
  withContext,
} from '@logtape/logtape';
import { 
  mkdirSync, 
  existsSync, 
  statSync, 
  readdirSync, 
  createWriteStream, 
  unlinkSync 
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { LoggingConfig, LogEntry, TraceContext } from './types';

/** 默认日志配置 */
const DEFAULT_CONFIG: LoggingConfig = {
  console: true,
  file: false, // Agent Service 不写文件，由 CLI 负责
  logDir: '~/.micro-agent/logs',
  logFilePrefix: 'agent',
  level: 'debug', // 输出所有级别，由 CLI 负责过滤
  traceEnabled: true,
  logInput: true,
  logOutput: true,
  logDuration: true,
  sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'],
  maxFileSize: FILE_CONSTANTS.MAX_FILE_SIZE,
  maxFiles: FILE_CONSTANTS.MAX_FILES,
};

/** 是否已初始化 */
let initialized = false;

/** 当前日志文件信息 */
interface LogFileInfo {
  path: string;
  date: string;
  batch: number;
}

/** 日志文件写入器状态 */
interface LogWriterState {
  file: LogFileInfo;
  writer: ReturnType<typeof createWriteStream>;
}

/** 日志事件监听器 */
type LogEventListener = (entry: LogEntry) => void;
const logEventListeners: Set<LogEventListener> = new Set();

/**
 * 订阅日志事件
 */
export function subscribeToLogs(listener: LogEventListener): () => void {
  logEventListeners.add(listener);
  return () => logEventListeners.delete(listener);
}

/**
 * 发布日志事件
 */
function emitLogEvent(entry: LogEntry): void {
  for (const listener of logEventListeners) {
    try {
      listener(entry);
    } catch {
      // 忽略监听器错误
    }
  }
}

/**
 * 展开路径（支持 ~ 符号）
 */
function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * 获取当前日期时间字符串 (YYYY-MM-DD-HH)
 */
function getCurrentDateHour(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  return `${year}-${month}-${day}-${hour}`;
}

/**
 * 脱敏处理
 */
function sanitize(data: unknown, sensitiveFields: string[], depth = 0): unknown {
  if (depth > 5) return '[深度超限]';
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
  }
  if (Buffer.isBuffer(data)) return '[Buffer]';
  if (Array.isArray(data)) {
    return data.slice(0, 100).map(item => sanitize(item, sensitiveFields, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some(f => lowerKey.includes(f.toLowerCase()))) {
      result[key] = '***REDACTED***';
    } else {
      result[key] = sanitize(value, sensitiveFields, depth + 1);
    }
  }
  return result;
}

/**
 * 查找或创建当前小时最新的日志文件
 */
function findOrCreateLogFile(logDir: string, maxFileSize: number, targetDateHour?: string): LogFileInfo {
  const currentHour = targetDateHour || getCurrentDateHour();
  
  let files: string[] = [];
  try {
    files = readdirSync(logDir)
      .filter(f => f.startsWith(currentHour) && f.endsWith('.log'))
      .sort((a, b) => {
        const batchA = parseInt(a.match(/-(\d+)\.log$/)?.[1] ?? '0', 10);
        const batchB = parseInt(b.match(/-(\d+)\.log$/)?.[1] ?? '0', 10);
        return batchB - batchA;
      });
  } catch {
    // 目录不存在或读取失败
  }

  if (files.length > 0) {
    const latestFile = files[0];
    const filePath = join(logDir, latestFile);
    try {
      const stats = statSync(filePath);
      if (stats.size < maxFileSize) {
        const batch = parseInt(latestFile.match(/-(\d+)\.log$/)?.[1] ?? '1', 10);
        return { path: filePath, date: currentHour, batch };
      }
    } catch {
      // 文件访问失败
    }
  }

  const newBatch = files.length > 0 
    ? parseInt(files[0].match(/-(\d+)\.log$/)?.[1] ?? '0', 10) + 1 
    : 1;
  const batchStr = newBatch.toString().padStart(FILE_CONSTANTS.BATCH_NUMBER_PADDING, '0');
  const newFileName = `${currentHour}-${batchStr}.log`;
  const newPath = join(logDir, newFileName);

  return { path: newPath, date: currentHour, batch: newBatch };
}

/**
 * 清理过期日志文件
 */
function cleanupOldLogs(logDir: string, maxFiles: number): void {
  try {
    const files = readdirSync(logDir)
      .filter(f => f.endsWith('.log'))
      .sort();

    if (files.length > maxFiles) {
      const toDelete = files.slice(0, files.length - maxFiles);
      for (const f of toDelete) {
        try {
          unlinkSync(join(logDir, f));
        } catch {
          // 忽略删除失败
        }
      }
    }
  } catch {
    // 忽略清理失败
  }
}

/**
 * JSON Lines 格式化器（结构化日志）
 */
function jsonLinesFormatter(record: LogRecord, config: LoggingConfig): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: record.level,
    category: record.category.join('.'),
    message: record.message,
  };

  const properties = (record as unknown as { properties?: Record<string, unknown> }).properties;
  if (properties && Object.keys(properties).length > 0) {
    // 脱敏处理
    entry.properties = sanitize(properties, config.sensitiveFields);
    
    // 如果有 _type 字段，提升到顶层
    if (properties._type) {
      entry._type = properties._type;
    }
  }

  // 发布日志事件供 CLI 订阅
  emitLogEvent(entry as LogEntry);

  return JSON.stringify(entry) + '\n';
}

/**
 * 纯 JSON 格式化器（用于控制台，便于 CLI 解析）
 */
function jsonFormatter(record: LogRecord, config: LoggingConfig): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: record.level,
    category: record.category.join('.'),
    message: record.message,
  };

  const properties = (record as unknown as { properties?: Record<string, unknown> }).properties;
  if (properties && Object.keys(properties).length > 0) {
    entry.properties = sanitize(properties, config.sensitiveFields);
    if (properties._type) {
      entry._type = properties._type;
    }
  }

  return JSON.stringify(entry);
}

/**
 * 检查是否需要切换日志文件
 */
function shouldRotateFile(currentFile: LogFileInfo, currentHour: string, maxFileSize: number): boolean {
  if (currentHour !== currentFile.date) return true;
  try {
    const stats = statSync(currentFile.path);
    return stats.size >= maxFileSize;
  } catch {
    return true;
  }
}

/**
 * 切换日志文件
 */
function rotateLogFile(
  logDir: string,
  maxFileSize: number,
  maxFiles: number,
  targetDate?: string
): LogWriterState {
  const file = findOrCreateLogFile(logDir, maxFileSize, targetDate);
  const writer = createWriteStream(file.path, { flags: 'a' });
  cleanupOldLogs(logDir, maxFiles);
  return { file, writer };
}

/**
 * 创建小时批次文件 Sink
 */
function createDateBatchFileSink(
  logDir: string,
  maxFileSize: number,
  maxFiles: number,
  config: LoggingConfig
): Sink {
  let current = rotateLogFile(logDir, maxFileSize, maxFiles);

  return (record: LogRecord) => {
    const currentHour = getCurrentDateHour();

    if (shouldRotateFile(current.file, currentHour, maxFileSize)) {
      current.writer.end();
      current = rotateLogFile(logDir, maxFileSize, maxFiles, currentHour);
    }

    current.writer.write(jsonLinesFormatter(record, config));
  };
}

/**
 * 初始化日志系统
 */
export async function initLogging(config: Partial<LoggingConfig> = {}): Promise<void> {
  const fullConfig: LoggingConfig = { ...DEFAULT_CONFIG, ...config };

  if (initialized) {
    reset();
  }

  const logDir = expandPath(fullConfig.logDir);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const sinks: Record<string, Sink> = {};

  // 控制台输出 - 纯 JSON 格式，便于 CLI 解析
  if (fullConfig.console) {
    sinks.console = (record: LogRecord) => {
      // 直接输出 JSON，CLI 端负责美化
      console.log(jsonFormatter(record, fullConfig));
    };
  }

  // 文件输出 - 小时批次格式
  if (fullConfig.file) {
    sinks.file = createDateBatchFileSink(
      logDir,
      fullConfig.maxFileSize,
      fullConfig.maxFiles,
      fullConfig
    );
  }

  // 日志级别映射
  const levelMap: Record<string, 'trace' | 'debug' | 'info' | 'warning' | 'error' | 'fatal'> = {
    trace: 'trace',
    debug: 'debug',
    info: 'info',
    warn: 'warning',
    warning: 'warning',
    error: 'error',
    fatal: 'fatal',
  };

  const mappedLevel = levelMap[fullConfig.level] ?? 'info';

  const loggers = [
    { category: [], sinks: Object.keys(sinks), lowestLevel: mappedLevel },
    { category: ['logtape', 'meta'], sinks: Object.keys(sinks), lowestLevel: 'warning' as const },
  ];

  await configure({ 
    sinks, 
    loggers, 
    reset: true,
    contextLocalStorage: new AsyncLocalStorage(),
  });
  
  initialized = true;
}

/**
 * 关闭日志系统
 */
export async function closeLogging(): Promise<void> {
  if (initialized) {
    reset();
    initialized = false;
  }
}

/**
 * 检查日志系统是否已初始化
 */
export function isLoggingInitialized(): boolean {
  return initialized;
}

/**
 * 获取当前日志文件路径
 */
export function getLogFilePath(config: Partial<LoggingConfig> = {}): string {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const logDir = expandPath(fullConfig.logDir);
  const currentHour = getCurrentDateHour();
  return join(logDir, `${currentHour}-001.log`);
}

/**
 * 创建追踪上下文
 */
export function createTraceContext(
  traceId: string,
  spanId: string,
  parentSpanId?: string
): TraceContext {
  return {
    traceId,
    spanId,
    parentSpanId,
  };
}

/**
 * 在上下文中执行
 */
export function withTraceContext<T>(
  context: TraceContext,
  fn: () => Promise<T>
): Promise<T> {
  return withContext(context, fn);
}

/**
 * 创建模块专用日志器
 */
export function createModuleLogger(moduleName: string) {
  return {
    getLogger: () => {
      return import('@logtape/logtape').then(({ getLogger }) => getLogger([moduleName]));
    },
  };
}