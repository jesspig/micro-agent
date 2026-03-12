/**
 * 日志工具
 * 
 * 提供结构化日志功能，支持控制台输出和文件输出
 * 实现按日期和文件大小的滚动策略
 */

import { join } from "path";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 日志级别
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * 日志级别权重（用于级别过滤）
 */
const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * 日志记录结构
 */
interface LogRecord {
  /** 时间戳（ISO 8601 格式） */
  timestamp: string;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息 */
  message: string;
  /** 额外数据 */
  data?: Record<string, unknown>;
  /** 错误堆栈（如果有） */
  stack?: string;
}

/**
 * Logger 配置
 */
export interface LoggerConfig {
  /** 日志级别（默认 info） */
  level?: LogLevel;
  /** 是否输出到控制台（默认 true） */
  console?: boolean;
  /** 是否输出到文件（默认 true） */
  file?: boolean;
  /** 日志目录路径（默认 ~/.micro-agent/logs） */
  logDir?: string;
  /** 单个日志文件最大大小（字节，默认 10MB） */
  maxFileSize?: number;
  /** 日志保留天数（默认 7 天） */
  maxDays?: number;
}

// ============================================================================
// 常量定义
// ============================================================================

/** 默认日志目录名称 */
const DEFAULT_LOG_DIR_NAME = ".micro-agent";

/** 默认日志子目录名称 */
const LOG_SUBDIR = "logs";

/** 默认单文件最大大小：10MB */
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** 默认保留天数：7 天 */
const DEFAULT_MAX_DAYS = 7;

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 获取用户主目录
 */
function getHomeDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    throw new Error("无法确定用户主目录");
  }
  return home;
}

/**
 * 获取当前日期字符串（YYYY-MM-DD）
 */
function getDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 转义 JSON 字符串中的特殊字符
 */
function escapeJsonString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

// ============================================================================
// Logger 类
// ============================================================================

/**
 * 日志器类
 * 
 * 支持多输出目标、日志级别过滤和文件滚动
 */
export class Logger {
  /** 日志级别 */
  private readonly level: LogLevel;

  /** 是否输出到控制台 */
  private readonly enableConsole: boolean;

  /** 是否输出到文件 */
  private readonly enableFile: boolean;

  /** 日志目录路径 */
  private readonly logDir: string;

  /** 单文件最大大小 */
  private readonly maxFileSize: number;

  /** 保留天数 */
  private readonly maxDays: number;

  /** 当前日志文件路径 */
  private currentLogFile: string | null = null;

  /** 当前日志文件大小 */
  private currentFileSize: number = 0;

  /** 当前日志文件日期 */
  private currentDate: string = "";

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? "info";
    this.enableConsole = config.console ?? true;
    this.enableFile = config.file ?? true;
    this.maxFileSize = config.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this.maxDays = config.maxDays ?? DEFAULT_MAX_DAYS;

    // 设置日志目录
    if (config.logDir) {
      this.logDir = config.logDir;
    } else {
      this.logDir = join(getHomeDir(), DEFAULT_LOG_DIR_NAME, LOG_SUBDIR);
    }

