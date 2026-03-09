/**
 * 记忆检索器
 */

import type { MemoryEntry, MemorySearchResult, MemorySearchOptions } from '../../../types/memory';
import type { SearchMode, MemoryFilter } from './types';
import { MemoryStore } from './store';
import { FTSSearcher } from './searcher/fts-searcher';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'search']);

/**
 * 记忆检索器
 *
 * 支持：
 * - 向量检索
 * - 全文检索
 * - 混合检索
 */
export class MemorySearcher {
  private lastSearchMode: SearchMode = 'auto';
  private ftsSearcher: FTSSearcher | null = null;

  constructor(
    private store: MemoryStore,
    ftsSearcher?: FTSSearcher
  ) {
    this.ftsSearcher = ftsSearcher ?? null;
  }

  /**
   * 搜索记忆
   */
  async search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]> {
    const mode = options?.mode ?? 'auto';
    const limit = options?.limit ?? 10;

    let results: Array<{ entry: MemoryEntry; score: number }>;

    switch (mode) {
      case 'vector':
        results = await this.vectorSearch(query, limit, options?.filter);
        break;
      case 'fulltext':
        results = await this.fulltextSearch(query, limit, options?.filter);
        break;
      case 'hybrid':
        results = await this.hybridSearch(query, limit, options?.filter);
        break;
      case 'auto':
      default:
        results = await this.autoSearch(query, limit, options?.filter);
        break;
    }

    this.lastSearchMode = mode === 'auto' ? this.lastSearchMode : mode;

    // 应用相似度阈值
    if (options?.minScore) {
      results = results.filter(r => r.score >= (options.minScore ?? 0));
    }

    return results.map(r => ({
      entry: r.entry,
      score: r.score,
    }));
  }

  /**
   * 获取最后一次检索模式
   */
  getLastSearchMode(): SearchMode {
    return this.lastSearchMode;
  }

  /**
   * 向量检索
   */
  private async vectorSearch(
    query: string,
    limit: number,
    filter?: MemoryFilter
  ): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    const results = await this.store.search(query, { limit, filter });
    this.lastSearchMode = 'vector';
    return results;
  }

  /**
   * 全文检索
   */
  private async fulltextSearch(
    query: string,
    limit: number,
    filter?: MemoryFilter
  ): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    this.lastSearchMode = 'fulltext';

    // 如果有 FTS 检索器，使用它进行全文检索
    if (this.ftsSearcher) {
      try {
        const results = this.ftsSearcher.search({
          query,
          limit,
          types: filter?.types,
          sessionKey: filter?.sessionKey,
        });
        log.debug('FTS 全文检索完成', { query, resultCount: results.length });
        return results;
      } catch (error) {
        log.warn('FTS 检索失败，回退到内存搜索', { error: String(error) });
      }
    }

    // 回退：使用存储层的简单关键词搜索
    log.debug('FTS 检索器不可用，使用内存关键词匹配');
    return this.fallbackFulltextSearch(query, limit, filter);
  }

  /**
   * 回退全文检索（内存关键词匹配）
   */
  private async fallbackFulltextSearch(
    query: string,
    limit: number,
    filter?: MemoryFilter
  ): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    // 使用存储层的搜索接口（可能返回向量结果）
    // 如果没有嵌入服务，这是一个空操作
    const results = await this.store.search(query, { limit: limit * 2, filter });

    // 对结果进行关键词匹配打分
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    return results
      .map(r => {
        const content = r.entry.content.toLowerCase();
        let matchCount = 0;
        for (const term of queryTerms) {
          if (content.includes(term)) {
            matchCount++;
          }
        }
        const score = queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
        return { entry: r.entry, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 混合检索
   */
  private async hybridSearch(
    query: string,
    limit: number,
    filter?: MemoryFilter
  ): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    // 并行执行向量检索和全文检索
    const [vectorResults, fulltextResults] = await Promise.all([
      this.vectorSearch(query, limit * 2, filter),
      this.fulltextSearch(query, limit * 2, filter),
    ]);

    // 合并结果（RRF 融合）
    const merged = this.mergeResults(vectorResults, fulltextResults, limit);
    this.lastSearchMode = 'hybrid';
    return merged;
  }

  /**
   * 自动选择检索模式
   */
  private async autoSearch(
    query: string,
    limit: number,
    filter?: MemoryFilter
  ): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    // 优先使用向量检索
    try {
      const results = await this.vectorSearch(query, limit, filter);
      if (results.length > 0) {
        return results;
      }
    } catch {
      // 向量检索失败，回退到全文检索
    }

    return this.fulltextSearch(query, limit, filter);
  }

  /**
   * 合并检索结果（Reciprocal Rank Fusion）
   */
  private mergeResults(
    vectorResults: Array<{ entry: MemoryEntry; score: number }>,
    fulltextResults: Array<{ entry: MemoryEntry; score: number }>,
    limit: number
  ): Array<{ entry: MemoryEntry; score: number }> {
    const k = 60; // RRF 常数
    const scores = new Map<string, { entry: MemoryEntry; score: number }>();

    // 向量结果打分
    vectorResults.forEach((r, i) => {
      const id = r.entry.id;
      const rrfScore = 1 / (k + i + 1);
      const existing = scores.get(id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(id, { entry: r.entry, score: rrfScore });
      }
    });

    // 全文结果打分
    fulltextResults.forEach((r, i) => {
      const id = r.entry.id;
      const rrfScore = 1 / (k + i + 1);
      const existing = scores.get(id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(id, { entry: r.entry, score: rrfScore });
      }
    });

    // 排序并返回
    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
