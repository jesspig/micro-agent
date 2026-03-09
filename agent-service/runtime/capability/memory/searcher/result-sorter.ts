/**
 * 结果排序器
 *
 * 实现 Top-K 排序、分页、去重功能，支持基于 RRF 分数和重要性的混合排序。
 */

import { getLogger } from '@logtape/logtape';
import type { MemoryEntry, MemoryType } from '../../../../types/memory';

const log = getLogger(['memory', 'result-sorter']);

/** 排序字段 */
export type SortField = 'score' | 'createdAt' | 'accessedAt' | 'importance' | 'rrf' | 'combined';

/** 排序选项 */
export interface SortOptions {
  /** 排序字段 */
  field: SortField;
  /** 排序方向 */
  order: 'asc' | 'desc';
}

/** 分页选项 */
export interface PaginationOptions {
  /** 页码（从 1 开始） */
  page: number;
  /** 每页数量 */
  pageSize: number;
}

/** 排序结果 */
export interface SortedResult {
  /** 记忆条目 */
  entry: MemoryEntry;
  /** 分数 */
  score: number;
  /** RRF 分数（可选） */
  rrfScore?: number;
  /** 重要性分数（可选） */
  importanceScore?: number;
}

/** 混合排序配置 */
export interface HybridSortConfig {
  /** RRF 分数权重 (0-1) */
  rrfWeight: number;
  /** 重要性分数权重 (0-1) */
  importanceWeight: number;
  /** 类型权重配置 */
  typeWeights?: Partial<Record<MemoryType, number>>;
  /** 时间衰减权重 (0-1) */
  timeDecayWeight: number;
  /** 时间衰减半衰期（天） */
  halfLifeDays: number;
}

/** 默认混合排序配置 */
const DEFAULT_HYBRID_CONFIG: HybridSortConfig = {
  rrfWeight: 0.6,
  importanceWeight: 0.3,
  timeDecayWeight: 0.1,
  halfLifeDays: 30,
  typeWeights: {
    preference: 1.2,
    decision: 1.1,
    entity: 1.0,
    fact: 0.95,
    summary: 0.9,
    document: 0.85,
    conversation: 0.8,
    other: 0.7,
  },
};

/**
 * 结果排序器
 *
 * 提供检索结果的后处理功能：
 * - Top-K 排序
 * - 分页
 * - 去重
 * - RRF + 重要性混合排序
 * - 多字段排序
 */
export class ResultSorter {
  private hybridConfig: HybridSortConfig;

  constructor(config?: Partial<HybridSortConfig>) {
    this.hybridConfig = { ...DEFAULT_HYBRID_CONFIG, ...config };
  }

  /**
   * Top-K 排序
   * @param results - 检索结果
   * @param k - 返回数量
   * @param options - 排序选项
   * @returns 排序后的结果
   */
  topK(
    results: SortedResult[],
    k: number,
    options: SortOptions = { field: 'score', order: 'desc' }
  ): SortedResult[] {
    const sorted = this.sort(results, options);
    return sorted.slice(0, k);
  }

  /**
   * 排序
   * @param results - 检索结果
   * @param options - 排序选项
   * @returns 排序后的结果
   */
  sort(
    results: SortedResult[],
    options: SortOptions = { field: 'score', order: 'desc' }
  ): SortedResult[] {
    const { field, order } = options;

    return [...results].sort((a, b) => {
      let valueA: number;
      let valueB: number;

      switch (field) {
        case 'score':
          valueA = a.score;
          valueB = b.score;
          break;
        case 'rrf':
          valueA = a.rrfScore ?? a.score;
          valueB = b.rrfScore ?? b.score;
          break;
        case 'importance':
          valueA = a.importanceScore ?? a.entry.importance;
          valueB = b.importanceScore ?? b.entry.importance;
          break;
        case 'combined':
          valueA = this.calculateCombinedScore(a);
          valueB = this.calculateCombinedScore(b);
          break;
        case 'createdAt':
          valueA = this.getTimestamp(a.entry.createdAt);
          valueB = this.getTimestamp(b.entry.createdAt);
          break;
        case 'accessedAt':
          valueA = this.getTimestamp(a.entry.accessedAt);
          valueB = this.getTimestamp(b.entry.accessedAt);
          break;
        default:
          valueA = a.score;
          valueB = b.score;
      }

      return order === 'desc' ? valueB - valueA : valueA - valueB;
    });
  }

