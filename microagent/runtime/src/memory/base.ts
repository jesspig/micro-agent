/**
 * Memory 抽象基类
 *
 * 提供记忆管理的基础实现，子类只需实现存储相关抽象方法
 */

import type { Message } from "../types.js";
import type { IMemoryExtended } from "./contract.js";
import type { MemoryConfig, MemoryEntry, MemorySearchResult } from "./types.js";

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
    this.historyBuffer.push(entry);

    // 缓冲区满了触发整合
    if (this.historyBuffer.length >= this.maxBufferSize) {
      await this.flushHistory();
    }
  }

  /**
   * 整合记忆
   * 将消息列表整合为长期记忆
   * @param messages - 消息列表
   */
  async consolidate(messages: Message[]): Promise<void> {
    if (messages.length === 0) return;

    // 提取最近的对话
    const recentMessages = messages.slice(-10);
    const summary = this.summarizeMessages(recentMessages);

    if (summary) {
      await this.writeLongTerm(summary);
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
    if (this.historyBuffer.length === 0) return;

    const content = this.historyBuffer.join("\n");
    this.historyBuffer = [];

    await this.writeLongTerm(content);
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
