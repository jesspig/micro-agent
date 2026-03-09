/**
 * 向量迁移服务
 *
 * 分批迁移向量，保留旧向量，支持进度查询和回滚。
 */

import { getLogger } from '@logtape/logtape';
import { z } from 'zod';
import type {
  EmbeddingMigration,
  MigrationConfig,
  MigrationProgress,
  MigrationStatus,
} from '../../../../types/embedding';
import type { EmbeddingService } from '../types';
import { VectorAdapter } from './vector-adapter';
import { ModelRegistry } from './model-registry';

const log = getLogger(['memory', 'embedding', 'migration']);

/** 迁移服务配置 Schema */
export const MigrationServiceConfigSchema = z.object({
  /** 默认批次大小 */
  defaultBatchSize: z.number().int().positive().optional().default(100),
  /** 批次间隔（毫秒） */
  batchInterval: z.number().int().min(0).optional().default(100),
  /** 错误时停止 */
  stopOnError: z.boolean().optional().default(true),
  /** 最大重试次数 */
  maxRetries: z.number().int().min(0).optional().default(3),
  /** 最大并发迁移任务 */
  maxConcurrentMigrations: z.number().int().positive().optional().default(1),
});

/** 迁移服务配置 */
export type MigrationServiceConfig = z.infer<typeof MigrationServiceConfigSchema>;

/** 迁移状态持久化 */
interface MigrationState {
  migration: EmbeddingMigration;
  processedIds: string[];
  failedIds: Array<{ id: string; error: string }>;
  startTime: number;
  lastProgress: number;
}

/** 迁移事件 */
export type MigrationEventType = 'started' | 'progress' | 'completed' | 'failed' | 'paused' | 'resumed';

/** 迁移事件处理器 */
export type MigrationEventHandler = (event: {
  type: MigrationEventType;
  migrationId: string;
  progress: MigrationProgress;
}) => void;

/**
 * 向量迁移服务
 *
 * 职责：
 * - 分批迁移向量
 * - 保留旧向量支持回滚
 * - 进度追踪
 * - 错误处理和重试
 */
export class MigrationService {
  private config: MigrationServiceConfig;
  private vectorAdapter: VectorAdapter;
  private modelRegistry: ModelRegistry;
  private migrations: Map<string, MigrationState> = new Map();
  private currentMigration: MigrationState | null = null;
  private eventHandlers: Set<MigrationEventHandler> = new Set();
  private isRunning = false;

  constructor(
    vectorAdapter: VectorAdapter,
    modelRegistry: ModelRegistry,
    config?: Partial<MigrationServiceConfig>
  ) {
    this.vectorAdapter = vectorAdapter;
    this.modelRegistry = modelRegistry;
    this.config = MigrationServiceConfigSchema.parse(config ?? {});
  }

  /**
   * 启动迁移任务
   */
  async startMigration(
    sourceModelId: string,
    targetModelId: string,
    targetEmbeddingService: EmbeddingService,
    customConfig?: Partial<MigrationConfig>
  ): Promise<EmbeddingMigration> {
    // 检查是否已有进行中的迁移
    if (this.currentMigration && this.currentMigration.migration.status === 'running') {
      throw new Error('已有迁移任务进行中');
    }

    // 验证模型
    const sourceModel = this.modelRegistry.getModel(sourceModelId);
    const targetModel = this.modelRegistry.getModel(targetModelId);

    if (!sourceModel) {
      throw new Error(`源模型不存在: ${sourceModelId}`);
    }

    if (!targetModel) {
      throw new Error(`目标模型不存在: ${targetModelId}`);
    }

    if (!targetEmbeddingService.isAvailable()) {
      throw new Error('目标嵌入服务不可用');
    }

    // 获取源向量总数
    const totalCount = await this.vectorAdapter.countByModelId(sourceModelId);

    // 创建迁移任务
    const migrationId = crypto.randomUUID();
    const config: MigrationConfig = {
      batchSize: customConfig?.batchSize ?? this.config.defaultBatchSize,
      batchInterval: customConfig?.batchInterval ?? this.config.batchInterval,
      stopOnError: customConfig?.stopOnError ?? this.config.stopOnError,
      maxRetries: customConfig?.maxRetries ?? this.config.maxRetries,
    };

    const migration: EmbeddingMigration = {
      id: migrationId,
      sourceModelId,
      targetModelId,
      status: 'pending',
      totalCount,
      processedCount: 0,
      batchSize: config.batchSize,
      config,
      createdAt: new Date(),
    };

    // 初始化迁移状态
    const state: MigrationState = {
      migration,
      processedIds: [],
      failedIds: [],
      startTime: Date.now(),
      lastProgress: 0,
    };

    this.migrations.set(migrationId, state);
    this.currentMigration = state;

    // 更新模型状态
    this.modelRegistry.updateModelStatus(targetModelId, 'migrating');

    // 发送事件
    this.emitEvent('started', migrationId);

    log.info('迁移任务已创建', {
      migrationId,
      sourceModelId,
      targetModelId,
      totalCount,
    });

    // 开始迁移
    await this.runMigration(state, targetEmbeddingService);

    return migration;
  }

