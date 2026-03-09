/**
 * 记忆系统结构化日志器
 * 
 * 兼容 @logtape/logtape，输出结构化 JSON 日志。
 * 专为记忆系统设计的日志记录器，支持记忆操作追踪。
 */

import { getLogger, type Logger } from '@logtape/logtape';
import type { TraceContext } from '../../../infrastructure/logging/types';

// ============================================================
// 类型定义
// ============================================================

/** 记忆操作类型 */
export type MemoryOperationType = 
  | 'store'      // 存储记忆
  | 'retrieve'   // 检索记忆
  | 'search'     // 搜索记忆
  | 'delete'     // 删除记忆
  | 'clear'      // 清空记忆
  | 'summarize'  // 摘要记忆
  | 'migrate'    // 迁移记忆
  | 'cleanup';   // 清理过期记忆

/** 记忆类型 */
export type MemoryType = 'short_term' | 'long_term' | 'episodic';

/** 基础记忆日志条目 */
export interface MemoryLogEntry {
  /** 日志类型标识 */
  _type: 'memory_op';
  /** 时间戳 */
  timestamp: string;
  /** 日志级别 */
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  /** 日志分类 */
  category: string;
  /** 消息 */
  message: string;
  /** 操作类型 */
  operation: MemoryOperationType;
  /** 记忆类型 */
  memoryType?: MemoryType;
  /** 会话 ID */
  sessionId?: string;
  /** 查询内容预览 */
  queryPreview?: string;
  /** 结果数量 */
  resultCount?: number;
  /** 执行耗时（毫秒） */
  duration?: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 调用链上下文 */
  trace?: TraceContext;
  /** 额外属性 */
  properties?: Record<string, unknown>;
}

/** 搜索日志条目 */
export interface SearchLogEntry extends MemoryLogEntry {
  operation: 'search';
  /** 搜索模式 */
  searchMode?: 'vector' | 'fulltext' | 'hybrid' | 'auto';
  /** 最小相似度阈值 */
  minScore?: number;
  /** 返回数量限制 */
  limit?: number;
  /** 搜索延迟（毫秒） */
  latency?: number;
}

/** 迁移日志条目 */
export interface MigrationLogEntry extends MemoryLogEntry {
  operation: 'migrate';
  /** 目标模型 ID */
  targetModel?: string;
  /** 已迁移数量 */
  migratedCount?: number;
  /** 总数量 */
  totalCount?: number;
  /** 进度百分比 */
  progress?: number;
}

/** 记忆日志配置 */
export interface MemoryLoggerConfig {
  /** 模块名称 */
  moduleName: string;
  /** 是否启用 */
  enabled: boolean;
  /** 最低日志级别 */
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  /** 是否记录详细数据 */
  verbose: boolean;
  /** 敏感字段列表 */
  sensitiveFields: string[];
}

/** 默认配置 */
const DEFAULT_CONFIG: MemoryLoggerConfig = {
  moduleName: 'memory',
  enabled: true,
  level: 'info',
  verbose: false,
  sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'api_key'],
};

// ============================================================
// 记忆系统日志器
// ============================================================

/**
 * 记忆系统结构化日志器
 * 
 * 提供记忆操作的结构化日志记录，与 @logtape/logtape 完全兼容。
 */
