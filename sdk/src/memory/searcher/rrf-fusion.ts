/**
 * RRF 融合算法
 *
 * 实现 Reciprocal Rank Fusion 算法，用于合并多个检索结果。
 * 公式: RRF(d) = Σ 1 / (k + rank(d))
 */

import { getLogger } from '@logtape/logtape';
import type { MemoryEntry } from '../../runtime';

const log = getLogger(['sdk', 'memory', 'rrf-fusion']);

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
 */
export class RRFFusion {
  private config: RRFFusionConfig;

  constructor(config?: Partial<RRFFusionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 计算单个列表的 RRF 分数
   */
  private calculateRRFScores(
    results: SearchResult[],
    weight: number
  ): Map<string, number> {
    const scores = new Map<string, number>();

    results.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = weight / (this.config.k + rank);
      const id = result.entry.id;

      const currentScore = scores.get(id) ?? 0;
      scores.set(id, currentScore + rrfScore);
    });

    return scores;
  }

  /**
   * 融合向量检索和全文检索结果
   */
  fuse(
    vectorResults: SearchResult[],
    fulltextResults: SearchResult[]
  ): Array<{ entry: MemoryEntry; score: number }> {
    const vectorScores = this.calculateRRFScores(
      vectorResults,
      this.config.vectorWeight
    );

    const fulltextScores = this.calculateRRFScores(
      fulltextResults,
      this.config.fulltextWeight
    );

    const allIds = new Set([
      ...vectorScores.keys(),
      ...fulltextScores.keys(),
    ]);

    const entryMap = new Map<string, MemoryEntry>();
    [...vectorResults, ...fulltextResults].forEach((result) => {
      if (!entryMap.has(result.entry.id)) {
        entryMap.set(result.entry.id, result.entry);
      }
    });

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
   */
  fuseMultiple(
    resultLists: Array<{ results: SearchResult[]; weight: number }>
  ): Array<{ entry: MemoryEntry; score: number }> {
    const allScores = resultLists.map(({ results, weight }) =>
      this.calculateRRFScores(results, weight)
    );

    const allIds = new Set<string>();
    allScores.forEach((scores) => {
      scores.forEach((_, id) => allIds.add(id));
    });

    const entryMap = new Map<string, MemoryEntry>();
    resultLists.forEach(({ results }) => {
      results.forEach((result) => {
        if (!entryMap.has(result.entry.id)) {
          entryMap.set(result.entry.id, result.entry);
        }
      });
    });

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

    fusedResults.sort((a, b) => b.score - a.score);

    return fusedResults;
  }

  getConfig(): RRFFusionConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<RRFFusionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * RRF 工具函数
 */
export const rrfUtils = {
  score(rank: number, k: number = 60): number {
    return 1 / (k + rank);
  },

  contributionAtRank(k: number, n: number): number {
    return 1 / (k + n);
  },
};
