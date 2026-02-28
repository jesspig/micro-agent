/**
 * 日志配置模块
 * 
 * 提供统一的日志配置，支持控制台和文件输出，JSON Lines 格式。
 * 日志文件格式：YYYY-MM-DD-HH-<batch>.log（按小时分割）
 */

// ============================================================
// 常量定义
// ============================================================

/**
 * 日志限制常量
 */
const LOG_LIMITS = {
  /** 工具输入摘要最大长度 */
  TOOL_INPUT_MAX_LENGTH: 60,
  /** 工具输入值最大显示长度 */
  TOOL_INPUT_VALUE_MAX_LENGTH: 30,
  /** 工具输入最大条目数 */
  TOOL_INPUT_MAX_ENTRIES: 3,
  /** 工具输出摘要最大长度 */
  TOOL_OUTPUT_MAX_LENGTH: 80,
  /** 工具输出预览长度（detailedConsoleFormatter中使用） */
  TOOL_OUTPUT_PREVIEW_LENGTH: 200,
  /** 内容预览长度 */
  CONTENT_PREVIEW_LENGTH: 100,
  /** 毫秒转秒阈值 */
  MS_TO_S_THRESHOLD: 1000,
} as const;

/**
 * 文件管理常量
 */
const FILE_CONSTANTS = {
  /** 最大文件大小：10MB */
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  /** 最大保留日志文件数 */
  MAX_FILES: 30,
  /** 批次号填充位数 */
  BATCH_NUMBER_PADDING: 3,
} as const;

/**
 * ANSI 颜色代码
 */
const COLOR_CODE = {
  /** 暗淡灰色 */
  DIM_GRAY: '\x1b[90m',
  /** 青色 */
  CYAN: '\x1b[36m',
  /** 绿色 */
  GREEN: '\x1b[32m',
  /** 黄色 */
  YELLOW: '\x1b[33m',
  /** 红色 */
  RED: '\x1b[31m',
  /** 洋红色 */
  MAGENTA: '\x1b[35m',
  /** 暗淡模式 */
  DIM: '\x1b[2m',
  /** 重置颜色 */
  RESET: '\x1b[0m',
  /** 白色 */
  WHITE: '\x1b[37m',
} as const;

/**
 * 日志级别颜色映射
 */
const LEVEL_COLORS: Record<string, string> = {
  trace: COLOR_CODE.DIM_GRAY,
  debug: COLOR_CODE.CYAN,
  info: COLOR_CODE.GREEN,
  warn: COLOR_CODE.YELLOW,
  warning: COLOR_CODE.YELLOW,
  error: COLOR_CODE.RED,
  fatal: COLOR_CODE.MAGENTA,
} as const;

import { configure, getConsoleSink, reset, type LogRecord, type Sink } from '@logtape/logtape';
import { mkdirSync, existsSync, statSync, readdirSync, createWriteStream, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { LoggingConfig } from './types';

/**
 * 工具调用日志数据接口
 * 
 * 用于记录工具调用的详细信息，包括工具名称、输入参数、输出结果、执行耗时等。
 */
export interface ToolCallLogData {
  /** 日志类型标识，固定为 'tool_call' */
  _type: 'tool_call';
  /** 调用的工具名称 */
  tool: string;
  /** 工具输入参数（可选） */
  input?: unknown;
  /** 工具输出结果（可选） */
  output?: string;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 是否执行成功（可选，默认为 true） */
  success?: boolean;
  /** 错误信息（可选，执行失败时包含） */
  error?: string;
}

/**
 * LLM 调用日志数据接口
 * 
 * 用于记录 LLM 调用的详细信息，包括模型名称、提供商、消息数量、Token 消耗等。
 */
export interface LLMCallLogData {
  /** 日志类型标识，固定为 'llm_call' */
  _type: 'llm_call';
  /** 模型名称 */
  model: string;
  /** 提供商名称 */
  provider: string;
  /** 消息数量 */
  messageCount: number;
  /** 工具调用数量 */
  toolCount: number;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 是否执行成功 */
  success: boolean;
  /** 提示词 Token 数量（可选） */
  promptTokens?: number;
  /** 完成 Token 数量（可选） */
  completionTokens?: number;
  /** 错误信息（可选，执行失败时包含） */
  error?: string;
  /** 响应内容（可选） */
  content?: string;
  /** 是否包含工具调用（可选） */
  hasToolCalls?: boolean;
}

/**
 * 类型守卫：检查数据是否为 ToolCallLogData 类型
 * 
 * 验证必需字段：_type、tool、duration
 * 
 * @param data - 待验证的数据
 * @returns 如果数据符合 ToolCallLogData 接口则返回 true
 * 
 * @example
 * ```typescript
 * const data = { _type: 'tool_call', tool: 'fs_read', duration: 100 };
 * if (isToolCallLog(data)) {
 *   console.log(data.tool); // 类型安全访问
 * }
 * ```
 */
export function isToolCallLog(data: unknown): data is ToolCallLogData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const record = data as Record<string, unknown>;

  return (
    record._type === 'tool_call' &&
    typeof record.tool === 'string' &&
    typeof record.duration === 'number'
  );
}

