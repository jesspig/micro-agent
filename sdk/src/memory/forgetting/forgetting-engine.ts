/**
 * 遗忘引擎
 *
 * 基于艾宾浩斯遗忘曲线计算记忆保持率，执行清理。
 * 公式: R = e^(-t/S)
 * - R: 记忆保持率 (retention, 0-1)
 * - t: 距上次访问时间（天）
 * - S: 记忆稳定性（初始值为 1.0）
 */

import { getLogger } from '@logtape/logtape';
import { z } from 'zod';
import type { MemoryEntry } from '../../runtime';
import { forgettingCurve } from '../../runtime';

const log = getLogger(['memory', 'forgetting', 'engine']);

/** 遗忘引擎配置 Schema */
export const ForgettingEngineConfigSchema = z.object({
  /** 保持率阈值，低于此值的记忆将被清理 */
  retentionThreshold: z.number().min(0).max(1).default(0.1),
  /** 最小存活天数（保护期） */
  minAgeDays: z.number().int().min(0).default(7),
  /** 最大存活天数（强制清理） */
  maxAgeDays: z.number().int().min(1).default(365),
  /** 批量处理大小 */
  batchSize: z.number().int().min(1).max(1000).default(100),
  /** 默认半衰期（天） */
  defaultHalfLifeDays: z.number().min(1).default(30),
  /** 是否考虑重要性分数 */
  considerImportance: z.boolean().default(true),
  /** 重要性权重（用于调整保持率阈值） */
  importanceWeight: z.number().min(0).max(1).default(0.3),
});

export type ForgettingEngineConfig = z.infer<typeof ForgettingEngineConfigSchema>;

/** 记忆清理候选 */
export interface ForgettingCandidate {
  /** 记忆条目 */
  entry: MemoryEntry;
  /** 保持率 */
  retention: number;
  /** 年龄（天） */
  ageDays: number;
  /** 是否在保护期 */
  inProtectionPeriod: boolean;
  /** 是否超过最大存活期 */
  exceedsMaxAge: boolean;
  /** 清理原因 */
  reason: 'low_retention' | 'exceeds_max_age' | 'expired';
}

/** 清理结果 */
export interface ForgettingResult {
  /** 清理的记忆 ID 列表 */
  deletedIds: string[];
  /** 保留的记忆 ID 列表 */
  preservedIds: string[];
  /** 错误列表 */
  errors: Array<{ id: string; error: string }>;
  /** 清理统计 */
  stats: {
    totalCandidates: number;
    deletedCount: number;
    preservedCount: number;
    errorCount: number;
  };
}

/** 记忆存储接口（简化版） */
export interface MemoryStoreAdapter {
  /** 获取所有记忆 */
  getAll(): Promise<MemoryEntry[]>;
  /** 删除记忆 */
  delete(id: string): Promise<void>;
  /** 批量删除 */
  deleteBatch(ids: string[]): Promise<void>;
}

/** 保护管理器接口 */
export interface ProtectionManagerAdapter {
  /** 检查记忆是否受保护 */
  isProtected(id: string): Promise<boolean>;
}

/**
 * 遗忘引擎
 *
 * 负责计算记忆的保持率，并识别需要清理的记忆。
 */
export class ForgettingEngine {
  private config: ForgettingEngineConfig;
  private store: MemoryStoreAdapter;
  private protectionManager?: ProtectionManagerAdapter;

  constructor(
    store: MemoryStoreAdapter,
    config?: Partial<ForgettingEngineConfig>,
    protectionManager?: ProtectionManagerAdapter
  ) {
    this.config = ForgettingEngineConfigSchema.parse(config ?? {});
    this.store = store;
    this.protectionManager = protectionManager;
    log.info('遗忘引擎已初始化', { config: this.config });
  }

  /**
   * 计算单条记忆的保持率
   *
   * @param entry - 记忆条目
   * @returns 保持率 (0-1)
   */
  calculateRetention(entry: MemoryEntry): number {
    const now = Date.now();
    const accessedAt = entry.accessedAt instanceof Date
      ? entry.accessedAt.getTime()
      : new Date(entry.accessedAt).getTime();

    // 计算距离上次访问的天数
    const daysSinceAccess = (now - accessedAt) / (1000 * 60 * 60 * 24);

    // 获取稳定性（转换为半衰期）
    const stability = entry.stability ?? 1.0;
    const halfLifeDays = stability * this.config.defaultHalfLifeDays;

    // 使用艾宾浩斯公式计算保持率
    const retention = forgettingCurve.retention(daysSinceAccess, halfLifeDays);

    // 如果考虑重要性，调整保持率
    if (this.config.considerImportance && entry.importance > 0) {
      // 重要记忆的保持率阈值更低（更难被清理）
      const importanceBoost = entry.importance * this.config.importanceWeight;
      return Math.min(retention + importanceBoost, 1.0);
    }

    return retention;
  }

