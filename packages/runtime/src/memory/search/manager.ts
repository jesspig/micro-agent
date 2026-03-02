/**
 * 检索管理器
 * 
 * 负责向量检索、全文检索、混合检索、双层检索等
 */

import type { MemoryEntry, MemoryFilter, SearchOptions } from '../../types';
import type { MemoryStoreConfig } from '../types';
import type { MemoryStoreCore } from '../core';
import type { MigrationStatus } from '../types';
import { getLogger } from '@logtape/logtape';
import { VectorSearcher } from './vector';
import { FulltextSearcher } from './fulltext';
import { HybridSearcher } from './hybrid';
import type { SearchMode } from './types';

const log = getLogger(['memory', 'search']);

/**
 * 检索管理器
 */
export class SearchManager {
  private core: MemoryStoreCore;
  private config: MemoryStoreConfig;
  private lastSearchMode: SearchMode = 'unknown';

  // 子检索器
  private vectorSearcher: VectorSearcher;
  private fulltextSearcher: FulltextSearcher;
  private hybridSearcher: HybridSearcher;

  /**
   * 构造函数
   * @param core MemoryStoreCore 实例
   * @param config 可选的配置对象（如果不传则从 core.storeConfig 获取）
   */
  constructor(core: MemoryStoreCore, config?: MemoryStoreConfig) {
    this.core = core;
    // 如果没有提供 config，则从 core 获取
    this.config = config ?? core.storeConfig;

    // 初始化子检索器
    this.vectorSearcher = new VectorSearcher(core, this.config);
    this.fulltextSearcher = new FulltextSearcher(core);
    this.hybridSearcher = new HybridSearcher(
      this.vectorSearcher,
      this.fulltextSearcher,
      (query) => this.fulltextSearcher.extractKeywords(query),
      (content, keywords) => this.fulltextSearcher.calculateKeywordScore(content, keywords)
    );
  }

  /**
   * 获取最后一次记忆检索使用的模式
   */
  getLastSearchMode(): SearchMode {
    return this.lastSearchMode;
  }

  /**
   * 搜索记忆（主入口）
   */
  async search(query: string, options?: SearchOptions): Promise<MemoryEntry[]> {
    const limit = Math.min(
      options?.limit ?? this.config.defaultSearchLimit!,
      this.config.maxSearchLimit!
    );

    const mode = options?.mode ?? 'auto';
    const hasEmbedding = this.config.embeddingService && this.config.embeddingService.isAvailable();

    // 确定使用的模型
    const targetModel = options?.model ?? this.config.embedModel;

    // 检查该模型的向量列是否存在
    const hasVectorColumn = targetModel ? await this.vectorSearcher.hasVectorColumn(targetModel) : true;

    // 根据模式选择检索策略
    switch (mode) {
      case 'fulltext':
        log.info('🔍 [MemoryStore] 开始检索全文记忆', {
          query: query.slice(0, 50),
          limit,
          mode: 'fulltext',
        });
        this.lastSearchMode = 'fulltext';
        return this.fulltextSearcher.search(query, limit, options?.filter);

      case 'vector':
        if (!hasEmbedding || !hasVectorColumn) {
          log.warn('🔍 [MemoryStore] 向量模式但条件不满足，回退到全文检索', {
            hasEmbedding,
            hasVectorColumn,
          });
          this.lastSearchMode = 'fulltext';
          return this.fulltextSearcher.search(query, limit, options?.filter);
        }
        log.info('🔍 [MemoryStore] 开始检索向量记忆', {
          query: query.slice(0, 50),
          limit,
          mode: 'vector',
          targetModel,
        });
        this.lastSearchMode = 'vector';
        return this.vectorSearcher.search(query, limit, options?.filter, targetModel);

      case 'hybrid':
        log.info('🔍 [MemoryStore] 开始检索混合记忆', {
          query: query.slice(0, 50),
          limit,
          mode: 'hybrid',
          targetModel,
        });
        this.lastSearchMode = 'hybrid';
        return this.hybridSearcher.search(query, limit, options?.filter, targetModel);

      case 'auto':
      default:
        // 自动模式：检查是否在迁移中
        const migrationStatus = await this.getMigrationStatus();

        if (migrationStatus.status === 'running' && migrationStatus.targetModel === targetModel) {
          // 迁移中：混合检索
          log.info('🔍 [MemoryStore] 开始检索混合记忆', {
            query: query.slice(0, 50),
            limit,
            mode: 'migration-hybrid',
            migratedUntil: migrationStatus.migratedUntil,
            progress: migrationStatus.progress,
          });
          this.lastSearchMode = 'migration-hybrid';
          return this.hybridSearcher.searchWithMigration(
            query,
            limit,
            options?.filter,
            targetModel,
            migrationStatus
          );
        }

        // 非迁移中：优先向量，失败回退全文
        if (hasEmbedding && hasVectorColumn) {
          log.info('🔍 [MemoryStore] 开始检索向量记忆', {
            query: query.slice(0, 50),
            limit,
            mode: 'vector',
            targetModel,
          });
          const results = await this.vectorSearcher.search(query, limit, options?.filter, targetModel);
          if (results.length > 0) {
            this.lastSearchMode = 'vector';
            return results;
          }
          // 向量检索无结果，尝试全文检索
          log.info('🔍 [MemoryStore] 向量检索无结果，开始检索全文记忆');
          this.lastSearchMode = 'fulltext';
          return this.fulltextSearcher.search(query, limit, options?.filter);
        }
        log.info('🔍 [MemoryStore] 开始检索全文记忆', {
          query: query.slice(0, 50),
          limit,
          mode: 'fulltext',
        });
        this.lastSearchMode = 'fulltext';
        return this.fulltextSearcher.search(query, limit, options?.filter);
    }
  }

  /**
   * 双层检索（向量 + 关键词）
   */
  async dualLayerSearch(
    query: string,
    limit: number = 10,
    candidates: number = 200,
    filter?: MemoryFilter,
    modelId?: string
  ): Promise<MemoryEntry[]> {
    return this.hybridSearcher.dualLayerSearch(query, limit, candidates, filter, modelId);
  }

  /**
   * 获取迁移状态（需外部提供）
   */
  private async getMigrationStatus(): Promise<MigrationStatus> {
    return {
      status: 'idle',
      progress: 0,
      migratedCount: 0,
      totalRecords: 0,
      failedCount: 0,
    };
  }
}
