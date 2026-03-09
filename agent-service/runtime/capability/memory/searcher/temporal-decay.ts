/**
 * 时间衰减评分
 *
 * 基于 Ebbinghaus 遗忘曲线实现时间衰减评分。
 * 公式: R = e^(-t/S)
 * 其中:
 * - R: 记忆保持率 (retention)
 * - t: 距离上次访问的时间
 * - S: 稳定性参数（与半衰期相关）
 */

import { getLogger } from '@logtape/logtape';
import type { MemoryEntry } from '../../../../types/memory';

const log = getLogger(['memory', 'temporal-decay']);

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
 * 衰减后的分数 = 基础分数 * 衰减因子
 */
export class TemporalDecayScorer {
  private config: TemporalDecayConfig;
  /** 稳定性常数 S（基于半衰期计算） */
  private stabilityConstant: number;

  constructor(config?: Partial<TemporalDecayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // S = halfLife / ln(2)，使得在半衰期时 R = 0.5
    this.stabilityConstant = this.config.halfLifeDays / Math.LN2;
  }

  /**
   * 计算记忆的时间衰减因子
   * @param entry - 记忆条目
   * @returns 衰减因子 (0-1]
   */
  calculateDecayFactor(entry: MemoryEntry): number {
    const now = Date.now();
    const accessedAt = entry.accessedAt instanceof Date
      ? entry.accessedAt.getTime()
      : new Date(entry.accessedAt).getTime();

    // 计算距离上次访问的天数
    const daysSinceAccess = (now - accessedAt) / (1000 * 60 * 60 * 24);

    // Ebbinghaus 公式: R = e^(-t/S)
    // 使用记忆自身的 stability 如果可用，否则使用默认稳定性
    const stability = entry.stability ?? this.stabilityConstant;
    const retention = Math.exp(-daysSinceAccess / stability);

    // 应用最小衰减因子
    const decayFactor = Math.max(retention, this.config.minDecayFactor);

    return decayFactor;
  }

  /**
   * 计算访问次数加成
   * @param accessCount - 访问次数
   * @returns 加成因子 (> 1 表示增强)
   */
  calculateAccessBonus(accessCount: number): number {
    if (!this.config.considerAccessCount || accessCount <= 0) {
      return 1;
    }
    // 使用对数函数使访问次数的影响逐渐饱和
    return 1 + this.config.accessCountWeight * Math.log10(accessCount + 1);
  }

  /**
   * 计算完整的时间衰减分数
   * @param entry - 记忆条目
   * @param baseScore - 基础分数（如相似度分数）
   * @returns 衰减后的分数
   */
  calculateScore(entry: MemoryEntry, baseScore: number): number {
    const decayFactor = this.calculateDecayFactor(entry);
    const accessBonus = this.calculateAccessBonus(entry.accessCount);

    // 最终分数 = 基础分数 * 衰减因子 * 访问加成
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
   * @param entries - 记忆条目数组
   * @param baseScores - 对应的基础分数数组
   * @returns 排序后的结果数组（按衰减分数降序）
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

    // 按分数降序排序
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * 更新记忆稳定性
   * 基于间隔重复理论：成功回忆后稳定性增加
   *
   * @param currentStability - 当前稳定性
   * @param wasRecalled - 是否成功回忆
   * @returns 更新后的稳定性
   */
  updateStability(currentStability: number, wasRecalled: boolean): number {
    if (wasRecalled) {
      // 成功回忆：稳定性增加（使用 SM-2 算法启发式）
      return currentStability * 2.5;
    } else {
      // 回忆失败：稳定性降低
      return currentStability * 0.5;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): TemporalDecayConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TemporalDecayConfig>): void {
    this.config = { ...this.config, ...config };
    this.stabilityConstant = this.config.halfLifeDays / Math.LN2;
    log.debug('时间衰减配置已更新', { config: this.config });
  }
}

/**
 * 遗忘曲线计算工具函数
 */
export const forgettingCurve = {
  /**
   * 计算指定天数后的保持率
   * @param days - 天数
   * @param halfLifeDays - 半衰期（天）
   * @returns 保持率 (0-1]
   */
  retention(days: number, halfLifeDays: number = 30): number {
    const S = halfLifeDays / Math.LN2;
    return Math.exp(-days / S);
  },

  /**
   * 计算达到指定保持率所需的天数
   * @param targetRetention - 目标保持率
   * @param halfLifeDays - 半衰期（天）
   * @returns 天数
   */
  daysUntil(targetRetention: number, halfLifeDays: number = 30): number {
    const S = halfLifeDays / Math.LN2;
    return -S * Math.log(targetRetention);
  },

  /**
   * 计算半衰期
   * @param stability - 稳定性参数
   * @returns 半衰期（天）
   */
  halfLife(stability: number): number {
    return stability * Math.LN2;
  },
};
