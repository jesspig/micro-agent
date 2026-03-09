/**
 * 偏好处理器
 *
 * 处理检测到的偏好，存储为长期记忆。
 * 支持自动去重相似偏好、更新现有偏好而非重复存储。
 */

import { z } from 'zod';
import { getLogger } from '@logtape/logtape';
import type { MemoryEntry, MemoryType } from '../../runtime';
import type { PreferenceDetectionResult, PreferenceType } from '../classifiers/preference-classifier';

const log = getLogger(['sdk', 'memory', 'preference-handler']);

/** 存储适配器接口 */
export interface PreferenceStoreAdapter {
  store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'>): Promise<string>;
  delete(id: string): Promise<void>;
  search(query: string, options?: {
    limit?: number;
    filter?: { types?: string[] };
  }): Promise<Array<{ entry: MemoryEntry; score: number }>>;
}

/** 偏好记录 */
export interface PreferenceRecord {
  /** 偏好 ID */
  id: string;
  /** 偏好类型 */
  type: PreferenceType;
  /** 偏好主题 */
  subject: string;
  /** 偏好内容 */
  content: string;
  /** 置信度 */
  confidence: number;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 访问次数 */
  accessCount: number;
  /** 来源消息 */
  sourceMessage?: string;
  /** 会话键 */
  sessionKey?: string;
}

/** 偏好处理器配置 */
export const PreferenceHandlerConfigSchema = z.object({
  /** 最小置信度阈值 */
  minConfidence: z.number().min(0).max(1).default(0.7),
  /** 相似度阈值（用于去重） */
  similarityThreshold: z.number().min(0).max(1).default(0.85),
  /** 是否启用自动去重 */
  enableDedup: z.boolean().default(true),
  /** 最大存储偏好数 */
  maxPreferences: z.number().min(1).default(1000),
  /** 偏好过期天数 */
  expiryDays: z.number().min(0).default(365),
});

export type PreferenceHandlerConfig = z.infer<typeof PreferenceHandlerConfigSchema>;

/** 处理结果 */
export interface HandleResult {
  /** 是否成功处理 */
  success: boolean;
  /** 操作类型 */
  action: 'created' | 'updated' | 'skipped' | 'error';
  /** 偏好记录 */
  record?: PreferenceRecord;
  /** 错误信息 */
  error?: string;
  /** 去重信息 */
  dedupInfo?: {
    similarTo: string;
    similarity: number;
  };
}

/** 批量处理结果 */
export interface BatchHandleResult {
  results: HandleResult[];
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
}

/**
 * 偏好处理器
 *
 * 职责：
 * - 处理检测到的偏好并存储
 * - 自动去重相似偏好
 * - 更新现有偏好
 * - 管理偏好生命周期
 */
export class PreferenceHandler {
  private config: PreferenceHandlerConfig;
  private store: PreferenceStoreAdapter;
  private preferenceCache: Map<string, PreferenceRecord> = new Map();
  private initialized = false;

  constructor(store: PreferenceStoreAdapter, config?: Partial<PreferenceHandlerConfig>) {
    this.store = store;
    this.config = PreferenceHandlerConfigSchema.parse(config ?? {});
  }

  /**
   * 初始化处理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 加载现有偏好到缓存
    await this.loadPreferenceCache();

    this.initialized = true;
    log.info('偏好处理器已初始化', {
      cachedCount: this.preferenceCache.size,
      minConfidence: this.config.minConfidence,
    });
  }

  /**
   * 处理单个偏好检测结果
   *
   * @param detection - 偏好检测结果
   * @param context - 上下文信息
   * @returns 处理结果
   */
  async handle(
    detection: PreferenceDetectionResult,
    context?: {
      sessionKey?: string;
      sourceMessage?: string;
    }
  ): Promise<HandleResult> {
    await this.ensureInitialized();

    // 验证检测结果
    if (!detection.detected) {
      return {
        success: false,
        action: 'skipped',
        error: '未检测到偏好',
      };
    }

    // 检查置信度
    if (detection.confidence < this.config.minConfidence) {
      log.debug('偏好置信度过低，跳过', {
        confidence: detection.confidence,
        threshold: this.config.minConfidence,
      });
      return {
        success: false,
        action: 'skipped',
        error: `置信度 ${detection.confidence.toFixed(2)} 低于阈值 ${this.config.minConfidence}`,
      };
    }

    // 去重检查
    if (this.config.enableDedup) {
      const similar = this.findSimilarPreference(detection);
      if (similar) {
        // 更新现有偏好
        return this.updateExistingPreference(similar, detection, context);
      }
    }

    // 创建新偏好
    return this.createPreference(detection, context);
  }

