/**
 * 时间衰减评分
 *
 * 基于 Ebbinghaus 遗忘曲线实现时间衰减评分。
 * 公式: R = e^(-t/S)
 */

import { getLogger } from '@logtape/logtape';
import type { MemoryEntry } from '../../runtime';

const log = getLogger(['sdk', 'memory', 'temporal-decay']);

/** 时间衰减配置 */
export interface TemporalDecayConfig {
  /** 半衰期（天），默认 30 天 */
  halfLifeDays: number;
  /** 是否考虑访问次数 */
  considerAccessCount: boolean;
  /** 访问次数权重 */
  accessCountWeight: number;
  /** 最小衰减因子（确保旧记忆仍有最小权重） */
  minDecayFactor: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: TemporalDecayConfig = {
  halfLifeDays: 30,
  considerAccessCount: true,
  accessCountWeight: 0.1,
  minDecayFactor: 0.1,
};

/**
 * 时间衰减评分器
 *
 * 基于 Ebbinghaus 遗忘曲线计算记忆的时间衰减分数。
 */
export class TemporalDecayScorer {
  private config: TemporalDecayConfig;
  private stabilityConstant: number;

  constructor(config?: Partial<TemporalDecayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stabilityConstant = this.config.halfLifeDays / Math.LN2;
  }

  /**
   * 计算记忆的时间衰减因子
   */
  calculateDecayFactor(entry: MemoryEntry): number {
    const now = Date.now();
    const accessedAt = entry.accessedAt instanceof Date
      ? entry.accessedAt.getTime()
      : new Date(entry.accessedAt).getTime();

    const daysSinceAccess = (now - accessedAt) / (1000 * 60 * 60 * 24);

    const stability = entry.stability ?? this.stabilityConstant;
    const retention = Math.exp(-daysSinceAccess / stability);

    const decayFactor = Math.max(retention, this.config.minDecayFactor);

    return decayFactor;
  }

  /**
   * 计算访问次数加成
   */
  calculateAccessBonus(accessCount: number): number {
    if (!this.config.considerAccessCount || accessCount <= 0) {
      return 1;
    }
    return 1 + this.config.accessCountWeight * Math.log10(accessCount + 1);
  }

  /**
   * 计算完整的时间衰减分数
   */
  calculateScore(entry: MemoryEntry, baseScore: number): number {
    const decayFactor = this.calculateDecayFactor(entry);
    const accessBonus = this.calculateAccessBonus(entry.accessCount);

    const finalScore = baseScore * decayFactor * accessBonus;

    log.debug('时间衰减计算', {
      id: entry.id,
      baseScore,
      decayFactor,
      accessBonus,
      finalScore,
    });

    return finalScore;
  }

  /**
   * 批量计算衰减分数并排序
   */
  scoreAndSort(
    entries: MemoryEntry[],
    baseScores: number[]
  ): Array<{ entry: MemoryEntry; score: number }> {
    if (entries.length !== baseScores.length) {
      throw new Error('entries 和 baseScores 长度必须相同');
    }

    const results = entries.map((entry, index) => ({
      entry,
      score: this.calculateScore(entry, baseScores[index]),
    }));

    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * 更新记忆稳定性
   */
  updateStability(currentStability: number, wasRecalled: boolean): number {
    if (wasRecalled) {
      return currentStability * 2.5;
    } else {
      return currentStability * 0.5;
    }
  }

  getConfig(): TemporalDecayConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<TemporalDecayConfig>): void {
    this.config = { ...this.config, ...config };
    this.stabilityConstant = this.config.halfLifeDays / Math.LN2;
  }
}

/**
 * 遗忘曲线计算工具函数
 */
export const forgettingCurve = {
  retention(days: number, halfLifeDays: number = 30): number {
    const S = halfLifeDays / Math.LN2;
    return Math.exp(-days / S);
  },

  daysUntil(targetRetention: number, halfLifeDays: number = 30): number {
    const S = halfLifeDays / Math.LN2;
    return -S * Math.log(targetRetention);
  },

  halfLife(stability: number): number {
    return stability * Math.LN2;
  },
};
