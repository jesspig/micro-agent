/**
 * RRF 融合算法
 *
 * 实现 Reciprocal Rank Fusion 算法，用于合并多个检索结果。
 * 公式: RRF(d) = Σ 1 / (k + rank(d))
 *
 * 其中:
 * - d: 文档
 * - k: 常数（默认 60）
 * - rank(d): 文档在单个排序列表中的排名
 */

import { getLogger } from '@logtape/logtape';
import type { MemoryEntry } from '../../../../types/memory';

const log = getLogger(['memory', 'rrf-fusion']);

/** 检索结果 */
export interface SearchResult {
  /** 记忆条目 */
  entry: MemoryEntry;
  /** 原始分数 */
  score: number;
  /** 来源标识 */
  source: string;
}

/** RRF 配置 */
export interface RRFFusionConfig {
  /** RRF 常数 K，默认 60 */
  k: number;
  /** 向量检索权重 */
  vectorWeight: number;
  /** 全文检索权重 */
  fulltextWeight: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: RRFFusionConfig = {
  k: 60,
  vectorWeight: 1.0,
  fulltextWeight: 1.0,
};

/**
 * RRF 融合器
 *
 * 使用 Reciprocal Rank Fusion 算法合并多个检索结果。
 * 优点：
 * - 不需要分数归一化
 * - 对异常值不敏感
 * - 计算简单高效
 */
export class RRFFusion {
  private config: RRFFusionConfig;

  constructor(config?: Partial<RRFFusionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 计算单个列表的 RRF 分数
   * @param results - 检索结果列表
   * @param weight - 权重
   * @returns ID -> RRF 分数的映射
   */
  private calculateRRFScores(
    results: SearchResult[],
    weight: number
  ): Map<string, number> {
    const scores = new Map<string, number>();

    results.forEach((result, index) => {
      const rank = index + 1; // 排名从 1 开始
      const rrfScore = weight / (this.config.k + rank);
      const id = result.entry.id;

      const currentScore = scores.get(id) ?? 0;
      scores.set(id, currentScore + rrfScore);
    });

    return scores;
  }

  /**
   * 融合向量检索和全文检索结果
   * @param vectorResults - 向量检索结果
   * @param fulltextResults - 全文检索结果
   * @returns 融合后的结果数组
   */
  fuse(
    vectorResults: SearchResult[],
    fulltextResults: SearchResult[]
  ): Array<{ entry: MemoryEntry; score: number }> {
    // 计算向量检索的 RRF 分数
    const vectorScores = this.calculateRRFScores(
      vectorResults,
      this.config.vectorWeight
    );

    // 计算全文检索的 RRF 分数
    const fulltextScores = this.calculateRRFScores(
      fulltextResults,
      this.config.fulltextWeight
    );

    // 合并所有 ID
    const allIds = new Set([
      ...vectorScores.keys(),
      ...fulltextScores.keys(),
    ]);

    // 构建 ID -> entry 的映射
    const entryMap = new Map<string, MemoryEntry>();
    [...vectorResults, ...fulltextResults].forEach((result) => {
      if (!entryMap.has(result.entry.id)) {
        entryMap.set(result.entry.id, result.entry);
      }
    });

    // 计算最终分数
    const fusedResults: Array<{ entry: MemoryEntry; score: number }> = [];

    allIds.forEach((id) => {
      const vectorScore = vectorScores.get(id) ?? 0;
      const fulltextScore = fulltextScores.get(id) ?? 0;
      const totalScore = vectorScore + fulltextScore;

      const entry = entryMap.get(id);
      if (entry) {
        fusedResults.push({ entry, score: totalScore });
      }
    });

    // 按分数降序排序
    fusedResults.sort((a, b) => b.score - a.score);

    log.debug('RRF 融合完成', {
      vectorCount: vectorResults.length,
      fulltextCount: fulltextResults.length,
      fusedCount: fusedResults.length,
    });

    return fusedResults;
  }

  /**
   * 融合多个检索结果列表
   * @param resultLists - 多个检索结果列表及其权重
   * @returns 融合后的结果数组
   */
  fuseMultiple(
    resultLists: Array<{ results: SearchResult[]; weight: number }>
  ): Array<{ entry: MemoryEntry; score: number }> {
    // 计算每个列表的 RRF 分数
    const allScores = resultLists.map(({ results, weight }) =>
      this.calculateRRFScores(results, weight)
    );

    // 合并所有 ID
    const allIds = new Set<string>();
    allScores.forEach((scores) => {
      scores.forEach((_, id) => allIds.add(id));
    });

    // 构建 ID -> entry 的映射
    const entryMap = new Map<string, MemoryEntry>();
    resultLists.forEach(({ results }) => {
      results.forEach((result) => {
        if (!entryMap.has(result.entry.id)) {
          entryMap.set(result.entry.id, result.entry);
        }
      });
    });

    // 计算最终分数
    const fusedResults: Array<{ entry: MemoryEntry; score: number }> = [];

    allIds.forEach((id) => {
      let totalScore = 0;
      allScores.forEach((scores) => {
        totalScore += scores.get(id) ?? 0;
      });

      const entry = entryMap.get(id);
      if (entry) {
        fusedResults.push({ entry, score: totalScore });
      }
    });

    // 按分数降序排序
    fusedResults.sort((a, b) => b.score - a.score);

    log.debug('多列表 RRF 融合完成', {
      listCount: resultLists.length,
      fusedCount: fusedResults.length,
    });

    return fusedResults;
  }

  /**
   * 获取当前配置
   */
  getConfig(): RRFFusionConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RRFFusionConfig>): void {
    this.config = { ...this.config, ...config };
    log.debug('RRF 配置已更新', { config: this.config });
  }
}

/**
 * RRF 工具函数
 */
export const rrfUtils = {
  /**
   * 计算单个排名的 RRF 分数
   * @param rank - 排名（从 1 开始）
   * @param k - 常数
   * @returns RRF 分数
   */
  score(rank: number, k: number = 60): number {
    return 1 / (k + rank);
  },

  /**
   * 计算在排名 N 时的 RRF 分数贡献
   * @param k - 常数
   * @param n - 排名
   * @returns 分数贡献
   */
  contributionAtRank(k: number, n: number): number {
    return 1 / (k + n);
  },
};