  /**
   * 批量处理偏好
   *
   * @param detections - 偏好检测结果列表
   * @param context - 上下文信息
   * @returns 批量处理结果
   */
  async handleBatch(
    detections: PreferenceDetectionResult[],
    context?: {
      sessionKey?: string;
      sourceMessages?: string[];
    }
  ): Promise<BatchHandleResult> {
    const results: HandleResult[] = [];
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < detections.length; i++) {
      const detection = detections[i];
      const sourceMessage = context?.sourceMessages?.[i];

      const result = await this.handle(detection, {
        ...context,
        sourceMessage,
      });

      results.push(result);

      switch (result.action) {
        case 'created':
          createdCount++;
          break;
        case 'updated':
          updatedCount++;
          break;
        case 'skipped':
          skippedCount++;
          break;
        case 'error':
          errorCount++;
          break;
      }
    }

    log.info('批量偏好处理完成', {
      total: detections.length,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      error: errorCount,
    });

    return {
      results,
      createdCount,
      updatedCount,
      skippedCount,
      errorCount,
    };
  }

  /**
   * 检索用户偏好
   *
   * @param types - 偏好类型过滤
   * @param limit - 结果数量限制
   * @returns 偏好记录列表
   */
  async getPreferences(
    types?: PreferenceType[],
    limit?: number
  ): Promise<PreferenceRecord[]> {
    await this.ensureInitialized();

    let preferences = Array.from(this.preferenceCache.values());

    // 类型过滤
    if (types && types.length > 0) {
      preferences = preferences.filter(p => types.includes(p.type));
    }

    // 按置信度和访问次数排序
    preferences.sort((a, b) => {
      const scoreA = a.confidence * 0.7 + (a.accessCount / 10) * 0.3;
      const scoreB = b.confidence * 0.7 + (b.accessCount / 10) * 0.3;
      return scoreB - scoreA;
    });

    // 应用限制
    if (limit && limit > 0) {
      preferences = preferences.slice(0, limit);
    }

    return preferences;
  }

  /**
   * 按主题搜索偏好
   *
   * @param query - 搜索查询
   * @returns 匹配的偏好列表
   */
  async searchPreferences(query: string): Promise<PreferenceRecord[]> {
    await this.ensureInitialized();

    const queryLower = query.toLowerCase();
    const preferences = Array.from(this.preferenceCache.values());

    return preferences.filter(p =>
      p.subject.toLowerCase().includes(queryLower) ||
      p.content.toLowerCase().includes(queryLower)
    );
  }

  /**
   * 删除偏好
   *
   * @param id - 偏好 ID
   * @returns 是否成功删除
   */
  async deletePreference(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const record = this.preferenceCache.get(id);
    if (!record) {
      return false;
    }

    // 从存储删除
    await this.store.delete(id);

    // 从缓存删除
    this.preferenceCache.delete(id);

    log.debug('偏好已删除', { id, subject: record.subject });
    return true;
  }

  /**
   * 获取偏好统计
   */
  getStats(): {
    totalCount: number;
    byType: Record<PreferenceType, number>;
    averageConfidence: number;
  } {
    const preferences = Array.from(this.preferenceCache.values());

    const byType: Record<PreferenceType, number> = {
      like: 0,
      dislike: 0,
      want: 0,
      avoid: 0,
      habit: 0,
      style: 0,
    };

    let totalConfidence = 0;

    for (const p of preferences) {
      byType[p.type]++;
      totalConfidence += p.confidence;
    }

    return {
      totalCount: preferences.length,
      byType,
      averageConfidence: preferences.length > 0
        ? totalConfidence / preferences.length
        : 0,
    };
  }

  // ========== 私有方法 ==========

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 加载偏好缓存
   */
  private async loadPreferenceCache(): Promise<void> {
    // 检索所有偏好类型的记忆
    const results = await this.store.search('preference', {
      limit: this.config.maxPreferences,
      filter: { types: ['preference'] },
    });

    for (const result of results) {
      const entry = result.entry;
      // 从元数据恢复偏好信息
      const metadata = entry.metadata ?? {};
      const record: PreferenceRecord = {
        id: entry.id,
        type: (metadata.preferenceType as PreferenceType) ?? 'like',
        subject: metadata.subject ?? entry.content,
        content: entry.content,
        confidence: metadata.confidence ?? 0.8,
        createdAt: entry.createdAt,
        updatedAt: entry.accessedAt,
        accessCount: entry.accessCount,
        sourceMessage: metadata.sourceMessage,
        sessionKey: entry.sessionKey,
      };
      this.preferenceCache.set(record.id, record);
    }

    log.debug('偏好缓存已加载', { count: this.preferenceCache.size });
  }

  /**
   * 查找相似偏好
   */
  private findSimilarPreference(
    detection: PreferenceDetectionResult
  ): PreferenceRecord | null {
    if (!detection.subject) return null;

    const subjectLower = detection.subject.toLowerCase();

    for (const record of this.preferenceCache.values()) {
      // 类型相同且主题相似
      if (record.type === detection.type) {
        const recordSubjectLower = record.subject.toLowerCase();
        const similarity = this.calculateSimilarity(subjectLower, recordSubjectLower);

        if (similarity >= this.config.similarityThreshold) {
          log.debug('发现相似偏好', {
            existing: record.subject,
            new: detection.subject,
            similarity,
          });
          return record;
        }
      }
    }

    return null;
  }

  /**
   * 计算文本相似度（Jaccard + 编辑距离混合）
   */
  private calculateSimilarity(text1: string, text2: string): number {
    // 简化实现：使用 Jaccard 相似度
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;

    const jaccard = intersection.size / union.size;

    // 考虑长度相似度
    const lenRatio = Math.min(text1.length, text2.length) / Math.max(text1.length, text2.length);

    return jaccard * 0.7 + lenRatio * 0.3;
  }

  /**
   * 更新现有偏好
   */
  private async updateExistingPreference(
    existing: PreferenceRecord,
    detection: PreferenceDetectionResult,
    context?: { sessionKey?: string; sourceMessage?: string }
  ): Promise<HandleResult> {
    // 更新置信度（取较高值）
    const newConfidence = Math.max(existing.confidence, detection.confidence);

    // 更新记录
    existing.confidence = newConfidence;
    existing.updatedAt = new Date();
    existing.accessCount++;
    if (context?.sourceMessage) {
      existing.sourceMessage = context.sourceMessage;
    }

    // 更新存储
    try {
      await this.store.delete(existing.id);
      await this.store.store({
        type: 'preference' as MemoryType,
        content: existing.content,
        importance: existing.confidence,
        stability: 1.0,
        status: 'active',
        sessionKey: context?.sessionKey ?? existing.sessionKey,
        metadata: {
          preferenceType: existing.type,
          subject: existing.subject,
          confidence: existing.confidence,
          sourceMessage: existing.sourceMessage,
          classification: {
            confidence: existing.confidence,
            matchedPatterns: [],
          },
        },
      });

      log.debug('偏好已更新', {
        id: existing.id,
        subject: existing.subject,
        confidence: existing.confidence,
      });

      return {
        success: true,
        action: 'updated',
        record: existing,
      };
    } catch (error) {
      log.error('更新偏好失败', { error: String(error) });
      return {
        success: false,
        action: 'error',
        error: String(error),
      };
    }
  }

  /**
   * 创建新偏好
   */
  private async createPreference(
    detection: PreferenceDetectionResult,
    context?: { sessionKey?: string; sourceMessage?: string }
  ): Promise<HandleResult> {
    try {
      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessedAt' | 'accessCount'> = {
        type: 'preference' as MemoryType,
        content: detection.content ?? detection.subject ?? '',
        importance: detection.confidence,
        stability: 1.0,
        status: 'active',
        sessionKey: context?.sessionKey,
        metadata: {
          preferenceType: detection.type,
          subject: detection.subject,
          confidence: detection.confidence,
          sourceMessage: context?.sourceMessage,
          classification: {
            confidence: detection.confidence,
            matchedPatterns: detection.matchedPattern ? [detection.matchedPattern] : [],
          },
        },
      };

      const id = await this.store.store(entry);

      const record: PreferenceRecord = {
        id,
        type: detection.type!,
        subject: detection.subject ?? '',
        content: detection.content ?? '',
        confidence: detection.confidence,
        createdAt: new Date(),
        updatedAt: new Date(),
        accessCount: 0,
        sourceMessage: context?.sourceMessage,
        sessionKey: context?.sessionKey,
      };

      this.preferenceCache.set(id, record);

      log.info('新偏好已创建', {
        id,
        type: detection.type,
        subject: detection.subject,
        confidence: detection.confidence,
      });

      return {
        success: true,
        action: 'created',
        record,
      };
    } catch (error) {
      log.error('创建偏好失败', { error: String(error) });
      return {
        success: false,
        action: 'error',
        error: String(error),
      };
    }
  }
}

/**
 * 创建偏好处理器
 */
export function createPreferenceHandler(
  store: PreferenceStoreAdapter,
  config?: Partial<PreferenceHandlerConfig>
): PreferenceHandler {
  return new PreferenceHandler(store, config);
}
