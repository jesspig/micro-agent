/**
 * 混合检索器
 *
 * 整合向量检索、全文检索、RRF 融合和时间衰减的统一检索接口。
 */

import { getLogger } from '@logtape/logtape';
import type { MemoryEntry, MemorySearchOptions, MemorySearchResult } from '../../../../types/memory';
import { FTSSearcher } from './fts-searcher';
import { RRFFusion, type SearchResult } from './rrf-fusion';
import { TemporalDecayScorer } from './temporal-decay';

const log = getLogger(['memory', 'hybrid-searcher']);

/** 向量检索器接口 */
export interface VectorSearcher {
  search(query: string, options: {
    limit?: number;
    minScore?: number;
    filter?: Record<string, unknown>;
  }): Promise<Array<{ entry: MemoryEntry; score: number }>>;
}

/** 混合检索器配置 */
export interface HybridSearcherConfig {
  /** FTS 检索器配置 */
  fts: {
    dbPath: string;
    tableName?: string;
  };
  /** RRF 配置 */
  rrf?: {
    k?: number;
    vectorWeight?: number;
    fulltextWeight?: number;
  };
  /** 时间衰减配置 */
  temporalDecay?: {
    halfLifeDays?: number;
    considerAccessCount?: boolean;
    accessCountWeight?: number;
    minDecayFactor?: number;
  };
  /** 默认检索结果数量 */
  defaultLimit?: number;
  /** 最大检索结果数量 */
  maxLimit?: number;
  /** 最小相似度阈值 */
  minScore?: number;
}

/** 混合检索模式 */
export type HybridSearchMode = 'hybrid' | 'vector' | 'fulltext';

/**
 * 混合检索器
 *
 * 提供统一的检索接口，支持：
 * - 向量语义检索
 * - 全文关键词检索
 * - RRF 结果融合
 * - 时间衰减排序
 */
export class HybridSearcher {
  private ftsSearcher: FTSSearcher;
  private rrfFusion: RRFFusion;
  private temporalScorer: TemporalDecayScorer;
  private vectorSearcher?: VectorSearcher;
  private config: Required<
    Pick<HybridSearcherConfig, 'defaultLimit' | 'maxLimit' | 'minScore'>
  >;

  constructor(config: HybridSearcherConfig, vectorSearcher?: VectorSearcher) {
    this.ftsSearcher = new FTSSearcher(config.fts);
    this.rrfFusion = new RRFFusion(config.rrf);
    this.temporalScorer = new TemporalDecayScorer(config.temporalDecay);
    this.vectorSearcher = vectorSearcher;
    this.config = {
      defaultLimit: config.defaultLimit ?? 10,
      maxLimit: config.maxLimit ?? 50,
      minScore: config.minScore ?? 0,
    };
  }

  /**
   * 设置向量检索器
   */
  setVectorSearcher(searcher: VectorSearcher): void {
    this.vectorSearcher = searcher;
    log.debug('向量检索器已设置');
  }

  /**
   * 执行混合检索
   * @param query - 搜索查询
   * @param options - 检索选项
   * @returns 检索结果
   */
  async search(
    query: string,
    options: MemorySearchOptions & { mode?: HybridSearchMode } = {}
  ): Promise<MemorySearchResult[]> {
    const {
      limit = this.config.defaultLimit,
      minScore = this.config.minScore,
      mode = 'hybrid',
      types,
      sessionKey,
    } = options;

    const effectiveLimit = Math.min(limit, this.config.maxLimit);

    let results: Array<{ entry: MemoryEntry; score: number }>;

    switch (mode) {
      case 'vector':
        results = await this.vectorSearch(query, effectiveLimit, minScore);
        break;
      case 'fulltext':
        results = this.fulltextSearch(query, effectiveLimit, minScore, types, sessionKey);
        break;
      case 'hybrid':
      default:
        results = await this.hybridSearch(query, effectiveLimit, minScore, types, sessionKey);
        break;
    }

    // 应用时间衰减
    const decayedResults = this.applyTemporalDecay(results);

    log.debug('混合检索完成', {
      query,
      mode,
      resultCount: decayedResults.length,
    });

    return decayedResults;
  }

  /**
   * 向量检索
   */
  private async vectorSearch(
    query: string,
    limit: number,
    minScore: number
  ): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    if (!this.vectorSearcher) {
      log.warn('向量检索器未配置，返回空结果');
      return [];
    }

    return this.vectorSearcher.search(query, { limit, minScore });
  }

  /**
   * 全文检索
   */
  private fulltextSearch(
    query: string,
    limit: number,
    minScore: number,
    types?: MemoryEntry['type'][],
    sessionKey?: string
  ): Array<{ entry: MemoryEntry; score: number }> {
    const ftsResults = this.ftsSearcher.search({
      query,
      limit,
      minScore,
      types,
      sessionKey,
    });

    return ftsResults.map((result) => ({
      entry: result.entry,
      score: result.score,
    }));
  }

  /**
   * 混合检索（向量 + 全文）
   */
  private async hybridSearch(
    query: string,
    limit: number,
    minScore: number,
    types?: MemoryEntry['type'][],
    sessionKey?: string
  ): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    // 并行执行向量和全文检索
    const [vectorResults, ftsResults] = await Promise.all([
      this.vectorSearcher
        ? this.vectorSearcher.search(query, { limit: limit * 2, minScore })
        : Promise.resolve([]),
      Promise.resolve(
        this.ftsSearcher.search({
          query,
          limit: limit * 2,
          minScore,
          types,
          sessionKey,
        })
      ),
    ]);

    // 转换为 RRF 兼容格式
    const vectorSearchResults: SearchResult[] = vectorResults.map((r) => ({
      entry: r.entry,
      score: r.score,
      source: 'vector',
    }));

    const ftsSearchResults: SearchResult[] = ftsResults.map((r) => ({
      entry: r.entry,
      score: r.score,
      source: 'fulltext',
    }));

    // RRF 融合
    const fusedResults = this.rrfFusion.fuse(
      vectorSearchResults,
      ftsSearchResults
    );

    // 返回 top-K 结果
    return fusedResults.slice(0, limit);
  }

  /**
   * 应用时间衰减
   */
  private applyTemporalDecay(
    results: Array<{ entry: MemoryEntry; score: number }>
  ): MemorySearchResult[] {
    return results.map((result) => ({
      entry: result.entry,
      score: this.temporalScorer.calculateScore(result.entry, result.score),
    }));
  }

  /**
   * 索引记忆条目
   */
  index(entry: MemoryEntry): void {
    this.ftsSearcher.index(entry);
  }

  /**
   * 批量索引
   */
  indexBatch(entries: MemoryEntry[]): void {
    this.ftsSearcher.indexBatch(entries);
  }

  /**
   * 删除索引
   */
  deleteIndex(id: string): void {
    this.ftsSearcher.delete(id);
  }

  /**
   * 获取检索统计
   */
  getStats(): { ftsCount: number } {
    const stats = this.ftsSearcher.getStats();
    return { ftsCount: stats.totalCount };
  }

  /**
   * 关闭资源
   */
  close(): void {
    this.ftsSearcher.close();
    log.debug('混合检索器已关闭');
  }
}
