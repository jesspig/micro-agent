/**
 * 记忆 API
 *
 * 提供记忆系统的完整 SDK 接口。
 */

import type { MemoryEntry, MemorySearchResult } from '../client/types';

/** 传输层接口 */
interface Transport {
  send(method: string, params: unknown): Promise<unknown>;
}

/** 检索模式 */
export type SearchMode = 'auto' | 'vector' | 'fulltext' | 'hybrid';

/** 记忆类型 */
export type MemoryType =
  | 'preference'
  | 'fact'
  | 'decision'
  | 'entity'
  | 'conversation'
  | 'summary'
  | 'document'
  | 'other';

/** 排序选项 */
export interface SortOptions {
  /** 排序字段 */
  field: 'score' | 'importance' | 'createdAt' | 'accessedAt';
  /** 排序方向 */
  order: 'asc' | 'desc';
}

/** 检索选项 */
export interface MemorySearchOptions {
  /** 返回结果数量限制 */
  limit?: number;
  /** 最小相似度阈值 (0-1) */
  minScore?: number;
  /** 过滤记忆类型 */
  types?: MemoryType[];
  /** 过滤会话键 */
  sessionKey?: string;
  /** 检索模式 */
  mode?: SearchMode;
  /** 排序选项 */
  sort?: SortOptions;
  /** 是否使用混合排序（RRF + 重要性） */
  useHybridSort?: boolean;
}

/** 检索响应 */
export interface MemorySearchResponse {
  /** 是否成功 */
  success: boolean;
  /** 检索结果 */
  results: MemorySearchResult[];
  /** 结果总数 */
  total: number;
  /** 实际使用的检索模式 */
  mode: string;
  /** 响应延迟（毫秒） */
  latency: number;
  /** 错误信息（失败时） */
  error?: string;
}

/** 存储选项 */
export interface MemoryStoreOptions {
  /** 记忆类型 */
  type: MemoryType;
  /** 记忆内容 */
  content: string;
  /** 会话键 */
  sessionKey?: string;
  /** 重要性分数 (0-1) */
  importance?: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 存储响应 */
export interface MemoryStoreResponse {
  /** 是否成功 */
  success: boolean;
  /** 记忆 ID */
  id?: string;
  /** 错误信息（失败时） */
  error?: string;
}

/** 记忆详情 */
export interface MemoryDetail {
  /** 记忆 ID */
  id: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 记忆内容 */
  content: string;
  /** 重要性分数 */
  importance: number;
  /** 稳定性分数 */
  stability: number;
  /** 状态 */
  status: 'active' | 'archived' | 'protected' | 'deleted';
  /** 创建时间 */
  createdAt: string;
  /** 最后访问时间 */
  accessedAt: string;
  /** 访问次数 */
  accessCount: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 记忆统计 */
export interface MemoryStats {
  /** 总条目数 */
  totalEntries: number;
  /** 总会话数 */
  totalSessions: number;
  /** 最早条目时间 */
  oldestEntry: string | null;
  /** 最新条目时间 */
  newestEntry: string | null;
}

/**
 * 记忆 API
 *
 * 提供记忆系统的完整操作接口：
 * - 检索（向量/全文/混合）
 * - 存储
 * - 获取
 * - 删除
 * - 统计
 */
export class MemoryAPI {
  constructor(private transport: Transport) {}

  /**
   * 搜索记忆
   *
   * 支持多种检索模式：
   * - vector: 纯向量语义检索
   * - fulltext: 纯全文关键词检索
   * - hybrid: 混合检索（RRF 融合）
   * - auto: 自动选择最佳模式
   *
   * @param query - 搜索查询
   * @param options - 检索选项
   * @returns 检索结果
   */
  async search(
    query: string,
    options?: MemorySearchOptions
  ): Promise<MemorySearchResponse> {
    const response = await this.transport.send('memory.search', {
      query,
      ...options,
    });

    return response as MemorySearchResponse;
  }

  /**
   * 向量检索
   *
   * 纯语义相似度检索，适合概念性查询。
   *
   * @param query - 搜索查询
   * @param limit - 返回数量
   * @returns 检索结果
   */
  async vectorSearch(
    query: string,
    limit?: number
  ): Promise<MemorySearchResponse> {
    return this.search(query, { mode: 'vector', limit });
  }