/**
 * 类型守卫：检查数据是否为 LLMCallLogData 类型
 * 
 * 验证必需字段：_type、model、provider、messageCount、toolCount、duration、success
 * 
 * @param data - 待验证的数据
 * @returns 如果数据符合 LLMCallLogData 接口则返回 true
 * 
 * @example
 * ```typescript
 * const data = { _type: 'llm_call', model: 'gpt-4', provider: 'openai', ... };
 * if (isLLMCallLog(data)) {
 *   console.log(data.model); // 类型安全访问
 * }
 * ```
 */
export function isLLMCallLog(data: unknown): data is LLMCallLogData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const record = data as Record<string, unknown>;

  return (
    record._type === 'llm_call' &&
    typeof record.model === 'string' &&
    typeof record.provider === 'string' &&
    typeof record.messageCount === 'number' &&
    typeof record.toolCount === 'number' &&
    typeof record.duration === 'number' &&
    typeof record.success === 'boolean'
  );
}

// 注意：常量定义已移到文件顶部，使用 COLOR_CODE、LOG_LIMITS 和 LEVEL_COLORS

/** 默认日志配置 */
const DEFAULT_CONFIG: LoggingConfig = {
  console: true,
  file: true,
  logDir: '~/.micro-agent/logs',
  logFilePrefix: 'app',
  level: 'info',
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
 * 
 * 使用本地时间而非 UTC 时间，按小时分割日志文件
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
 * 查找或创建当前小时最新的日志文件
 * 
 * @param logDir 日志目录
 * @param maxFileSize 最大文件大小
 * @param targetDateHour 目标日期小时（可选，用于强制指定）
 */
function findOrCreateLogFile(logDir: string, maxFileSize: number, targetDateHour?: string): LogFileInfo {
  const currentHour = targetDateHour || getCurrentDateHour();
  
  // 查找当前小时已有的日志文件
  let files: string[] = [];
  try {
    files = readdirSync(logDir)
      .filter(f => f.startsWith(currentHour) && f.endsWith('.log'))
      .sort((a, b) => {
        // 按批次号降序排序
        const batchA = parseInt(a.match(/-(\d+)\.log$/)?.[1] ?? '0', 10);
        const batchB = parseInt(b.match(/-(\d+)\.log$/)?.[1] ?? '0', 10);
        return batchB - batchA;
      });
  } catch {
    // 目录不存在或读取失败
  }

  // 检查最新文件是否还有空间
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
      // 文件访问失败，创建新文件
    }
  }

  // 创建新文件
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
      .sort(); // 按文件名排序（日期批次格式自然排序）

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
 * 自定义 JSON Lines 格式化器
 */
function jsonLinesFormatter(record: LogRecord): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: record.level,
    category: record.category.join('.'),
    message: record.message,
  };

  if (record.properties && Object.keys(record.properties).length > 0) {
    entry.properties = record.properties;
  }

  return JSON.stringify(entry) + '\n';
}

/**
 * 格式化工具参数摘要
 */
function formatToolInput(input: unknown, maxLength = LOG_LIMITS.TOOL_INPUT_MAX_LENGTH): string {
  if (input === null || input === undefined) return '';
  
  if (typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length === 0) return '';
    
    const parts = entries.slice(0, LOG_LIMITS.TOOL_INPUT_MAX_ENTRIES).map(([key, value]) => {
      let valStr: string;
      if (typeof value === 'string') {
        valStr = value.length > LOG_LIMITS.TOOL_INPUT_VALUE_MAX_LENGTH 
          ? `"${value.slice(0, LOG_LIMITS.TOOL_INPUT_VALUE_MAX_LENGTH)}..."` 
          : `"${value}"`;
      } else if (typeof value === 'object' && value !== null) {
        valStr = '{...}';
      } else {
        valStr = String(value);
      }
      return `${key}=${valStr}`;
    });
    
    let result = parts.join(', ');
    if (entries.length > LOG_LIMITS.TOOL_INPUT_MAX_ENTRIES) {
      result += `, +${entries.length - LOG_LIMITS.TOOL_INPUT_MAX_ENTRIES}更多`;
    }
    return result.length > maxLength ? result.slice(0, maxLength) + '...' : result;
  }
  
  return '';
}

