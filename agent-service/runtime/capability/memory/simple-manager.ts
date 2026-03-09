/**
 * 简化版记忆管理器
 *
 * Agent Service 内部使用的轻量级记忆管理器
 */

import type { MemoryEntry, MemoryType, MemorySearchResult, MemorySearchOptions } from '../../../types/memory';
import type { EmbeddingService } from './embedding-service';

/** 存储适配器接口 */
export interface MemoryStoreAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;
  store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>): Promise<string>;
  get(id: string): Promise<MemoryEntry | undefined>;
  delete(id: string): Promise<void>;
  touch(id: string): Promise<void>;
  getRecent(sessionKey: string, limit?: number): Promise<MemoryEntry[]>;
  clearSession(sessionKey: string): Promise<void>;
  getStats(): Promise<{
    totalEntries: number;
    totalSessions: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }>;
}

/** 搜索适配器接口 */
export interface MemorySearcherAdapter {
  search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]>;
}

/** 记忆管理器配置 */
export interface SimpleMemoryManagerConfig {
  storagePath: string;
  enabled?: boolean;
  autoSummarize?: boolean;
  summarizeThreshold?: number;
  searchLimit?: number;
}

/** 保存记忆的参数 */
export interface SaveMemoryParams {
  type: MemoryType;
  content: string;
  sessionKey?: string;
  importance?: number;
  stability?: number;
  status?: MemoryEntry['status'];
  metadata?: Record<string, unknown>;
}

/**
 * 简化版记忆管理器
 *
 * 提供基本的记忆存储和检索功能
 */
export class SimpleMemoryManager {
  private storeAdapter: MemoryStoreAdapter;
  private searcherAdapter: MemorySearcherAdapter;
  private config: SimpleMemoryManagerConfig;
  private embeddingService?: EmbeddingService;

  constructor(
    options: {
      store: MemoryStoreAdapter;
      searcher: MemorySearcherAdapter;
      config: SimpleMemoryManagerConfig;
      embeddingService?: EmbeddingService;
    }
  ) {
    this.storeAdapter = options.store;
    this.searcherAdapter = options.searcher;
    this.config = options.config;
    this.embeddingService = options.embeddingService;
  }

  /**
   * 初始化记忆管理器
   */
  async initialize(): Promise<void> {
    await this.storeAdapter.initialize();
  }

  /**
   * 存储记忆
   */
  async store(
    content: string,
    type: MemoryType = 'fact',
    metadata?: Record<string, unknown>
  ): Promise<string> {
    return this.storeAdapter.store({
      type,
      content,
      importance: 0.5,
      stability: 1.0,
      status: 'active',
      metadata,
    });
  }

  /**
   * 保存记忆（兼容 API）
   */
  async save(params: SaveMemoryParams): Promise<string> {
    return this.storeAdapter.store({
      type: params.type,
      content: params.content,
      importance: params.importance ?? 0.5,
      stability: params.stability ?? 1.0,
      status: params.status ?? 'active',
      metadata: params.sessionKey 
        ? { sessionKey: params.sessionKey, ...params.metadata }
        : params.metadata,
    });
  }

  /**
   * 搜索记忆
   */
  async search(
    query: string,
    options?: MemorySearchOptions
  ): Promise<MemorySearchResult[]> {
    return this.searcherAdapter.search(query, {
      limit: this.config.searchLimit ?? 10,
      ...options,
    });
  }

  /**
   * 获取最近的记忆
   */
  async getRecent(sessionKey: string, limit?: number): Promise<MemoryEntry[]> {
    return this.storeAdapter.getRecent(sessionKey, limit);
  }

  /**
   * 获取统计信息
   */
  async getStats() {
    return this.storeAdapter.getStats();
  }

  /**
   * 关闭记忆管理器
   */
  async close(): Promise<void> {
    await this.storeAdapter.close();
  }

  /**
   * 检查是否有嵌入服务
   */
  hasEmbedding(): boolean {
    return this.embeddingService?.isAvailable() ?? false;
  }

  /**
   * 获取配置
   */
  getConfig(): SimpleMemoryManagerConfig {
    return { ...this.config };
  }
}