  /**
   * 混合排序（RRF + 重要性 + 时间衰减）
   *
   * @param results - 检索结果
   * @returns 排序后的结果
   */
  hybridSort(results: SortedResult[]): SortedResult[] {
    // 计算综合分数
    const scoredResults = results.map(r => ({
      ...r,
      rrfScore: r.rrfScore ?? r.score,
      importanceScore: r.importanceScore ?? r.entry.importance,
    }));

    // 应用时间衰减
    const now = Date.now();
    const halfLifeMs = this.hybridConfig.halfLifeDays * 24 * 60 * 60 * 1000;

    const processedResults = scoredResults.map(r => {
      const createdAt = this.getTimestamp(r.entry.createdAt);
      const ageMs = now - createdAt;
      const timeDecay = Math.exp(-ageMs / (halfLifeMs * 1.44));

      // 类型权重
      const typeWeight = this.hybridConfig.typeWeights?.[r.entry.type] ?? 1.0;

      // 综合分数
      const combinedScore =
        (r.rrfScore * this.hybridConfig.rrfWeight) *
        (r.importanceScore * this.hybridConfig.importanceWeight) *
        (timeDecay * this.hybridConfig.timeDecayWeight + (1 - this.hybridConfig.timeDecayWeight)) *
        typeWeight;

      return {
        ...r,
        score: combinedScore,
      };
    });

    // 按综合分数降序排序
    return processedResults.sort((a, b) => b.score - a.score);
  }

