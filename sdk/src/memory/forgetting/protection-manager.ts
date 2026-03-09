/**
 * 记忆保护机制
 *
 * 保护重要记忆不被清理，支持手动标记保护。
 */

import { getLogger } from '@logtape/logtape';
import { z } from 'zod';
import type { MemoryEntry, MemoryStatus } from '../../runtime';

const log = getLogger(['memory', 'forgetting', 'protection']);

/** 保护原因 */
export type ProtectionReason =
  | 'manual'           // 手动标记
  | 'high_importance'  // 高重要性
  | 'frequently_used'  // 频繁使用
  | 'recent_access'    // 最近访问
  | 'preference'       // 偏好记忆
  | 'decision'         // 决策记忆
  | 'expired';         // 过期自动解除

/** 保护记录 */
export interface ProtectionRecord {
  /** 记忆 ID */
  memoryId: string;
  /** 保护原因 */
  reason: ProtectionReason;
  /** 保护时间 */
  protectedAt: Date;
  /** 保护者（可选） */
  protectedBy?: string;
  /** 备注信息 */
  note?: string;
  /** 过期时间（可选，届时自动解除保护） */
  expiresAt?: Date;
}

/** 保护管理器配置 Schema */
export const ProtectionManagerConfigSchema = z.object({
  /** 自动保护高重要性记忆的阈值 */
  autoProtectImportanceThreshold: z.number().min(0).max(1).default(0.8),
  /** 自动保护频繁使用记忆的访问次数阈值 */
  autoProtectAccessThreshold: z.number().int().min(1).default(50),
  /** 自动保护最近访问记忆的天数阈值 */
  autoProtectRecentDays: z.number().int().min(1).default(7),
  /** 是否自动保护偏好记忆 */
  autoProtectPreferences: z.boolean().default(true),
  /** 是否自动保护决策记忆 */
  autoProtectDecisions: z.boolean().default(true),
  /** 保护记录最大数量 */
  maxProtectionRecords: z.number().int().min(100).default(10000),
});

export type ProtectionManagerConfig = z.infer<typeof ProtectionManagerConfigSchema>;

/** 保护状态变更事件 */
export interface ProtectionEvent {
  /** 记忆 ID */
  memoryId: string;
  /** 操作类型 */
  action: 'protect' | 'unprotect';
  /** 原因 */
  reason: ProtectionReason;
  /** 时间 */
  timestamp: Date;
}

/** 事件处理器类型 */
export type ProtectionEventHandler = (event: ProtectionEvent) => void | Promise<void>;

/**
 * 记忆保护管理器
 *
 * 负责管理记忆的保护状态，防止重要记忆被清理。
 */
export class ProtectionManager {
  private config: ProtectionManagerConfig;
  /** 保护记录存储 */
  private protections: Map<string, ProtectionRecord> = new Map();
  /** 事件处理器 */
  private eventHandlers: ProtectionEventHandler[] = [];

  constructor(config?: Partial<ProtectionManagerConfig>) {
    this.config = ProtectionManagerConfigSchema.parse(config ?? {});
    log.info('保护管理器已初始化', { config: this.config });
  }

  /**
   * 检查记忆是否受保护
   *
   * @param memoryId - 记忆 ID
   * @returns 是否受保护
   */
  async isProtected(memoryId: string): Promise<boolean> {
    const record = this.protections.get(memoryId);

    if (!record) {
      return false;
    }

    // 检查是否过期
    if (record.expiresAt && record.expiresAt < new Date()) {
      await this.unprotect(memoryId, 'expired');
      return false;
    }

    return true;
  }

  /**
   * 保护记忆
   *
   * @param memoryId - 记忆 ID
   * @param reason - 保护原因
   * @param options - 可选参数
   */
  async protect(
    memoryId: string,
    reason: ProtectionReason,
    options?: {
      protectedBy?: string;
      note?: string;
      expiresIn?: number; // 毫秒
    }
  ): Promise<void> {
    // 检查是否已保护
    const existing = this.protections.get(memoryId);
    if (existing) {
      log.debug('记忆已受保护', { memoryId, existingReason: existing.reason });
      return;
    }

    // 检查保护记录数量限制
    if (this.protections.size >= this.config.maxProtectionRecords) {
      log.warn('保护记录已达上限', {
        maxRecords: this.config.maxProtectionRecords,
      });
      // 清理过期记录
      await this.cleanupExpired();
    }

    const record: ProtectionRecord = {
      memoryId,
      reason,
      protectedAt: new Date(),
      protectedBy: options?.protectedBy,
      note: options?.note,
      expiresAt: options?.expiresIn
        ? new Date(Date.now() + options.expiresIn)
        : undefined,
    };

    this.protections.set(memoryId, record);

    // 触发事件
    await this.emitEvent({
      memoryId,
      action: 'protect',
      reason,
      timestamp: record.protectedAt,
    });

    log.info('记忆已保护', {
      memoryId,
      reason,
      expiresIn: options?.expiresIn,
    });
  }

  /**
   * 取消保护
   *
   * @param memoryId - 记忆 ID
   * @param reason - 解除原因
   */
  async unprotect(memoryId: string, reason: ProtectionReason = 'manual'): Promise<void> {
    const record = this.protections.get(memoryId);
    if (!record) {
      log.debug('记忆未受保护', { memoryId });
      return;
    }

    this.protections.delete(memoryId);

    // 触发事件
    await this.emitEvent({
      memoryId,
      action: 'unprotect',
      reason,
      timestamp: new Date(),
    });

    log.info('记忆已取消保护', { memoryId, reason });
  }

