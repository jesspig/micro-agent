/**
 * 记忆管理器
 *
 * 统一管理记忆系统的各个组件，提供简化的 API。
 * 属于 SDK 高级封装层。
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import type {
  MemoryEntry,
  MemoryType,
  MemorySearchResult,
  MemorySearchOptions,
} from '../runtime';

const log = getLogger(['sdk', 'memory', 'manager']);

// === 存储适配器接口 ===

/** 嵌入服务接口 */
export interface EmbeddingService {
  isAvailable(): boolean;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

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

/** 分类函数类型 */
export type ClassifyFunction = (
  content: string,
  options?: { useLLM?: boolean; context?: string }
) => Promise<{ type: MemoryType; confidence: number }>;

/** 摘要器接口 */
export interface SummarizerAdapter {
  shouldSummarize(messages: Array<{ role: string; content: string }>): boolean;
  summarize(messages: Array<{ role: string; content: string }>): Promise<unknown>;
}

// === 配置 ===

/** 记忆管理器配置 */
export const MemoryManagerConfigSchema = z.object({
  /** 存储路径 */
  storagePath: z.string(),
  /** 是否启用记忆系统 */
  enabled: z.boolean().default(true),
  /** 是否启用自动摘要 */
  autoSummarize: z.boolean().default(true),
  /** 触发摘要的消息阈值 */
  summarizeThreshold: z.number().min(1).default(20),
  /** 检索结果数量限制 */
  searchLimit: z.number().min(1).default(10),
});

export type MemoryManagerConfig = z.infer<typeof MemoryManagerConfigSchema>;

/** 默认配置 */
const DEFAULT_CONFIG: Partial<MemoryManagerConfig> = {
  enabled: true,
  autoSummarize: true,
  summarizeThreshold: 20,
  searchLimit: 10,
};

/**
 * 记忆管理器
 *
 * 职责：
 * - 协调存储、嵌入、检索、摘要、分类等组件
 * - 提供统一的记忆管理 API
 * - 管理组件生命周期
 *
 * 设计原则：
 * - 通过依赖注入接收组件实例（组合优于继承）
 * - 提供简化的 API 封装底层复杂性
 * - 支持可选组件（摘要器、分类器）
 */
export class MemoryManager {
  private config: MemoryManagerConfig;
  private store: MemoryStoreAdapter;
  private searcher: MemorySearcherAdapter;
  private embeddingService?: EmbeddingService;
  private summarizer?: SummarizerAdapter;
  private classifyFn?: ClassifyFunction;
  private initialized = false;

  constructor(options: {
    store: MemoryStoreAdapter;
    searcher: MemorySearcherAdapter;
    config: Partial<MemoryManagerConfig> & { storagePath: string };
    embeddingService?: EmbeddingService;
    summarizer?: SummarizerAdapter;
    classifyFn?: ClassifyFunction;
  }) {
    this.config = { ...DEFAULT_CONFIG, ...options.config } as MemoryManagerConfig;
    this.store = options.store;
    this.searcher = options.searcher;
    this.embeddingService = options.embeddingService;
    this.summarizer = options.summarizer;
    this.classifyFn = options.classifyFn;
  }

  /**
   * 初始化记忆系统
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.store.initialize();
    this.initialized = true;

    log.info('记忆管理器已初始化', {
      enabled: this.config.enabled,
      hasEmbedding: this.embeddingService?.isAvailable() ?? false,
      autoSummarize: this.config.autoSummarize,
    });
  }

  /**
   * 关闭记忆系统
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    await this.store.close();
    this.initialized = false;

    log.info('记忆管理器已关闭');
  }

  /**
   * 存储记忆
   */
  async save(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>
  ): Promise<string> {
    await this.ensureInitialized();

    // 自动分类（如果未指定类型且有分类函数）
    if (!entry.type || entry.type === 'other') {
      if (this.classifyFn) {
        const classification = await this.classifyFn(entry.content);
        entry = { ...entry, type: classification.type };
      }
    }

    const id = await this.store.store(entry);
    return id;
  }

  /**
   * 检索相关记忆
   */
  async search(
    query: string,
    options?: MemorySearchOptions
  ): Promise<MemorySearchResult[]> {
    await this.ensureInitialized();
    return this.searcher.search(query, options);
  }

  /**
   * 获取指定记忆
   */
  async get(id: string): Promise<MemoryEntry | undefined> {
    await this.ensureInitialized();
    return this.store.get(id);
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.store.delete(id);
  }

  /**
   * 更新记忆访问
   */
  async touch(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.store.touch(id);
  }

  /**
   * 获取最近记忆
   */
  async getRecent(sessionKey: string, limit?: number): Promise<MemoryEntry[]> {
    await this.ensureInitialized();
    return this.store.getRecent(sessionKey, limit ?? this.config.searchLimit);
  }

  /**
   * 清除会话记忆
   */
  async clearSession(sessionKey: string): Promise<void> {
    await this.ensureInitialized();
    await this.store.clearSession(sessionKey);
  }

  /**
   * 分类记忆内容
   */
  async classify(
    content: string,
    options?: { useLLM?: boolean; context?: string }
  ): Promise<{ type: MemoryType; confidence: number }> {
    if (!this.classifyFn) {
      return { type: 'other', confidence: 0.5 };
    }
    return this.classifyFn(content, options);
  }

  /**
   * 生成摘要（如果启用）
   */
  async summarizeIfNeeded(
    messages: Array<{ role: string; content: string }>
  ): Promise<void> {
    if (!this.summarizer) return;

    if (this.summarizer.shouldSummarize(messages)) {
      await this.summarizer.summarize(messages);
      log.debug('摘要已生成');
    }
  }

  /**
   * 获取嵌入服务是否可用
   */
  isEmbeddingAvailable(): boolean {
    return this.embeddingService?.isAvailable() ?? false;
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalSessions: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    await this.ensureInitialized();
    return this.store.getStats();
  }

  /**
   * 获取存储实例
   */
  getStore(): MemoryStoreAdapter {
    return this.store;
  }

  /**
   * 获取检索器实例
   */
  getSearcher(): MemorySearcherAdapter {
    return this.searcher;
  }

  /**
   * 获取摘要器实例
   */
  getSummarizer(): SummarizerAdapter | undefined {
    return this.summarizer;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取配置
   */
  getConfig(): MemoryManagerConfig {
    return { ...this.config };
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

/**
 * 创建记忆管理器
 */
export function createMemoryManager(options: {
  store: MemoryStoreAdapter;
  searcher: MemorySearcherAdapter;
  config: Partial<MemoryManagerConfig> & { storagePath: string };
  embeddingService?: EmbeddingService;
  summarizer?: SummarizerAdapter;
  classifyFn?: ClassifyFunction;
}): MemoryManager {
  return new MemoryManager(options);
}