/**
 * 格式化工具输出摘要
 */
function formatToolOutput(output: string | undefined, maxLength: number = LOG_LIMITS.TOOL_OUTPUT_MAX_LENGTH): string {
  if (!output) return '';
  
  // 尝试解析 JSON 输出
  try {
    const parsed = JSON.parse(output);
    if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.error) {
        return `${COLOR_CODE.RED}错误: ${parsed.message || '未知错误'}${COLOR_CODE.RESET}`;
      }
      const keys = Object.keys(parsed);
      if (keys.length > 0) {
        return `{${keys.slice(0, LOG_LIMITS.TOOL_INPUT_MAX_ENTRIES).join(', ')}${keys.length > LOG_LIMITS.TOOL_INPUT_MAX_ENTRIES ? ', ...' : ''}}`;
      }
    }
  } catch {
    // 非 JSON，直接截取
  }
  
  const cleanOutput = output.replace(/\n/g, ' ').trim();
  return cleanOutput.length > maxLength 
    ? cleanOutput.slice(0, maxLength) + '...' 
    : cleanOutput;
}

/**
 * 格式化耗时显示
 */
function formatDuration(duration: number): string {
  return duration > LOG_LIMITS.MS_TO_S_THRESHOLD 
    ? `${(duration / 1000).toFixed(1)}s` 
    : `${duration}ms`;
}

/**
 * 格式化工具调用日志
 */
function formatToolCallLog(logData: Record<string, unknown>): string {
  const toolName = String(logData.tool || 'unknown');
  const input = logData.input;
  const output = logData.output as string | undefined;
  const duration = Number(logData.duration) || 0;
  const success = logData.success !== false;
  const error = logData.error as string | undefined;
  
  const inputStr = formatToolInput(input);
  const statusIcon = success ? '✓' : '✗';
  const statusColor = success ? COLOR_CODE.GREEN : COLOR_CODE.RED;
  const durationStr = formatDuration(duration);
  
  let outputStr = '';
  if (error) {
    outputStr = `${COLOR_CODE.RED}错误: ${error}${COLOR_CODE.RESET}`;
  } else if (output) {
    outputStr = formatToolOutput(output, LOG_LIMITS.TOOL_OUTPUT_PREVIEW_LENGTH);
  }
  
  return `${COLOR_CODE.CYAN}🔧 ${toolName}${COLOR_CODE.RESET}` +
    `${inputStr ? `(${inputStr})` : '()'}` +
    ` ${statusColor}${statusIcon}${COLOR_CODE.RESET}` +
    `${outputStr ? ` → ${outputStr}` : ''}` +
    ` ${COLOR_CODE.DIM_GRAY}${durationStr}${COLOR_CODE.RESET}`;
}

/**
 * 格式化 LLM 调用日志
 */
function formatLLMCallLog(logData: Record<string, unknown>): string {
  const model = String(logData.model || 'unknown');
  const provider = String(logData.provider || 'unknown');
  const duration = Number(logData.duration) || 0;
  const promptTokens = logData.promptTokens as number | undefined;
  const completionTokens = logData.completionTokens as number | undefined;
  const success = logData.success !== false;
  const content = logData.content as string | undefined;
  const hasToolCalls = logData.hasToolCalls as boolean | undefined;
  
  const statusIcon = success ? '✓' : '✗';
  const statusColor = success ? COLOR_CODE.GREEN : COLOR_CODE.RED;
  const durationStr = formatDuration(duration);
  
  let tokensStr = '';
  if (promptTokens !== undefined && completionTokens !== undefined) {
    tokensStr = ` ${COLOR_CODE.DIM_GRAY}${promptTokens}→${completionTokens} tokens${COLOR_CODE.RESET}`;
  }
  
  const contentStr = formatLLMContentPreview(content, hasToolCalls);
  
  return `${COLOR_CODE.MAGENTA}🤖 ${provider}/${model}${COLOR_CODE.RESET}` +
    ` ${statusColor}${statusIcon}${COLOR_CODE.RESET}` +
    ` ${COLOR_CODE.DIM_GRAY}${durationStr}${COLOR_CODE.RESET}` +
    tokensStr +
    contentStr;
}

/**
 * 格式化 LLM 内容预览
 */
