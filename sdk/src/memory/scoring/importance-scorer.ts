/**
 * 重要性评分算法
 *
 * 基于访问频率、时间衰减和记忆类型计算记忆重要性。
 * 属于 SDK 高级封装，提供增强的评分能力。
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import type { MemoryEntry, MemoryType } from '../../runtime';

const log = getLogger(['sdk', 'memory', 'importance-scorer']);

/** 重要性评分器配置 */
export interface ImportanceScorerConfig {
  /** 新记忆的默认重要性 */
  defaultImportance: number;
  /** 访问频率权重 (0-1) */
  accessFrequencyWeight: number;
  /** 时间衰减权重 (0-1) */
  timeDecayWeight: number;
  /** 类型权重配置 */
  typeWeights: Partial<Record<MemoryType, number>>;
  /** 时间衰减半衰期（天） */
  halfLifeDays: number;
  /** 最大访问次数上限（用于归一化） */
  maxAccessCount: number;
  /** 最小重要性分数 */
  minImportance: number;
  /** 最大重要性分数 */
  maxImportance: number;
}

/** 评分因素分解 */
export interface ImportanceFactors {
  /** 类型分数 */
  typeScore: number;
  /** 访问频率分数 */
  accessScore: number;
  /** 时间衰减分数 */
  decayScore: number;
  /** 加权综合分数 */
  weightedScore: number;
}

/** 评分权重配置 */
export interface ScoringWeights {
  /** 类型权重 */
  type: number;
  /** 访问频率权重 */
  access: number;
  /** 时间衰减权重 */
  decay: number;
}

/** 配置 Schema */
export const ImportanceScorerConfigSchema = z.object({
  defaultImportance: z.number().min(0).max(1).default(0.5),
  accessFrequencyWeight: z.number().min(0).max(1).default(0.4),
  timeDecayWeight: z.number().min(0).max(1).default(0.3),
  typeWeights: z.record(z.string(), z.number().min(0).max(1)).default({
    preference: 0.9,
    decision: 0.85,
    entity: 0.8,
    fact: 0.7,
    summary: 0.65,
    document: 0.5,
    conversation: 0.4,
    other: 0.3,
  }),
  halfLifeDays: z.number().min(1).default(30),
  maxAccessCount: z.number().min(1).default(100),
  minImportance: z.number().min(0).max(1).default(0.1),
  maxImportance: z.number().min(0).max(1).default(1.0),
});

/** 默认配置 */
const DEFAULT_CONFIG: ImportanceScorerConfig = {
  defaultImportance: 0.5,
  accessFrequencyWeight: 0.4,
  timeDecayWeight: 0.3,
  typeWeights: {
    preference: 0.9, // 偏好最重要
    decision: 0.85, // 决策次之
    entity: 0.8, // 实体信息
    fact: 0.7, // 事实
    summary: 0.65, // 摘要
    document: 0.5, // 文档
    conversation: 0.4, // 对话
    other: 0.3, // 其他
  },
  halfLifeDays: 30, // 30 天半衰期
  maxAccessCount: 100,
  minImportance: 0.1,
  maxImportance: 1.0,
};

/**
 * 重要性评分器
 *
 * 计算记忆的重要性分数，考虑以下因素：
 * 1. 访问频率：被频繁访问的记忆更重要
 * 2. 时间衰减：旧记忆重要性逐渐降低
 * 3. 类型权重：不同类型有不同基础重要性
 */
export class ImportanceScorer {
  private config: ImportanceScorerConfig;

