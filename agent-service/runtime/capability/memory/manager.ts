/**
 * 记忆管理器
 *
 * 统一管理记忆系统的各个组件，提供简化的 API。
 */

import type { LLMProvider } from '../../../types/provider';
import type {
  MemoryEntry,
  MemoryType,
  MemorySearchResult,
  MemorySearchOptions,
} from '../../../types/memory';
import type { EmbeddingService } from './types';
import { MemoryStore } from './store';
import { OpenAIEmbedding, NoEmbedding } from './embedding';
import { MemorySearcher } from './search';
import { ConversationSummarizer, type SummarizerConfig } from './summarizer';
import { classifyMemory, type ClassifyOptions } from './classifier';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'manager']);

/** 记忆管理器配置 */
export interface MemoryManagerConfig {
  /** 存储路径 */
  storagePath: string;
  /** 是否启用记忆系统 */
  enabled: boolean;
  /** 是否启用自动摘要 */
  autoSummarize: boolean;
  /** 触发摘要的消息阈值 */
  summarizeThreshold: number;
  /** 检索结果数量限制 */
  searchLimit: number;
  /** 嵌入服务配置 */
  embedding?: {
    modelId: string;
    baseUrl: string;
    apiKey: string;
  };
  /** LLM Provider（用于摘要和分类） */
  llmProvider?: LLMProvider;
}

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
 */
export class MemoryManager {
  private config: MemoryManagerConfig;
  private store: MemoryStore;
  private embeddingService: EmbeddingService;
  private searcher: MemorySearcher;
  private summarizer?: ConversationSummarizer;
  private initialized = false;

  constructor(config: MemoryManagerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 创建嵌入服务
    if (this.config.embedding) {
      this.embeddingService = new OpenAIEmbedding(
        this.config.embedding.modelId,
        this.config.embedding.baseUrl,
        this.config.embedding.apiKey
      );
    } else {
      this.embeddingService = new NoEmbedding();
    }

    // 创建存储
    this.store = new MemoryStore({
      storagePath: this.config.storagePath,
      embeddingService: this.embeddingService,
    });

    // 创建检索器
    this.searcher = new MemorySearcher(this.store);

    // 创建摘要器（如果启用）
    if (this.config.autoSummarize && this.config.llmProvider) {
      this.summarizer = new ConversationSummarizer(
        this.config.llmProvider,
        this.store,
        {
          minMessages: this.config.summarizeThreshold,
          maxLength: 2000,
          idleTimeout: 300000,
        }
      );
    }
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
      hasEmbedding: this.embeddingService.isAvailable(),
      autoSummarize: this.config.autoSummarize,
    });
  }

  /**
   * 关闭记忆系统
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    await this.store.close();
    this.summarizer?.stopIdleCheck();
    this.initialized = false;

    log.info('记忆管理器已关闭');
  }

  /**
   * 存储记忆
   */
  async save(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>): Promise<string> {
    await this.ensureInitialized();

    // 自动分类（如果未指定类型）
    if (!entry.type || entry.type === 'other') {
      const classification = await classifyMemory(entry.content);
      entry = { ...entry, type: classification.type };
    }

    const id = await this.store.store(entry);
    return id;
  }

  /**
   * 检索相关记忆
   */
  async search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]> {
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
  async classify(content: string, options?: ClassifyOptions): Promise<{
    type: MemoryType;
    confidence: number;
  }> {
    const result = await classifyMemory(content, options);
    return {
      type: result.type,
      confidence: result.confidence,
    };
  }

  /**
   * 生成摘要（如果启用）
   */
  async summarizeIfNeeded(messages: Array<{ role: string; content: string }>): Promise<void> {
    if (!this.summarizer) return;

    if (this.summarizer.shouldSummarize(messages as Parameters<typeof this.summarizer.summarize>[0])) {
      const summary = await this.summarizer.summarize(messages as Parameters<typeof this.summarizer.summarize>[0]);
      // 存储摘要
      log.debug('摘要已生成', { topic: summary.topic });
    }
  }

  /**
   * 获取嵌入服务是否可用
   */
  isEmbeddingAvailable(): boolean {
    return this.embeddingService.isAvailable();
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
  getStore(): MemoryStore {
    return this.store;
  }

  /**
   * 获取检索器实例
   */
  getSearcher(): MemorySearcher {
    return this.searcher;
  }

  /**
   * 获取摘要器实例
   */
  getSummarizer(): ConversationSummarizer | undefined {
    return this.summarizer;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}