export class MemoryLogger {
  private logger: Logger;
  private config: MemoryLoggerConfig;
  private logBuffer: MemoryLogEntry[] = [];
  private bufferSize: number;
  private flushInterval: number;
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(config: Partial<MemoryLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = getLogger([this.config.moduleName]);
    this.bufferSize = 100;
    this.flushInterval = 5000;
    
    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  /**
   * 获取当前时间戳
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * 脱敏处理数据
   */
  private sanitize(data: unknown, depth = 0): unknown {
    if (depth > 5) return '[深度超限]';
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;
    if (Buffer.isBuffer(data)) return '[Buffer]';
    if (Array.isArray(data)) {
      return data.slice(0, 10).map(item => this.sanitize(item, depth + 1));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (this.config.sensitiveFields.some(f => lowerKey.includes(f.toLowerCase()))) {
        result[key] = '***REDACTED***';
      } else {
        result[key] = this.sanitize(value, depth + 1);
      }
    }
    return result;
  }

  /**
   * 截断文本
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }

  /**
   * 开始定时刷新
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * 刷新缓冲区
   */
  flush(): void {
    if (this.logBuffer.length === 0) return;
    
    // 缓冲区日志已在写入时处理，此处仅清空
    this.logBuffer = [];
  }

  /**
   * 停止日志器
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.flush();
  }

  /**
   * 创建日志条目
   */
  private createEntry(
    level: MemoryLogEntry['level'],
    operation: MemoryOperationType,
    message: string,
    options: Partial<MemoryLogEntry> = {}
  ): MemoryLogEntry {
    const entry: MemoryLogEntry = {
      _type: 'memory_op',
      timestamp: this.getTimestamp(),
      level,
      category: this.config.moduleName,
      message,
      operation,
      success: options.success ?? true,
      ...options,
    };

    return entry;
  }

  /**
   * 写入日志
   */
  private write(entry: MemoryLogEntry): void {
    if (!this.config.enabled) return;

    // 根据级别写入
    const { level, message, ...properties } = entry;
    const props = this.sanitize(properties) as Record<string, unknown>;

    switch (level) {
      case 'trace':
        this.logger.trace(message, props);
        break;
      case 'debug':
        this.logger.debug(message, props);
        break;
      case 'info':
        this.logger.info(message, props);
        break;
      case 'warn':
        this.logger.warn(message, props);
        break;
      case 'error':
        this.logger.error(message, props);
        break;
    }

    // 添加到缓冲区
    this.logBuffer.push(entry);
    if (this.logBuffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  // ============================================================
  // 公共日志方法
  // ============================================================

  /**
   * 记录存储操作
   */
  logStore(
    memoryType: MemoryType,
    sessionId: string,
    content: string,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    const entry = this.createEntry(
      success ? 'info' : 'error',
      'store',
      success ? `存储${this.getMemoryTypeLabel(memoryType)}成功` : `存储${this.getMemoryTypeLabel(memoryType)}失败`,
      {
        memoryType,
        sessionId,
        queryPreview: this.truncate(content, 100),
        duration,
        success,
        error,
      }
    );
    this.write(entry);
  }

  /**
   * 记录检索操作
   */
  logRetrieve(
    memoryType: MemoryType,
    sessionId: string,
    query: string,
    resultCount: number,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    const entry = this.createEntry(
      success ? 'info' : 'error',
      'retrieve',
      success ? `检索${this.getMemoryTypeLabel(memoryType)}成功` : `检索${this.getMemoryTypeLabel(memoryType)}失败`,
      {
        memoryType,
        sessionId,
        queryPreview: this.truncate(query, 100),
        resultCount,
        duration,
        success,
        error,
      }
    );
    this.write(entry);
  }

  /**
   * 记录搜索操作
   */
  logSearch(
    sessionId: string,
    query: string,
    options: {
      searchMode?: 'vector' | 'fulltext' | 'hybrid' | 'auto';
      minScore?: number;
      limit?: number;
      resultCount?: number;
      duration?: number;
      success?: boolean;
      error?: string;
    } = {}
  ): void {
    const success = options.success ?? true;
    const entry: SearchLogEntry = {
      _type: 'memory_op',
      timestamp: this.getTimestamp(),
      level: success ? 'info' : 'error',
      category: this.config.moduleName,
      message: success ? '搜索记忆成功' : '搜索记忆失败',
      operation: 'search',
      sessionId,
      queryPreview: this.truncate(query, 100),
      success,
      ...options,
    };
    this.write(entry);
  }

  /**
   * 记录删除操作
   */
  logDelete(
    sessionId: string,
    memoryIds: string[],
    duration: number,
    success: boolean,
    error?: string
  ): void {
    const entry = this.createEntry(
      success ? 'info' : 'error',
      'delete',
      success ? `删除记忆成功: ${memoryIds.length} 条` : '删除记忆失败',
      {
        sessionId,
        resultCount: memoryIds.length,
        duration,
        success,
        error,
        properties: this.config.verbose ? { memoryIds } : undefined,
      }
    );
    this.write(entry);
  }

  /**
   * 记录清空操作
   */
  logClear(
    sessionId: string,
    deletedCount: number,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    const entry = this.createEntry(
      success ? 'warn' : 'error', // 清空操作使用 warn 级别
      'clear',
      success ? `清空记忆成功: ${deletedCount} 条` : '清空记忆失败',
      {
        sessionId,
        resultCount: deletedCount,
        duration,
        success,
        error,
      }
    );
    this.write(entry);
  }

  /**
   * 记录摘要操作
   */
  logSummarize(
    sessionId: string,
    inputCount: number,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    const entry = this.createEntry(
      success ? 'info' : 'error',
      'summarize',
      success ? `摘要生成成功: ${inputCount} 条输入` : '摘要生成失败',
      {
        sessionId,
        resultCount: inputCount,
        duration,
        success,
        error,
      }
    );
    this.write(entry);
  }

  /**
   * 记录迁移操作
   */
  logMigration(
    targetModel: string,
    migratedCount: number,
    totalCount: number,
    status: 'start' | 'progress' | 'complete' | 'error',
    error?: string
  ): void {
    const progress = totalCount > 0 ? Math.round((migratedCount / totalCount) * 100) : 0;
    const level = status === 'error' ? 'error' : status === 'complete' ? 'info' : 'debug';
    
    const entry: MigrationLogEntry = {
      _type: 'memory_op',
      timestamp: this.getTimestamp(),
      level,
      category: this.config.moduleName,
      message: status === 'start' 
        ? `开始迁移到模型 ${targetModel}`
        : status === 'complete'
        ? `迁移完成: ${migratedCount}/${totalCount}`
        : status === 'error'
        ? `迁移失败: ${error}`
        : `迁移进度: ${progress}%`,
      operation: 'migrate',
      targetModel,
      migratedCount,
      totalCount,
      progress,
      success: status !== 'error',
      error,
    };
    this.write(entry);
  }

  /**
   * 记录清理操作
   */
  logCleanup(
    deletedCount: number,
    summarizedCount: number,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    const entry = this.createEntry(
      success ? 'info' : 'error',
      'cleanup',
      success 
        ? `过期记忆清理完成: 删除 ${deletedCount} 条, 摘要 ${summarizedCount} 条`
        : '过期记忆清理失败',
      {
        resultCount: deletedCount + summarizedCount,
        duration,
        success,
        error,
        properties: { deletedCount, summarizedCount },
      }
    );
    this.write(entry);
  }

  /**
   * 记录调试信息
   */
  debug(message: string, properties?: Record<string, unknown>): void {
    const entry = this.createEntry('debug', 'store', message, {
      success: true,
      properties,
    });
    this.write(entry);
  }

  /**
   * 记录警告信息
   */
  warn(message: string, properties?: Record<string, unknown>): void {
    const entry = this.createEntry('warn', 'store', message, {
      success: true,
      properties,
    });
    this.write(entry);
  }

  /**
   * 记录错误信息
   */
  error(message: string, error?: Error | string, properties?: Record<string, unknown>): void {
    const entry = this.createEntry('error', 'store', message, {
      success: false,
      error: error instanceof Error ? error.message : error,
      properties: {
        ...properties,
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    this.write(entry);
  }

  /**
   * 获取记忆类型标签
   */
  private getMemoryTypeLabel(type: MemoryType): string {
    const labels: Record<MemoryType, string> = {
      short_term: '短期记忆',
      long_term: '长期记忆',
      episodic: '情景记忆',
    };
    return labels[type] ?? type;
  }

  /**
   * 获取缓冲区日志
   */
  getBuffer(): MemoryLogEntry[] {
    return [...this.logBuffer];
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<MemoryLoggerConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.moduleName) {
      this.logger = getLogger([config.moduleName]);
    }
  }
}

// ============================================================
// 全局实例
// ============================================================

/** 全局记忆日志器实例 */
let globalMemoryLogger: MemoryLogger | null = null;

/**
 * 获取全局记忆日志器
 */
export function getMemoryLogger(config?: Partial<MemoryLoggerConfig>): MemoryLogger {
  if (!globalMemoryLogger) {
    globalMemoryLogger = new MemoryLogger(config);
  }
  return globalMemoryLogger;
}

/**
 * 重置全局记忆日志器
 */
export function resetMemoryLogger(): void {
  if (globalMemoryLogger) {
    globalMemoryLogger.stop();
    globalMemoryLogger = null;
  }
}