    // 初始化日志文件
    if (this.enableFile) {
      this.initLogFile();
    }
  }

  // ------------------------------------------------------------------------
  // 公共方法
  // ------------------------------------------------------------------------

  /**
   * 记录 debug 级别日志
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  /**
   * 记录 info 级别日志
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  /**
   * 记录 warn 级别日志
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  /**
   * 记录 error 级别日志
   */
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData: Record<string, unknown> = { ...data };

    if (error instanceof Error) {
      errorData.errorName = error.name;
      errorData.errorMessage = error.message;
    }

    this.log("error", message, errorData, error instanceof Error ? error.stack : undefined);
  }

  /**
   * 关闭日志器，释放资源
   */
  async close(): Promise<void> {
    this.currentLogFile = null;
  }

  // ------------------------------------------------------------------------
  // 私有方法
  // ------------------------------------------------------------------------

  /**
   * 核心日志记录方法
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    stack?: string,
  ): void {
    // 级别过滤
    if (LOG_LEVEL_WEIGHT[level] < LOG_LEVEL_WEIGHT[this.level]) {
      return;
    }

    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    // 仅在有值时添加可选属性
    if (data && Object.keys(data).length > 0) {
      record.data = data;
    }
    if (stack) {
      record.stack = stack;
    }

    // 输出到控制台
    if (this.enableConsole) {
      this.writeToConsole(record);
    }

    // 输出到文件
    if (this.enableFile) {
      this.writeToFile(record);
    }
  }

  /**
   * 写入控制台
   */
  private writeToConsole(record: LogRecord): void {
    const prefix = `[${record.timestamp}] [${record.level.toUpperCase()}]`;
    const formattedMessage = `${prefix} ${record.message}`;

    switch (record.level) {
      case "debug":
        console.debug(formattedMessage, record.data ?? "");
        break;
      case "info":
        console.info(formattedMessage, record.data ?? "");
        break;
      case "warn":
        console.warn(formattedMessage, record.data ?? "");
        break;
      case "error":
        console.error(formattedMessage, record.data ?? "", record.stack ?? "");
        break;
    }
  }

  /**
   * 初始化日志文件
   */
  private initLogFile(): void {
    // 确保日志目录存在
    this.ensureLogDir();

    // 检查日期变化，必要时滚动文件
    this.checkDateRoll();

    // 清理过期日志
    this.cleanOldLogs();
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDir(): void {
    try {
      // Bun.write 会自动创建目录
      Bun.write(join(this.logDir, ".keep"), "");
    } catch {
      // 忽略错误，目录可能已存在
    }
  }

  /**
   * 检查日期变化，执行文件滚动
   */
  private checkDateRoll(): void {
    const today = getDateString();

    if (this.currentDate !== today) {
      this.currentDate = today;
      this.currentLogFile = this.getLogFilePath(today, 0);
      this.currentFileSize = 0;
    }
  }

  /**
   * 获取日志文件路径
   * 
   * @param date 日期字符串
   * @param iterator 迭代器（当文件超过大小限制时递增）
   */
  private getLogFilePath(date: string, iterator: number): string {
    if (iterator === 0) {
      return join(this.logDir, `${date}.log`);
    }
    return join(this.logDir, `${date}-${iterator}.log`);
  }

  /**
   * 写入文件
   */
  private writeToFile(record: LogRecord): void {
    try {
      // 检查日期滚动
      this.checkDateRoll();

      // 构建日志行
      const logLine = this.formatLogLine(record);

      // 检查文件大小，必要时滚动
      if (this.currentFileSize + logLine.length > this.maxFileSize) {
        this.rollFile();
      }

      // 获取文件句柄并写入
      const logFile = this.getCurrentLogFile();
      Bun.write(logFile, logLine);

      this.currentFileSize += logLine.length;
    } catch (err) {
      // 写入失败时输出到控制台
      console.error("日志写入失败:", err);
    }
  }

  /**
   * 格式化日志行为 JSON 字符串
   */
  private formatLogLine(record: LogRecord): string {
    const parts: string[] = [
      `{"timestamp":"${record.timestamp}"`,
      `"level":"${record.level}"`,
      `"message":"${escapeJsonString(record.message)}"`,
    ];

    if (record.data && Object.keys(record.data).length > 0) {
      parts.push(`"data":${JSON.stringify(record.data)}`);
    }

    if (record.stack) {
      parts.push(`"stack":"${escapeJsonString(record.stack)}"`);
    }

    return parts.join(",") + "}\n";
  }

  /**
   * 获取当前日志文件路径
   */
  private getCurrentLogFile(): string {
    if (!this.currentLogFile) {
      this.currentDate = getDateString();
      this.currentLogFile = this.getLogFilePath(this.currentDate, 0);
      this.currentFileSize = 0;
    }
    return this.currentLogFile;
  }

  /**
   * 执行文件滚动
   */
  private rollFile(): void {
    // 查找下一个可用的迭代器
    let iterator = 1;
    while (true) {
      const nextFile = this.getLogFilePath(this.currentDate, iterator);
      const file = Bun.file(nextFile);
      // 检查文件是否存在且大小
      if (!file.size || file.size === 0) {
        this.currentLogFile = nextFile;
        this.currentFileSize = 0;
        break;
      }
      iterator++;
    }
  }

  /**
   * 清理过期日志文件
   */
  private cleanOldLogs(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.maxDays);
    const cutoffDateString = getDateString(cutoffDate);

    try {
      // 使用 Glob 匹配日志文件
      const glob = new Bun.Glob("*.log");
      const logFiles = Array.from(glob.scanSync(this.logDir));

      for (const filePath of logFiles) {
        // 提取文件名中的日期部分
        const fileName = filePath.split(/[/\\]/).pop() ?? "";
        const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);

        if (dateMatch && dateMatch[1] && dateMatch[1] < cutoffDateString) {
          // 删除过期文件
          Bun.write(filePath, "");
        }
      }
    } catch {
      // 忽略清理错误
    }
  }
}

// ============================================================================
// 默认实例
// ============================================================================

/** 默认日志器实例 */
let defaultLogger: Logger | null = null;

/**
 * 获取默认日志器
 */
export function getLogger(config?: LoggerConfig): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger(config);
  }
  return defaultLogger;
}

/**
 * 重置默认日志器（主要用于测试）
 */
export function resetLogger(): void {
  if (defaultLogger) {
    defaultLogger.close();
    defaultLogger = null;
  }
}
