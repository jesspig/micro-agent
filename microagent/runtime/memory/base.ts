/**
 * Memory 抽象基类
 *
 * 提供记忆管理的基础实现，子类只需实现存储相关抽象方法
 */

import type { Message } from "../types.js";
import type { IMemoryExtended } from "./contract.js";
import type { MemoryConfig, MemoryEntry, MemorySearchResult } from "./types.js";
import {
  createTimer,
  logMethodCall,
  logMethodReturn,
  logMethodError,
  createDefaultLogger,
} from "../logger/index.js";

const logger = createDefaultLogger("debug", ["runtime", "memory"]);

// ============================================================================
// BaseMemory 抽象类
// ============================================================================

/**
 * Memory 抽象基类
 *
 * 实现历史缓冲和消息整合的通用逻辑，
 * 子类只需实现存储相关的抽象方法。
 */
export abstract class BaseMemory implements IMemoryExtended {
  /** 记忆配置（子类必须实现） */
  abstract readonly config: MemoryConfig;

  /** 历史记录缓冲 */
  protected historyBuffer: string[] = [];

  /** 历史缓冲区最大容量 */
  protected readonly maxBufferSize = 50;

  // --------------------------------------------------------------------------
  // 抽象方法（子类必须实现）
  // --------------------------------------------------------------------------

  /**
   * 获取记忆上下文
   * @returns 格式化的记忆文本，用于提示词注入
   */
  abstract getMemoryContext(): string;

  /**
   * 写入长期记忆
   * @param content - 记忆内容
   */
  abstract writeLongTerm(content: string): Promise<void>;

  /**
   * 搜索记忆
   * @param query - 搜索查询
   * @param limit - 结果数量限制
   * @returns 搜索结果列表
   */
  abstract search(
    query: string,
    limit?: number,
  ): Promise<MemorySearchResult[]>;

  /**
   * 添加记忆条目
   * @param entry - 条目数据
   * @returns 条目 ID
   */
  abstract addEntry(
    entry: Omit<MemoryEntry, "id" | "createdAt">,
  ): Promise<string>;

  /**
   * 删除记忆条目
   * @param id - 条目 ID
   */
  abstract deleteEntry(id: string): Promise<void>;

  // --------------------------------------------------------------------------
  // 具体方法（提供默认实现）
  // --------------------------------------------------------------------------

  /**
   * 追加历史记录
   * 将条目添加到缓冲区，缓冲区满时自动刷新到长期记忆
   * @param entry - 历史条目
   */
  async appendHistory(entry: string): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "appendHistory",
      module: "BaseMemory",
      params: { entryLength: entry.length },
    });

    try {
      this.historyBuffer.push(entry);

      // 缓冲区满了触发整合
      if (this.historyBuffer.length >= this.maxBufferSize) {
        logger.info("记忆操作", {
          action: "buffer_full",
          bufferSize: this.historyBuffer.length,
        });
        await this.flushHistory();
      }

      logMethodReturn(logger, {
        method: "appendHistory",
        module: "BaseMemory",
        result: { bufferLength: this.historyBuffer.length },
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method: "appendHistory",
        module: "BaseMemory",
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { entryLength: entry.length },
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 整合记忆
   * 将消息列表整合为长期记忆
   * @param messages - 消息列表
   */
  async consolidate(messages: Message[]): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "consolidate",
      module: "BaseMemory",
      params: { messageCount: messages.length },
    });

    try {
      if (messages.length === 0) {
        logMethodReturn(logger, {
          method: "consolidate",
          module: "BaseMemory",
          result: { skipped: true, reason: "empty_messages" },
          duration: timer(),
        });
        return;
      }

      // 提取最近的对话
      const recentMessages = messages.slice(-10);
      const summary = this.summarizeMessages(recentMessages);

      if (summary) {
        logger.info("记忆操作", {
          action: "consolidate",
          summaryLength: summary.length,
        });
        await this.writeLongTerm(summary);
      }

      logMethodReturn(logger, {
        method: "consolidate",
        module: "BaseMemory",
        result: { summaryWritten: !!summary },
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method: "consolidate",
        module: "BaseMemory",
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: { messageCount: messages.length },
        duration: timer(),
      });
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // 保护方法（子类可覆盖）
  // --------------------------------------------------------------------------

  /**
   * 清空历史缓冲
   * 将缓冲区内容写入长期记忆并清空
   */
  protected async flushHistory(): Promise<void> {
    const timer = createTimer();
    logMethodCall(logger, {
      method: "flushHistory",
      module: "BaseMemory",
      params: { bufferLength: this.historyBuffer.length },
    });

    try {
      if (this.historyBuffer.length === 0) {
        logMethodReturn(logger, {
          method: "flushHistory",
          module: "BaseMemory",
          result: { skipped: true, reason: "empty_buffer" },
          duration: timer(),
        });
        return;
      }

      const content = this.historyBuffer.join("\n");
      const entryCount = this.historyBuffer.length;
      this.historyBuffer = [];

      logger.info("记忆操作", {
        action: "flush_history",
        entryCount,
        contentLength: content.length,
      });

      await this.writeLongTerm(content);

      logMethodReturn(logger, {
        method: "flushHistory",
        module: "BaseMemory",
        result: { flushedEntries: entryCount },
        duration: timer(),
      });
    } catch (err: unknown) {
      const error = err as Error;
      logMethodError(logger, {
        method: "flushHistory",
        module: "BaseMemory",
        error: {
          name: error.name,
          message: error.message,
          ...(error.stack ? { stack: error.stack } : {}),
        },
        params: {},
        duration: timer(),
      });
      throw err;
    }
  }

  /**
   * 消息摘要
   * 将消息列表转换为摘要文本
   * @param messages - 消息列表
   * @returns 摘要文本
   */
  protected summarizeMessages(messages: Message[]): string {
    return messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n");
  }
}