  /**
   * 执行迁移
   */
  private async runMigration(
    state: MigrationState,
    embeddingService: EmbeddingService
  ): Promise<void> {
    const { migration } = state;
    migration.status = 'running';
    migration.startedAt = new Date();

    this.isRunning = true;

    try {
      // 获取源向量
      const sourceVectors = await this.vectorAdapter.getByModelId(migration.sourceModelId);

      if (sourceVectors.length === 0) {
        migration.status = 'completed';
        migration.completedAt = new Date();
        this.emitEvent('completed', migration.id);
        log.info('迁移完成：无数据需要迁移');
        return;
      }

      // 分批处理
      const batchSize = migration.config.batchSize;
      const batches = this.chunkArray(sourceVectors, batchSize);

      for (let i = 0; i < batches.length; i++) {
        // 检查是否暂停（status 可能在异步操作期间被其他方法修改）
        if ((migration.status as MigrationStatus) === 'paused') {
          log.info('迁移已暂停', { migrationId: migration.id, batch: i });
          return;
        }

        const batch = batches[i];
        await this.processBatch(batch, state, embeddingService);

        // 更新进度
        migration.processedCount = state.processedIds.length;
        this.emitEvent('progress', migration.id);

        // 批次间隔
        if (i < batches.length - 1 && migration.config.batchInterval > 0) {
          await this.sleep(migration.config.batchInterval);
        }
      }

      // 标记完成
      migration.status = 'completed';
      migration.completedAt = new Date();

      // 更新模型状态
      this.modelRegistry.updateModelStatus(migration.targetModelId, 'ready');

      // 禁用源模型的活跃向量
      const sourceActiveVectors = sourceVectors.filter(v => v.isActive);
      await this.vectorAdapter.setBatchActive(
        sourceActiveVectors.map(v => v.id),
        false
      );

      // 更新向量计数
      const targetCount = await this.vectorAdapter.countByModelId(migration.targetModelId);
      this.modelRegistry.updateVectorCount(migration.targetModelId, targetCount);

      this.emitEvent('completed', migration.id);

      log.info('迁移完成', {
        migrationId: migration.id,
        processed: state.processedIds.length,
        failed: state.failedIds.length,
        duration: Date.now() - state.startTime,
      });

    } catch (error) {
      migration.status = 'failed';
      migration.error = String(error);
      this.modelRegistry.updateModelStatus(migration.targetModelId, 'error');
      this.emitEvent('failed', migration.id);

      log.error('迁移失败', {
        migrationId: migration.id,
        error: String(error),
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 处理单个批次
   */
  private async processBatch(
    vectors: Array<{ id: string; memoryId: string; vector: number[]; modelId: string; dimension: number; isActive: boolean; createdAt: Date }>,
    state: MigrationState,
    embeddingService: EmbeddingService
  ): Promise<void> {
    const { migration } = state;
    const maxRetries = migration.config.maxRetries;

    for (const vector of vectors) {
      let success = false;
      let lastError: Error | null = null;

      // 重试逻辑
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // 重新生成向量
          // 注意：这里需要原始文本，暂时使用 memoryId 作为占位
          // 实际实现中应该从记忆存储获取原始内容
          const newVector = await embeddingService.embed(vector.memoryId);

          // 存储新向量
          await this.vectorAdapter.store(
            vector.memoryId,
            migration.targetModelId,
            newVector
          );

          state.processedIds.push(vector.id);
          success = true;
          break;

        } catch (error) {
          lastError = error as Error;
          if (attempt < maxRetries) {
            await this.sleep(100 * (attempt + 1)); // 指数退避
          }
        }
      }

      if (!success) {
        state.failedIds.push({
          id: vector.id,
          error: lastError?.message ?? 'Unknown error',
        });

        if (migration.config.stopOnError) {
          throw new Error(`迁移失败: ${lastError?.message}`);
        }
      }
    }
  }

  /**
   * 暂停迁移
   */
  async pauseMigration(migrationId: string): Promise<boolean> {
    const state = this.migrations.get(migrationId);
    if (!state || state.migration.status !== 'running') {
      return false;
    }

    state.migration.status = 'paused';
    this.emitEvent('paused', migrationId);

    log.info('迁移已暂停', { migrationId, processed: state.processedIds.length });
    return true;
  }

  /**
   * 恢复迁移
   */
  async resumeMigration(
    migrationId: string,
    embeddingService: EmbeddingService
  ): Promise<boolean> {
    const state = this.migrations.get(migrationId);
    if (!state || state.migration.status !== 'paused') {
      return false;
    }

    state.migration.status = 'running';
    this.emitEvent('resumed', migrationId);

    log.info('迁移已恢复', { migrationId });
    await this.runMigration(state, embeddingService);

    return true;
  }

  /**
   * 回滚迁移
   */
  async rollback(migrationId: string): Promise<{
    success: boolean;
    restoredCount: number;
    error?: string;
  }> {
    const state = this.migrations.get(migrationId);
    if (!state) {
      return { success: false, restoredCount: 0, error: 'Migration not found' };
    }

    const { migration } = state;

    if (migration.status === 'running') {
      return { success: false, restoredCount: 0, error: 'Cannot rollback running migration' };
    }

    try {
      // 删除目标模型的向量
      const deletedCount = await this.vectorAdapter.deleteByModelId(migration.targetModelId);

      // 恢复源模型向量的活跃状态
      await this.vectorAdapter.setBatchActive(state.processedIds, true);

      // 更新模型状态
      this.modelRegistry.updateModelStatus(migration.sourceModelId, 'ready');
      this.modelRegistry.updateModelStatus(migration.targetModelId, 'ready');

      // 更新向量计数
      const sourceCount = await this.vectorAdapter.countByModelId(migration.sourceModelId);
      this.modelRegistry.updateVectorCount(migration.sourceModelId, sourceCount);

      log.info('迁移已回滚', {
        migrationId,
        deletedCount,
        restoredCount: state.processedIds.length,
      });

      return {
        success: true,
        restoredCount: state.processedIds.length,
      };

    } catch (error) {
      log.error('回滚失败', { migrationId, error: String(error) });
      return {
        success: false,
        restoredCount: 0,
        error: String(error),
      };
    }
  }

  /**
   * 获取迁移进度
   */
  getProgress(migrationId: string): MigrationProgress | undefined {
    const state = this.migrations.get(migrationId);
    if (!state) return undefined;

    const { migration } = state;
    const progress = migration.totalCount > 0
      ? Math.round((migration.processedCount / migration.totalCount) * 100)
      : 0;

    // 计算预估剩余时间
    let estimatedTimeRemaining: number | undefined;
    if (state.processedIds.length > 0 && migration.status === 'running') {
      const elapsed = Date.now() - state.startTime;
      const avgTimePerItem = elapsed / state.processedIds.length;
      const remaining = migration.totalCount - migration.processedCount;
      estimatedTimeRemaining = Math.round(avgTimePerItem * remaining / 1000);
    }

    return {
      migrationId: migration.id,
      status: migration.status,
      progress,
      totalCount: migration.totalCount,
      processedCount: migration.processedCount,
      estimatedTimeRemaining,
      error: migration.error,
    };
  }

  /**
   * 获取所有迁移任务
   */
  getAllMigrations(): EmbeddingMigration[] {
    return Array.from(this.migrations.values()).map(s => s.migration);
  }

  /**
   * 获取当前活跃迁移
   */
  getCurrentMigration(): EmbeddingMigration | undefined {
    return this.currentMigration?.migration;
  }

  /**
   * 注册事件处理器
   */
  onEvent(handler: MigrationEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * 清理完成的迁移
   */
  cleanupCompleted(olderThanHours: number = 24): number {
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [id, state] of this.migrations) {
      if (
        (state.migration.status === 'completed' || state.migration.status === 'failed') &&
        state.migration.completedAt &&
        state.migration.completedAt.getTime() < cutoff
      ) {
        this.migrations.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.info('清理完成的迁移任务', { count: cleaned });
    }

    return cleaned;
  }

  // ========== 私有方法 ==========

  private emitEvent(type: MigrationEventType, migrationId: string): void {
    const progress = this.getProgress(migrationId);
    if (!progress) return;

    for (const handler of this.eventHandlers) {
      try {
        handler({ type, migrationId, progress });
      } catch (error) {
        log.warn('事件处理器错误', { error: String(error) });
      }
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建迁移服务实例
 */
export function createMigrationService(
  vectorAdapter: VectorAdapter,
  modelRegistry: ModelRegistry,
  config?: Partial<MigrationServiceConfig>
): MigrationService {
  return new MigrationService(vectorAdapter, modelRegistry, config);
}
