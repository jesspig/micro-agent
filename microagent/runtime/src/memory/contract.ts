/**
 * IMemory 扩展接口
 *
 * 扩展基础 IMemory 接口，提供更丰富的记忆管理能力
 */

import type { IMemory } from "../contracts.js";
import type { Message } from "../types.js";
import type { MemoryConfig, MemoryEntry, MemorySearchResult } from "./types.js";

// ============================================================================
// IMemoryExtended 接口
// ============================================================================

/**
 * IMemory 扩展接口
 *
 * 继承基础 IMemory 接口，增加搜索、条目管理和整合能力。
 * 提供完整的记忆管理功能。
 */
export interface IMemoryExtended extends IMemory {
  /** 记忆配置 */
  readonly config: MemoryConfig;

  /**
   * 搜索记忆
   * 根据查询语句搜索相关记忆
   * @param query - 搜索查询
   * @param limit - 返回结果数量限制
   * @returns 搜索结果列表
   */
  search(query: string, limit?: number): Promise<MemorySearchResult[]>;

  /**
   * 添加记忆条目
   * @param entry - 条目数据（不含 id 和 createdAt）
   * @returns 新创建的条目 ID
   */
  addEntry(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<string>;

  /**
   * 删除记忆条目
   * @param id - 条目 ID
   */
  deleteEntry(id: string): Promise<void>;

  /**
   * 整合记忆
   * 将消息列表整合为长期记忆（LLM 驱动）
   * @param messages - 消息列表
   */
  consolidate(messages: Message[]): Promise<void>;
}