  /**
   * 获取清理候选列表
   *
   * @param entries - 记忆条目列表（可选，不传则从存储获取）
   * @returns 清理候选列表
   */
  async getCandidates(entries?: MemoryEntry[]): Promise<ForgettingCandidate[]> {
    const allEntries = entries ?? await this.store.getAll();
    const candidates: ForgettingCandidate[] = [];

    const now = Date.now();

    for (const entry of allEntries) {
      // 跳过已删除或已归档的记忆
      if (entry.status === 'deleted' || entry.status === 'archived') {
        continue;
      }

      // 检查是否受保护
      if (this.protectionManager && await this.protectionManager.isProtected(entry.id)) {
        continue;
      }

      const createdAt = entry.createdAt instanceof Date
        ? entry.createdAt.getTime()
        : new Date(entry.createdAt).getTime();

      const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
      const retention = this.calculateRetention(entry);

      const inProtectionPeriod = ageDays < this.config.minAgeDays;
      const exceedsMaxAge = ageDays > this.config.maxAgeDays;

      // 检查是否检查元数据中的过期时间
      const isExpired = entry.metadata?.expiresAt
        ? new Date(entry.metadata.expiresAt) < new Date()
        : false;

      // 确定是否为清理候选
      const isCandidate = !inProtectionPeriod && (
        exceedsMaxAge ||
        isExpired ||
        retention < this.config.retentionThreshold
      );

      if (isCandidate) {
        let reason: ForgettingCandidate['reason'];
        if (exceedsMaxAge) {
          reason = 'exceeds_max_age';
        } else if (isExpired) {
          reason = 'expired';
        } else {
          reason = 'low_retention';
        }

        candidates.push({
          entry,
          retention,
          ageDays,
          inProtectionPeriod,
          exceedsMaxAge,
          reason,
        });
      }
    }

    // 按保持率升序排序（优先清理保持率最低的）
    candidates.sort((a, b) => a.retention - b.retention);

    log.debug('清理候选分析完成', {
      totalEntries: allEntries.length,
      candidateCount: candidates.length,
    });

    return candidates;
  }

  /**
   * 执行清理
   *
   * @param dryRun - 是否为试运行（不实际删除）
   * @returns 清理结果
   */
  async execute(dryRun: boolean = false): Promise<ForgettingResult> {
    const candidates = await this.getCandidates();

    const result: ForgettingResult = {
      deletedIds: [],
      preservedIds: [],
      errors: [],
      stats: {
        totalCandidates: candidates.length,
        deletedCount: 0,
        preservedCount: 0,
        errorCount: 0,
      },
    };

    if (candidates.length === 0) {
      log.info('无需清理的记忆');
      return result;
    }

    // 批量处理
    const batches = this.chunkArray(candidates, this.config.batchSize);

    for (const batch of batches) {
      const idsToDelete: string[] = [];

      for (const candidate of batch) {
        try {
          if (dryRun) {
            result.deletedIds.push(candidate.entry.id);
          } else {
            idsToDelete.push(candidate.entry.id);
          }

          log.debug('标记清理', {
            id: candidate.entry.id,
            retention: candidate.retention.toFixed(3),
            ageDays: candidate.ageDays.toFixed(1),
            reason: candidate.reason,
          });
        } catch (e) {
          result.errors.push({
            id: candidate.entry.id,
            error: String(e),
          });
        }
      }

      // 批量删除
      if (!dryRun && idsToDelete.length > 0) {
        try {
          await this.store.deleteBatch(idsToDelete);
          result.deletedIds.push(...idsToDelete);
        } catch (e) {
          // 批量失败，尝试单个删除
          for (const id of idsToDelete) {
            try {
              await this.store.delete(id);
              result.deletedIds.push(id);
            } catch (singleError) {
              result.errors.push({ id, error: String(singleError) });
            }
          }
        }
      }
    }

    result.stats.deletedCount = result.deletedIds.length;
    result.stats.errorCount = result.errors.length;

    log.info('遗忘清理完成', {
      dryRun,
      ...result.stats,
    });

    return result;
  }

  /**
   * 试运行清理（不实际删除）
   */
  async dryRun(): Promise<ForgettingResult> {
    return this.execute(true);
  }

  /**
   * 获取配置
   */
  getConfig(): ForgettingEngineConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ForgettingEngineConfig>): void {
    this.config = ForgettingEngineConfigSchema.parse({
      ...this.config,
      ...config,
    });
    log.info('遗忘引擎配置已更新', { config: this.config });
  }

  /**
   * 设置保护管理器
   */
  setProtectionManager(manager: ProtectionManagerAdapter): void {
    this.protectionManager = manager;
  }

  /**
   * 分块数组
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

/**
 * 便捷函数：创建遗忘引擎
 */
export function createForgettingEngine(
  store: MemoryStoreAdapter,
  config?: Partial<ForgettingEngineConfig>,
  protectionManager?: ProtectionManagerAdapter
): ForgettingEngine {
  return new ForgettingEngine(store, config, protectionManager);
}