  /**
   * 多字段排序
   *
   * @param results - 检索结果
   * @param fields - 排序字段列表（按优先级排序）
   * @returns 排序后的结果
   */
  multiFieldSort(
    results: SortedResult[],
    fields: Array<{ field: SortField; order: 'asc' | 'desc' }>
  ): SortedResult[] {
    return [...results].sort((a, b) => {
      for (const { field, order } of fields) {
        const comparison = this.compareByField(a, b, field);
        if (comparison !== 0) {
          return order === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  /**
   * 分页
   * @param results - 检索结果
   * @param options - 分页选项
   * @returns 分页后的结果
   */
  paginate(results: SortedResult[], options: PaginationOptions): SortedResult[] {
    const { page, pageSize } = options;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return results.slice(start, end);
  }

  /**
   * 去重
   * @param results - 检索结果
   * @returns 去重后的结果
   */
  deduplicate(results: SortedResult[]): SortedResult[] {
    const seen = new Set<string>();
    const deduped: SortedResult[] = [];

    for (const result of results) {
      if (!seen.has(result.entry.id)) {
        seen.add(result.entry.id);
        deduped.push(result);
      }
    }

    log.debug('去重完成', {
      originalCount: results.length,
      dedupedCount: deduped.length,
    });

    return deduped;
  }

  /**
   * 完整处理流程
   * @param results - 检索结果
   * @param options - 处理选项
   * @returns 处理后的结果
   */
  process(
    results: SortedResult[],
    options: {
      limit?: number;
      sort?: SortOptions;
      page?: number;
      pageSize?: number;
      deduplicate?: boolean;
      useHybridSort?: boolean;
      multiSort?: Array<{ field: SortField; order: 'asc' | 'desc' }>;
    } = {}
  ): SortedResult[] {
    let processed = [...results];

    // 去重
    if (options.deduplicate !== false) {
      processed = this.deduplicate(processed);
    }

    // 排序
    if (options.useHybridSort) {
      processed = this.hybridSort(processed);
    } else if (options.multiSort && options.multiSort.length > 0) {
      processed = this.multiFieldSort(processed, options.multiSort);
    } else if (options.sort) {
      processed = this.sort(processed, options.sort);
    }

    // 分页
    if (options.page && options.pageSize) {
      processed = this.paginate(processed, {
        page: options.page,
        pageSize: options.pageSize,
      });
    }

    // Top-K
    if (options.limit) {
      processed = processed.slice(0, options.limit);
    }

    return processed;
  }

  /**
   * 合并多个结果集
   * @param resultSets - 多个结果集
   * @param limit - 返回数量
   * @returns 合并后的结果
   */
  merge(
    resultSets: SortedResult[][],
    limit?: number
  ): SortedResult[] {
    // 合并所有结果
    const allResults = resultSets.flat();

    // 去重（保留最高分数）
    const scoreMap = new Map<string, SortedResult>();
    for (const result of allResults) {
      const existing = scoreMap.get(result.entry.id);
      if (!existing || result.score > existing.score) {
        scoreMap.set(result.entry.id, result);
      }
    }

    let merged = Array.from(scoreMap.values());

    // 使用混合排序
    merged = this.hybridSort(merged);

    // Top-K
    if (limit) {
      merged = merged.slice(0, limit);
    }

    return merged;
  }

  /**
   * 按相关性-重要性混合排序
   *
   * @param results - 检索结果
   * @param relevanceWeight - 相关性权重 (0-1)
   * @param importanceWeight - 重要性权重 (0-1)
   * @returns 排序后的结果
   */
  sortByRelevanceAndImportance(
    results: SortedResult[],
    relevanceWeight: number = 0.7,
    importanceWeight: number = 0.3
  ): SortedResult[] {
    return [...results].sort((a, b) => {
      const scoreA = a.score * relevanceWeight + a.entry.importance * importanceWeight;
      const scoreB = b.score * relevanceWeight + b.entry.importance * importanceWeight;
      return scoreB - scoreA;
    });
  }

  /**
   * 更新混合排序配置
   */
  updateHybridConfig(config: Partial<HybridSortConfig>): void {
    this.hybridConfig = { ...this.hybridConfig, ...config };
  }

  /**
   * 获取混合排序配置
   */
  getHybridConfig(): HybridSortConfig {
    return { ...this.hybridConfig };
  }

  // ========== 私有方法 ==========

  /**
   * 计算综合分数
   */
  private calculateCombinedScore(result: SortedResult): number {
    const rrfScore = result.rrfScore ?? result.score;
    const importanceScore = result.importanceScore ?? result.entry.importance;

    return (
      rrfScore * this.hybridConfig.rrfWeight +
      importanceScore * this.hybridConfig.importanceWeight
    );
  }

  /**
   * 按字段比较
   */
  private compareByField(a: SortedResult, b: SortedResult, field: SortField): number {
    switch (field) {
      case 'score':
        return a.score - b.score;
      case 'rrf':
        return (a.rrfScore ?? a.score) - (b.rrfScore ?? b.score);
      case 'importance':
        return (a.importanceScore ?? a.entry.importance) - (b.importanceScore ?? b.entry.importance);
      case 'combined':
        return this.calculateCombinedScore(a) - this.calculateCombinedScore(b);
      case 'createdAt':
        return this.getTimestamp(a.entry.createdAt) - this.getTimestamp(b.entry.createdAt);
      case 'accessedAt':
        return this.getTimestamp(a.entry.accessedAt) - this.getTimestamp(b.entry.accessedAt);
      default:
        return a.score - b.score;
    }
  }

  /**
   * 获取时间戳
   */
  private getTimestamp(date: Date | string | number): number {
    if (date instanceof Date) {
      return date.getTime();
    }
    if (typeof date === 'number') {
      return date;
    }
    return new Date(date).getTime();
  }
}
