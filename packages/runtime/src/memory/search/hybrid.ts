/**
 * 混合检索模块
 * 
 * 结合向量检索和全文检索的结果
 */

import type { MemoryEntry, MemoryFilter } from '../../types';
import type { MigrationStatus } from '../types';
import type { VectorSearcher } from './vector';
import type { FulltextSearcher } from './fulltext';
import type { KeywordScoredEntry } from './types';
import { getLogger } from '@logtape/logtape';

const log = getLogger(['memory', 'search', 'hybrid']);

export class HybridSearcher {
  private vectorSearcher: VectorSearcher;
  private fulltextSearcher: FulltextSearcher;
  private extractKeywords: (query: string) => string[];
  private calculateKeywordScore: (content: string, keywords: string[]) => number;

  constructor(
    vectorSearcher: VectorSearcher,
    fulltextSearcher: FulltextSearcher,
    extractKeywords: (query: string) => string[],
    calculateKeywordScore: (content: string, keywords: string[]) => number
  ) {
    this.vectorSearcher = vectorSearcher;
    this.fulltextSearcher = fulltextSearcher;
    this.extractKeywords = extractKeywords;
    this.calculateKeywordScore = calculateKeywordScore;
  }

  /**
   * 混合检索（向量 + 全文）
   */
  async search(
    query: string,
    limit: number,
    filter?: MemoryFilter,
    modelId?: string
  ): Promise<MemoryEntry[]> {
    const targetModel = modelId; // 传递 undefined 给 vectorSearcher，让它使用默认配置
    const hasVectorColumn = modelId ? await this.vectorSearcher.hasVectorColumn(modelId) : true;

    const [vectorResults, fulltextResults] = await Promise.all([
      this.vectorSearcher.search(query, limit, filter, targetModel),
      this.fulltextSearcher.search(query, limit, filter),
    ]);

    // 合并结果，去重
    const seen = new Set<string>();
    const merged: MemoryEntry[] = [];

    for (const entry of vectorResults) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    for (const entry of fulltextResults) {
      if (!seen.has(entry.id) && merged.length < limit) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    log.info('📖 记忆检索完成', {
      query: query.slice(0, 50),
      source: 'hybrid',
      sourceDetail: {
        vector: vectorResults.length,
        fulltext: fulltextResults.length,
      },
      resultCount: merged.length,
      model: targetModel,
    });

    return merged.slice(0, limit);
  }

  /**
   * 迁移中混合检索
   */
  async searchWithMigration(
    query: string,
    limit: number,
    filter: MemoryFilter | undefined,
    modelId: string | undefined,
    migrationStatus: MigrationStatus
  ): Promise<MemoryEntry[]> {
    const targetModel = modelId;
    if (!targetModel) {
      return this.fulltextSearcher.search(query, limit, filter);
    }

    const hasVectorColumn = await this.vectorSearcher.hasVectorColumn(targetModel);

    const [vectorResults, fulltextResults] = await Promise.all([
      this.vectorSearcher.search(query, limit, filter, targetModel),
      this.fulltextSearcher.searchWithMigrationFilter(query, limit, filter, migrationStatus.migratedUntil),
    ]);

    const seen = new Set<string>();
    const merged: MemoryEntry[] = [];

    for (const entry of vectorResults) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    for (const entry of fulltextResults) {
      if (!seen.has(entry.id) && merged.length < limit) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }

    log.info('📖 记忆检索完成', {
      query: query.slice(0, 50),
      source: 'migration-hybrid',
      sourceDetail: {
        vector: { count: vectorResults.length, desc: '已迁移部分' },
        fulltext: { count: fulltextResults.length, desc: '未迁移部分' },
      },
      resultCount: merged.length,
      migration: {
        progress: migrationStatus.progress,
        migratedUntil: migrationStatus.migratedUntil,
      },
    });

    return merged.slice(0, limit);
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
    const startTime = Date.now();
    const targetModel = modelId;
    const hasVectorColumn = targetModel ? await this.vectorSearcher.hasVectorColumn(targetModel) : false;

    // 第一层：向量检索
    let vectorCandidates: MemoryEntry[] = [];
    let vectorScores: Map<string, number> = new Map();

    if (hasVectorColumn) {
      try {
        vectorCandidates = await this.vectorSearcher.search(query, candidates, filter, targetModel);

        // 计算向量相似度分数（归一化）
        for (let i = 0; i < vectorCandidates.length; i++) {
          const entry = vectorCandidates[i];
          const score = 1 - i / vectorCandidates.length;
          vectorScores.set(entry.id, score);
        }
      } catch (error) {
        log.warn('🔍 [MemoryStore] 双层检索向量层失败', { error: String(error) });
      }
    }

    // 如果向量检索无结果，回退到全文检索
    if (vectorCandidates.length === 0) {
      log.info('🔍 [MemoryStore] 双层检索回退到全文检索', { query: query.slice(0, 50) });
      return this.fulltextSearcher.search(query, limit, filter);
    }

    // 第二层：候选内关键词匹配
    const keywords = this.extractKeywords(query);
    const scoredCandidates: KeywordScoredEntry[] = [];

    for (const entry of vectorCandidates) {
      const vectorScore = vectorScores.get(entry.id) ?? 0;
      const keywordScore = this.calculateKeywordScore(entry.content, keywords);
      const finalScore = vectorScore * 0.7 + keywordScore * 0.3;

      scoredCandidates.push({
        entry,
        vectorScore,
        keywordScore,
        finalScore,
      });
    }

    // 按综合分数排序
    scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);

    const elapsed = Date.now() - startTime;

    log.info('📖 记忆检索完成', {
      query: query.slice(0, 50),
      source: 'dual-layer',
      sourceDetail: {
        vectorCandidates: vectorCandidates.length,
        keywords: keywords.slice(0, 5),
      },
      resultCount: Math.min(scoredCandidates.length, limit),
      elapsed: `${elapsed}ms`,
    });

    return scoredCandidates.slice(0, limit).map((item) => ({
      ...item.entry,
      metadata: {
        ...item.entry.metadata,
        score: item.finalScore,
      },
    }));
  }
}