function formatLLMContentPreview(content: string | undefined, hasToolCalls: boolean | undefined): string {
  if (content) {
    const cleanContent = content.replace(/\n/g, ' ').trim();
        const preview = cleanContent.length > LOG_LIMITS.CONTENT_PREVIEW_LENGTH
          ? cleanContent.slice(0, LOG_LIMITS.CONTENT_PREVIEW_LENGTH) + '...'      : cleanContent;
    return ` ${COLOR_CODE.WHITE}"${preview}"${COLOR_CODE.RESET}`;
  }
  if (hasToolCalls) {
    return ` ${COLOR_CODE.YELLOW}[调用工具]${COLOR_CODE.RESET}`;
  }
  return '';
}

/**
 * 格式化普通日志
 */
function formatDefaultLog(record: LogRecord, properties?: Record<string, unknown>): string {
  let message = record.message.length > 0 ? String(record.message[0]) : '';
  
  if (properties && Object.keys(properties).length > 0 && !('_type' in properties)) {
    try {
      message += ` ${JSON.stringify(properties, null, 0)}`;
    } catch {
      message += ' [Object]';
    }
  }
  
  return message;
}

/**
 * 详细控制台格式化器
 */
function detailedConsoleFormatter(record: LogRecord): readonly unknown[] {
  const level = record.level.toUpperCase().padEnd(5);
  const levelColor = LEVEL_COLORS[record.level] ?? '';
  const category = record.category.join(`${COLOR_CODE.DIM}·${COLOR_CODE.RESET}`);
  const timestamp = new Date().toISOString().slice(11, 23);
  const properties = (record as unknown as { properties?: Record<string, unknown> }).properties;
  
  if (properties && typeof properties === 'object' && '_type' in properties) {
    const logData = properties as Record<string, unknown>;
    
    if (logData._type === 'tool_call') {
      return [`${timestamp} ${levelColor}${level}${COLOR_CODE.RESET} ${formatToolCallLog(logData)}`];
    }
    
    if (logData._type === 'llm_call') {
      return [`${timestamp} ${levelColor}${level}${COLOR_CODE.RESET} ${formatLLMCallLog(logData)}`];
    }
  }
  
  const message = formatDefaultLog(record, properties);
  return [`${timestamp} ${levelColor}${level}${COLOR_CODE.RESET} ${COLOR_CODE.DIM_GRAY}${category}${COLOR_CODE.RESET} ${message}`];
}

/**
 * 检查是否需要切换日志文件
 * 
 * 切换条件：
 * 1. 小时发生变化
 * 2. 当前文件大小超过 maxFileSize
 * 3. 文件访问失败（返回 true 以触发重新创建）
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
 * 
 * 关闭当前文件，创建新文件，并清理旧日志
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
 * 
 * 日志文件格式：YYYY-MM-DD-HH-<batch>.log
 * - 每小时自动创建新的日志文件
 * - 同一小时内，文件超过 maxFileSize 时自动创建新批次
 */
function createDateBatchFileSink(
  logDir: string,
  maxFileSize: number,
  maxFiles: number,
  formatter: (record: LogRecord) => string
): Sink {
  let current = rotateLogFile(logDir, maxFileSize, maxFiles);
  let lastCheckHour = current.file.date;

  return (record: LogRecord) => {
    const currentHour = getCurrentDateHour();

    if (shouldRotateFile(current.file, currentHour, maxFileSize)) {
      current.writer.end();
      current = rotateLogFile(logDir, maxFileSize, maxFiles, currentHour);
      lastCheckHour = currentHour;
    }

    current.writer.write(formatter(record));
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

  // 控制台输出
  if (fullConfig.console) {
    sinks.console = getConsoleSink({
      formatter: detailedConsoleFormatter,
    });
  }

  // 文件输出 - 小时批次格式
  if (fullConfig.file) {
    sinks.file = createDateBatchFileSink(
      logDir,
      fullConfig.maxFileSize,
      fullConfig.maxFiles,
      jsonLinesFormatter
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
    { category: ['tracer'], sinks: Object.keys(sinks), lowestLevel: fullConfig.traceEnabled ? 'debug' as const : 'info' as const },
  ];

  // 添加 contextLocalStorage 以支持隐式上下文（traceId, spanId）
  // 参考：https://logtape.org/docs/manual/contexts
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
 * 创建模块专用日志器
 */
export function createModuleLogger(moduleName: string) {
  return {
    getLogger: () => {
      return import('@logtape/logtape').then(({ getLogger }) => getLogger([moduleName]));
    },
  };
}