  /**
   * 批量保护记忆
   */
  async protectBatch(
    items: Array<{
      memoryId: string;
      reason: ProtectionReason;
      options?: {
        protectedBy?: string;
        note?: string;
        expiresIn?: number;
      };
    }>
  ): Promise<{ protected: string[]; skipped: string[] }> {
    const protected_: string[] = [];
    const skipped: string[] = [];

    for (const item of items) {
      if (await this.isProtected(item.memoryId)) {
        skipped.push(item.memoryId);
      } else {
        await this.protect(item.memoryId, item.reason, item.options);
        protected_.push(item.memoryId);
      }
    }

    return { protected: protected_, skipped };
  }

  /**
   * 批量取消保护
   */
  async unprotectBatch(memoryIds: string[]): Promise<{ unprotected: string[]; notFound: string[] }> {
    const unprotected: string[] = [];
    const notFound: string[] = [];

    for (const id of memoryIds) {
      if (this.protections.has(id)) {
        await this.unprotect(id);
        unprotected.push(id);
      } else {
        notFound.push(id);
      }
    }

    return { unprotected, notFound };
  }

  /**
   * 根据记忆条目自动判断是否需要保护
   *
   * @param entry - 记忆条目
   * @returns 是否被自动保护
   */
  async autoProtect(entry: MemoryEntry): Promise<boolean> {
    // 已受保护，跳过
    if (await this.isProtected(entry.id)) {
      return false;
    }

    let reason: ProtectionReason | null = null;

    // 检查高重要性
    if (entry.importance >= this.config.autoProtectImportanceThreshold) {
      reason = 'high_importance';
    }
    // 检查频繁使用
    else if (entry.accessCount >= this.config.autoProtectAccessThreshold) {
      reason = 'frequently_used';
    }
    // 检查最近访问
    else {
      const recentCutoff = new Date(
        Date.now() - this.config.autoProtectRecentDays * 24 * 60 * 60 * 1000
      );
      if (entry.accessedAt > recentCutoff) {
        reason = 'recent_access';
      }
    }

    // 检查记忆类型
    if (!reason) {
      if (this.config.autoProtectPreferences && entry.type === 'preference') {
        reason = 'preference';
      } else if (this.config.autoProtectDecisions && entry.type === 'decision') {
        reason = 'decision';
      }
    }

    if (reason) {
      await this.protect(entry.id, reason, { note: '自动保护' });
      return true;
    }

    return false;
  }

  /**
   * 获取保护记录
   */
  getProtectionRecord(memoryId: string): ProtectionRecord | undefined {
    return this.protections.get(memoryId);
  }

  /**
   * 获取所有受保护的记忆 ID
   */
  getProtectedIds(): string[] {
    return Array.from(this.protections.keys());
  }

  /**
   * 获取保护统计信息
   */
  getStats(): {
    totalProtected: number;
    byReason: Record<ProtectionReason, number>;
  } {
    const byReason: Record<ProtectionReason, number> = {
      manual: 0,
      high_importance: 0,
      frequently_used: 0,
      recent_access: 0,
      preference: 0,
      decision: 0,
      expired: 0,
    };

    for (const record of this.protections.values()) {
      byReason[record.reason]++;
    }

    return {
      totalProtected: this.protections.size,
      byReason,
    };
  }

  /**
   * 获取配置
   */
  getConfig(): ProtectionManagerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ProtectionManagerConfig>): void {
    this.config = ProtectionManagerConfigSchema.parse({
      ...this.config,
      ...config,
    });
    log.info('保护管理器配置已更新', { config: this.config });
  }

  /**
   * 订阅保护事件
   */
  onProtectionChange(handler: ProtectionEventHandler): () => void {
    this.eventHandlers.push(handler);
    // 返回取消订阅函数
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index >= 0) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * 导出保护记录
   */
  exportRecords(): ProtectionRecord[] {
    return Array.from(this.protections.values());
  }

  /**
   * 导入保护记录
   */
  importRecords(records: ProtectionRecord[]): { imported: number; skipped: number } {
    let imported = 0;
    let skipped = 0;

    for (const record of records) {
      if (this.protections.has(record.memoryId)) {
        skipped++;
      } else {
        this.protections.set(record.memoryId, record);
        imported++;
      }
    }

    log.info('保护记录导入完成', { imported, skipped });
    return { imported, skipped };
  }

  /**
   * 清理过期保护记录
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();
    const expiredIds: string[] = [];

    for (const [id, record] of this.protections) {
      if (record.expiresAt && record.expiresAt < now) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      await this.unprotect(id, 'manual'); // 使用 manual 作为过期清理的原因
    }

    if (expiredIds.length > 0) {
      log.info('过期保护记录已清理', { count: expiredIds.length });
    }

    return expiredIds.length;
  }

  /**
   * 触发事件
   */
  private async emitEvent(event: ProtectionEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (e) {
        log.error('事件处理器执行失败', {
          error: String(e),
          event,
        });
      }
    }
  }
}

/**
 * 便捷函数：创建保护管理器
 */
export function createProtectionManager(
  config?: Partial<ProtectionManagerConfig>
): ProtectionManager {
  return new ProtectionManager(config);
}

/**
 * 便捷函数：检查记忆状态是否为受保护
 */
export function isStatusProtected(status: MemoryStatus): boolean {
  return status === 'protected';
}