  /**
   * 全文检索
   *
   * 关键词匹配检索，适合精确查询。
   *
   * @param query - 搜索查询
   * @param limit - 返回数量
   * @returns 检索结果
   */
  async fulltextSearch(
    query: string,
    limit?: number
  ): Promise<MemorySearchResponse> {
    return this.search(query, { mode: 'fulltext', limit });
  }

  /**
   * 混合检索
   *
   * 结合向量和全文检索，使用 RRF 融合结果。
   *
   * @param query - 搜索查询
   * @param options - 检索选项
   * @returns 检索结果
   */
  async hybridSearch(
    query: string,
    options?: Omit<MemorySearchOptions, 'mode'>
  ): Promise<MemorySearchResponse> {
    return this.search(query, { ...options, mode: 'hybrid' });
  }

  /**
   * 按类型检索
   *
   * @param type - 记忆类型
   * @param query - 搜索查询
   * @param limit - 返回数量
   * @returns 检索结果
   */
  async searchByType(
    type: MemoryType,
    query: string,
    limit?: number
  ): Promise<MemorySearchResponse> {
    return this.search(query, { types: [type], limit });
  }

  /**
   * 按会话检索
   *
   * @param sessionKey - 会话键
   * @param query - 搜索查询
   * @param limit - 返回数量
   * @returns 检索结果
   */
  async searchBySession(
    sessionKey: string,
    query: string,
    limit?: number
  ): Promise<MemorySearchResponse> {
    return this.search(query, { sessionKey, limit });
  }

  /**
   * 存储记忆
   *
   * @param options - 存储选项
   * @returns 存储结果
   */
  async store(options: MemoryStoreOptions): Promise<MemoryStoreResponse> {
    const response = await this.transport.send('memory.store', options);
    return response as MemoryStoreResponse;
  }

  /**
   * 添加记忆（简化接口）
   *
   * @param entry - 记忆条目
   * @returns 记忆 ID
   */
  async add(entry: Omit<MemoryEntry, 'id'>): Promise<string> {
    const response = await this.store({
      type: entry.type as MemoryType,
      content: entry.content,
      sessionKey: entry.sessionKey,
      importance: entry.importance,
      metadata: entry.metadata as Record<string, unknown>,
    });

    if (!response.success || !response.id) {
      throw new Error(response.error ?? 'Failed to add memory');
    }

    return response.id;
  }

  /**
   * 获取记忆详情
   *
   * @param id - 记忆 ID
   * @returns 记忆详情
   */
  async get(id: string): Promise<MemoryDetail | null> {
    try {
      const response = await this.transport.send('memory.get', { id });
      const result = response as { success: boolean; entry?: MemoryDetail; error?: string };

      if (!result.success) {
        return null;
      }

      return result.entry ?? null;
    } catch {
      return null;
    }
  }

  /**
   * 删除记忆
   *
   * @param id - 记忆 ID
   * @returns 是否成功
   */
  async delete(id: string): Promise<boolean> {
    try {
      const response = await this.transport.send('memory.delete', { id });
      const result = response as { success: boolean };
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * 清除会话记忆
   *
   * @param sessionKey - 会话键
   */
  async clearSession(sessionKey: string): Promise<void> {
    await this.transport.send('memory.clearSession', { sessionKey });
  }

  /**
   * 获取记忆统计
   *
   * @returns 记忆统计信息
   */
  async getStats(): Promise<MemoryStats> {
    const response = await this.transport.send('memory.stats', {});
    return response as MemoryStats;
  }

  /**
   * 更新记忆重要性
   *
   * @param id - 记忆 ID
   * @param importance - 重要性分数 (0-1)
   * @returns 是否成功
   */
  async updateImportance(id: string, importance: number): Promise<boolean> {
    try {
      const response = await this.transport.send('memory.updateImportance', {
        id,
        importance,
      });
      const result = response as { success: boolean };
      return result.success;
    } catch {
      return false;
    }
  }
}