  constructor(config?: Partial<ImportanceScorerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 计算记忆的重要性分数
   *
   * @param entry - 记忆条目
   * @returns 重要性分数 (0-1)
   */
  calculate(entry: MemoryEntry): number {
    const factors = this.calculateFactors(entry);
    return factors.weightedScore;
  }

  /**
   * 计算并返回详细的评分因素分解
   *
   * @param entry - 记忆条目
   * @returns 评分因素分解
   */
  calculateFactors(entry: MemoryEntry): ImportanceFactors {
    // 1. 类型权重
    const typeScore = this.getTypeScore(entry.type);

    // 2. 访问频率分数
    const accessScore = this.getAccessScore(entry.accessCount);

    // 3. 时间衰减分数
    const decayScore = this.getDecayScore(entry.createdAt, entry.accessedAt);

    // 计算类型权重剩余比例
    const typeWeight = 1 - this.config.accessFrequencyWeight - this.config.timeDecayWeight;

    // 综合计算
    const baseScore =
      typeScore * typeWeight +
      accessScore * this.config.accessFrequencyWeight +
      decayScore * this.config.timeDecayWeight;

    // 归一化到 [minImportance, maxImportance]
    const weightedScore = this.normalize(
      baseScore,
      this.config.minImportance,
      this.config.maxImportance
    );

    log.debug('重要性评分计算完成', {
      id: entry.id,
      type: entry.type,
      accessCount: entry.accessCount,
      typeScore,
      accessScore,
      decayScore,
      finalScore: weightedScore,
    });

    return {
      typeScore,
      accessScore,
      decayScore,
      weightedScore,
    };
  }

  /**
   * 批量计算重要性分数
   */
  calculateBatch(entries: MemoryEntry[]): Map<string, number> {
    const scores = new Map<string, number>();
    for (const entry of entries) {
      scores.set(entry.id, this.calculate(entry));
    }
    return scores;
  }

  /**
   * 批量计算并返回详细因素分解
   */
  calculateFactorsBatch(entries: MemoryEntry[]): Map<string, ImportanceFactors> {
    const factors = new Map<string, ImportanceFactors>();
    for (const entry of entries) {
      factors.set(entry.id, this.calculateFactors(entry));
    }
    return factors;
  }

  /**
   * 更新记忆重要性（访问后调用）
   *
   * @param entry - 记忆条目
   * @param currentImportance - 当前重要性
   * @returns 更新后的重要性
   */
  updateAfterAccess(entry: MemoryEntry, currentImportance: number): number {
    // 访问后重要性提升
    const accessBonus = 0.05 * Math.min(entry.accessCount / 10, 1);
    const newImportance = Math.min(currentImportance + accessBonus, this.config.maxImportance);

    log.debug('访问后更新重要性', {
      id: entry.id,
      oldImportance: currentImportance,
      newImportance,
      accessCount: entry.accessCount,
    });

    return newImportance;
  }

  /**
   * 根据条件筛选高重要性记忆
   *
   * @param entries - 记忆条目列表
   * @param threshold - 重要性阈值
   * @returns 高重要性记忆列表
   */
  filterHighImportance(entries: MemoryEntry[], threshold: number = 0.7): MemoryEntry[] {
    return entries.filter(entry => this.calculate(entry) >= threshold);
  }

  /**
   * 按重要性排序记忆
   *
   * @param entries - 记忆条目列表
   * @param ascending - 是否升序（默认降序）
   * @returns 排序后的记忆列表
   */
  sortByImportance(entries: MemoryEntry[], ascending: boolean = false): MemoryEntry[] {
    const scores = this.calculateBatch(entries);
    const sorted = [...entries].sort((a, b) => {
      const diff = (scores.get(a.id) ?? 0) - (scores.get(b.id) ?? 0);
      return ascending ? diff : -diff;
    });
    return sorted;
  }

  /**
   * 获取评分权重配置
   */
  getWeights(): ScoringWeights {
    return {
      type: 1 - this.config.accessFrequencyWeight - this.config.timeDecayWeight,
      access: this.config.accessFrequencyWeight,
      decay: this.config.timeDecayWeight,
    };
  }

  /**
   * 获取类型分数
   */
  private getTypeScore(type: MemoryType): number {
    return this.config.typeWeights[type] ?? 0.5;
  }

  /**
   * 获取访问频率分数
   *
   * 使用对数函数归一化访问次数，避免过度偏向高频访问
   */
  private getAccessScore(accessCount: number): number {
    if (accessCount <= 0) {
      return this.config.defaultImportance;
    }

    // 对数归一化：log(1 + count) / log(1 + maxCount)
    const normalized =
      Math.log(1 + accessCount) / Math.log(1 + this.config.maxAccessCount);

    return Math.min(normalized, 1.0);
  }

  /**
   * 获取时间衰减分数
   *
   * 基于 Ebbinghaus 遗忘曲线的变体：
   * - 新记忆保持较高分数
   * - 随时间推移逐渐衰减
   * - 最近访问的记忆获得额外分数
   */
  private getDecayScore(createdAt: Date, accessedAt: Date): number {
    const now = Date.now();
    const createdTime = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
    const accessedTime = accessedAt instanceof Date ? accessedAt.getTime() : new Date(accessedAt).getTime();

    // 计算创建至今的天数
    const ageDays = (now - createdTime) / (1000 * 60 * 60 * 24);

    // 计算最后访问至今的天数
    const idleDays = (now - accessedTime) / (1000 * 60 * 60 * 24);

    // 时间衰减（Ebbinghaus 变体）
    // R = e^(-t/S)，其中 S 是稳定性，这里用半衰期近似
    const decayFactor = Math.exp(-ageDays / (this.config.halfLifeDays * 1.44));

    // 最近访问加成：最近访问的记忆衰减更慢
    const recencyBonus = Math.exp(-idleDays / (this.config.halfLifeDays * 0.5)) * 0.2;

    // 最终分数
    const score = decayFactor + recencyBonus;

    return Math.min(score, 1.0);
  }

  /**
   * 归一化分数到指定范围
   */
  private normalize(score: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, score));
  }

  /**
   * 获取配置
   */
  getConfig(): ImportanceScorerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ImportanceScorerConfig>): void {
    this.config = { ...this.config, ...config };
    log.debug('重要性评分器配置已更新', { config: this.config });
  }
}

/**
 * 便捷函数：计算单条记忆的重要性
 */
export function calculateImportance(
  entry: MemoryEntry,
  config?: Partial<ImportanceScorerConfig>
): number {
  const scorer = new ImportanceScorer(config);
  return scorer.calculate(entry);
}

/**
 * 便捷函数：获取新记忆的默认重要性
 */
export function getDefaultImportance(): number {
  return DEFAULT_CONFIG.defaultImportance;
}
