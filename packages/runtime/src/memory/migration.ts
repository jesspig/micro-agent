/**
 * 嵌入向量迁移模块
 * 
 * 负责在不同嵌入模型之间迁移向量数据，支持：
 * - 渐进式迁移（最新记录优先）
 * - 断点续传
 * - 自适应批次间隔
 * - 失败记录追踪和重试
 */

import type { MemoryEntry } from '../types';
import type {
  MigrationState,
  MigrationStatus,
  EmbeddingService,
  VectorColumnName,
  MigrationEvent,
  RetryResult,
  LoadStateResult,
} from './types';
import { MemoryStore } from './store';
import { getLogger } from '@logtape/logtape';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const log = getLogger(['micro-agent', 'memory', 'migration']);

/** 迁移状态文件名 */
const MIGRATION_STATE_FILE = 'migration-state.json';

/** 默认批次大小 */
const DEFAULT_BATCH_SIZE = 50;

/** 自适应间隔配置 */
export interface AdaptiveIntervalConfig {
  /** 最小间隔（毫秒） */
  minInterval: number;
  /** 最大间隔（毫秒） */
  maxInterval: number;
  /** 初始间隔（毫秒） */
  initialInterval: number;
  /** 成功时加速因子 */
  speedUpFactor: number;
  /** 失败时退避因子 */
  backOffFactor: number;
}

/** 默认自适应间隔配置 */
const DEFAULT_ADAPTIVE_CONFIG: AdaptiveIntervalConfig = {
  minInterval: 100,
  maxInterval: 5000,
  initialInterval: 500,
  speedUpFactor: 0.8,
  backOffFactor: 2.0,
};

/**
 * 自适应间隔控制器
 * 
 * 根据嵌入服务响应时间动态调整批次间隔
 */
export class AdaptiveInterval {
  private currentInterval: number;
  private config: AdaptiveIntervalConfig;
  private lastSuccessTime: number = 0;
  private consecutiveFailures: number = 0;

  constructor(config: Partial<AdaptiveIntervalConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
    this.currentInterval = this.config.initialInterval;
  }

  /**
   * 记录成功操作，加速处理
   */
  recordSuccess(responseTimeMs: number): void {
    this.consecutiveFailures = 0;
    this.lastSuccessTime = responseTimeMs;

    // 响应时间短则加速
    if (responseTimeMs < this.currentInterval * 0.5) {
      this.currentInterval = Math.max(
        this.config.minInterval,
        this.currentInterval * this.config.speedUpFactor
      );
    }
  }

  /**
   * 记录失败操作，退避处理
   */
  recordFailure(): void {
    this.consecutiveFailures++;
    this.currentInterval = Math.min(
      this.config.maxInterval,
      this.currentInterval * Math.pow(this.config.backOffFactor, this.consecutiveFailures)
    );
  }

  /**
   * 获取下次等待间隔
   */
  getNextInterval(): number {
    return this.currentInterval;
  }

  /**
   * 重置为初始状态
   */
  reset(): void {
    this.currentInterval = this.config.initialInterval;
    this.consecutiveFailures = 0;
  }
}

/**
 * 嵌入向量迁移器
 */
export class EmbeddingMigration {
  private store: MemoryStore;
  private embeddingService: EmbeddingService;
  private state: MigrationState | null = null;
  private statePath: string;
  private adaptiveInterval: AdaptiveInterval;
  private eventHandlers: Map<string, Set<(event: MigrationEvent) => void>> = new Map();
  private abortController: AbortController | null = null;

  constructor(
    store: MemoryStore,
    embeddingService: EmbeddingService,
    memoryDir: string,
    adaptiveConfig?: Partial<AdaptiveIntervalConfig>
  ) {
    this.store = store;
    this.embeddingService = embeddingService;
    this.statePath = join(memoryDir, MIGRATION_STATE_FILE);
    this.adaptiveInterval = new AdaptiveInterval(adaptiveConfig);
  }

  // ========== 状态管理 ==========

  /**
   * 校验迁移状态文件的必要字段
   */
  private validateState(state: unknown): { valid: boolean; error?: string } {
    if (!state || typeof state !== 'object') {
      return { valid: false, error: '状态文件内容为空或格式无效' };
    }

    const s = state as Record<string, unknown>;
    const requiredFields: (keyof MigrationState)[] = [
      'targetModel',
      'status',
      'totalRecords',
      'migratedCount',
      'batchSize',
      'failedRecords',
    ];

    const missingFields = requiredFields.filter(field => !(field in s));
    if (missingFields.length > 0) {
      return { valid: false, error: `缺少必要字段: ${missingFields.join(', ')}` };
    }

    // 类型校验
    if (typeof s.targetModel !== 'string' || s.targetModel.length === 0) {
      return { valid: false, error: 'targetModel 必须是非空字符串' };
    }
    
    const validStatuses = ['running', 'paused', 'completed', 'error', 'idle'];
    if (!validStatuses.includes(s.status as string)) {
      return { valid: false, error: `status 必须是以下值之一: ${validStatuses.join(', ')}` };
    }
    
    if (typeof s.totalRecords !== 'number' || s.totalRecords < 0) {
      return { valid: false, error: 'totalRecords 必须是非负数' };
    }
    
    if (typeof s.migratedCount !== 'number' || s.migratedCount < 0) {
      return { valid: false, error: 'migratedCount 必须是非负数' };
    }
    
    if (typeof s.batchSize !== 'number' || s.batchSize <= 0) {
      return { valid: false, error: 'batchSize 必须是正数' };
    }
    
    if (!Array.isArray(s.failedRecords)) {
      return { valid: false, error: 'failedRecords 必须是数组' };
    }

    return { valid: true };
  }

  /**
   * 备份损坏的状态文件
   */
  private async backupCorruptedState(error: string): Promise<string | null> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.statePath}.corrupted.${timestamp}`;
      const content = await readFile(this.statePath, 'utf-8');
      await writeFile(backupPath, content, 'utf-8');
      log.warn('📦 [Migration] 已备份损坏的状态文件', { backupPath, error });
      return backupPath;
    } catch (backupError) {
      log.error('🚨 [Migration] 备份状态文件失败', { error: String(backupError) });
      return null;
    }
  }

  /**
   * 加载迁移状态
   */
  private async loadState(): Promise<LoadStateResult> {
    try {
      if (!existsSync(this.statePath)) {
        return { valid: true, state: undefined };
      }

      const content = await readFile(this.statePath, 'utf-8');
      const parsed = JSON.parse(content);

      // 校验状态
      const validation = this.validateState(parsed);
      if (!validation.valid) {
        log.error('🚨 [Migration] 状态文件校验失败', { error: validation.error });
        
        // 备份损坏文件
        const backupPath = await this.backupCorruptedState(validation.error!);
        
        return {
          valid: false,
          error: validation.error,
          backedUp: backupPath !== null,
        };
      }

      return { valid: true, state: parsed as MigrationState };
    } catch (error) {
      const errorMessage = `解析状态文件失败: ${String(error)}`;
      log.error('🚨 [Migration] 状态文件损坏', { error: errorMessage });
      
      // 备份损坏文件
      const backupPath = await this.backupCorruptedState(errorMessage);
      
      return {
        valid: false,
        error: errorMessage,
        backedUp: backupPath !== null,
      };
    }
  }

  /**
   * 保存迁移状态
   */
  private async saveState(): Promise<void> {
    if (!this.state) return;

    try {
      const dir = dirname(this.statePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (error) {
      log.error('🚨 [Migration] 保存状态失败', { error: String(error) });
    }
  }

  /**
   * 获取当前迁移状态
   */
  async getStatus(): Promise<MigrationStatus> {
    if (!this.state) {
      const result = await this.loadState();
      if (result.valid && result.state) {
        this.state = result.state;
      } else if (!result.valid) {
        // 状态文件无效，返回 idle 状态
        log.warn('📦 [Migration] 状态文件无效，将从头开始', { error: result.error });
      }
    }

    if (!this.state) {
      return {
        status: 'idle' as const,
        progress: 0,
        migratedCount: 0,
        totalRecords: 0,
        failedCount: 0,
      };
    }

    const progress = this.state.totalRecords > 0
      ? Math.round((this.state.migratedCount / this.state.totalRecords) * 100)
      : 0;

    return {
      status: this.state.status,
      targetModel: this.state.targetModel,
      migratedCount: this.state.migratedCount,
      totalRecords: this.state.totalRecords,
      failedCount: this.state.failedRecords.length,
      progress,
      migratedUntil: this.state.migratedUntil,
      startedAt: this.state.startedAt,
      estimatedRemaining: this.calculateRemaining(),
    };
  }

  /**
   * 计算预估剩余时间
   */
  private calculateRemaining(): number | undefined {
    if (!this.state || this.state.migratedCount === 0 || this.state.status !== 'running') {
      return undefined;
    }

    const elapsed = Date.now() - (this.state.startedAt || Date.now());
    const avgTimePerRecord = elapsed / this.state.migratedCount;
    const remaining = this.state.totalRecords - this.state.migratedCount;
    return Math.round(avgTimePerRecord * remaining);
  }

  // ========== 事件系统 ==========

  /**
   * 监听迁移事件
   */
  on(event: string, handler: (event: MigrationEvent) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * 移除事件监听
   */
  off(event: string, handler: (event: MigrationEvent) => void): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * 发射事件
   */
  private emit(event: MigrationEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          log.error('🚨 [Migration] 事件处理器错误', { event: event.type, error: String(error) });
        }
      }
    }
  }

  // ========== 迁移控制 ==========

  /**
   * 启动迁移
   * 
   * @param targetModel 目标模型 ID
   * @param batchSize 批次大小（默认 50）
   */
  async start(targetModel: string, batchSize: number = DEFAULT_BATCH_SIZE): Promise<void> {
    // 检查是否已有迁移进行中
    const currentStatus = await this.getStatus();
    if (currentStatus.status === 'running') {
      throw new Error('迁移已在进行中，请等待完成或暂停后再试');
    }

    // 初始化状态
    const totalRecords = await this.store.count();
    this.state = {
      targetModel,
      status: 'running',
      totalRecords,
      migratedCount: 0,
      failedRecords: [],
      batchSize,
      startedAt: Date.now(),
    };
    await this.saveState();

    this.abortController = new AbortController();
    this.adaptiveInterval.reset();

    this.emit({
      type: 'migration:start',
      timestamp: Date.now(),
      data: { targetModel, totalRecords },
    });

    log.info('🚀 [Migration] 开始迁移', { targetModel, totalRecords, batchSize });

    // 后台执行迁移
    this.runMigration(batchSize).catch(error => {
      log.error('🚨 [Migration] 迁移失败', { error: String(error) });
      if (this.state) {
        this.state.status = 'error';
        this.saveState();
      }
      this.emit({
        type: 'migration:error',
        timestamp: Date.now(),
        data: { error: String(error) },
      });
    });
  }

  /**
   * 暂停迁移
   */
  async pause(): Promise<void> {
    if (!this.state || this.state.status !== 'running') {
      return;
    }

    this.abortController?.abort();
    this.state.status = 'paused';
    await this.saveState();

    this.emit({
      type: 'migration:paused',
      timestamp: Date.now(),
      data: { migratedCount: this.state.migratedCount },
    });

    log.info('⏸️ [Migration] 迁移已暂停', { migratedCount: this.state.migratedCount });
  }

  /**
   * 继续迁移
   */
  async resume(): Promise<void> {
    const status = await this.getStatus();
    if (status.status !== 'paused') {
      throw new Error('没有暂停的迁移可继续');
    }

    if (!this.state) {
      throw new Error('迁移状态丢失');
    }

    this.state.status = 'running';
    await this.saveState();

    this.abortController = new AbortController();

    this.emit({
      type: 'migration:resumed',
      timestamp: Date.now(),
      data: { migratedCount: this.state.migratedCount },
    });

    log.info('▶️ [Migration] 继续迁移', { migratedCount: this.state.migratedCount });

    this.runMigration(this.state.batchSize).catch(error => {
      log.error('🚨 [Migration] 迁移失败', { error: String(error) });
      if (this.state) {
        this.state.status = 'error';
        this.saveState();
      }
    });
  }

  /**
   * 运行迁移循环
   */
  private async runMigration(batchSize: number): Promise<void> {
    const targetColumn = MemoryStore.modelIdToVectorColumn(this.state!.targetModel);

    while (this.state!.status === 'running') {
      // 检查是否被中止
      if (this.abortController?.signal.aborted) {
        break;
      }

      // 获取下一批记录（最新优先）
      const batch = await this.fetchNextBatch(batchSize, targetColumn);

      if (batch.length === 0) {
        // 迁移完成
        await this.completeMigration();
        break;
      }

      // 处理批次
      await this.processBatch(batch, targetColumn);

      // 自适应等待
      await this.sleep(this.adaptiveInterval.getNextInterval());
    }
  }

  /**
   * 获取下一批待迁移记录
   */
  private async fetchNextBatch(
    batchSize: number,
    targetColumn: VectorColumnName
  ): Promise<MemoryEntry[]> {
    // 获取已迁移到的最早时间戳
    const migratedUntil = this.state?.migratedUntil;

    // 检查目标列是否存在
    const targetModelId = this.state?.targetModel;
    const columnExists = targetModelId ? await this.store.hasVectorColumn(targetModelId) : false;

    // 构建查询：未迁移 + 时间条件
    // 如果目标列不存在，则所有记录都未迁移，无需 $exists 过滤
    const filter: Record<string, unknown> = {};
    
    if (columnExists) {
      filter[targetColumn] = { $exists: false };
    }

    if (migratedUntil) {
      // 只取时间戳 > migratedUntil 的记录（避免边界记录重复查询）
      filter['createdAt'] = { $gt: migratedUntil };
    }

    const entries = await this.store.query({
      filter,
      limit: batchSize,
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    return entries;
  }

  /**
   * 处理单批次记录
   */
  private async processBatch(
    batch: MemoryEntry[],
    targetColumn: VectorColumnName
  ): Promise<void> {
    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;

    for (const entry of batch) {
      try {
        // 生成新向量
        const vector = await this.embeddingService.embed(entry.content);

        // 更新记录
        await this.store.updateVector(entry.id, targetColumn, vector, this.state!.targetModel);

        successCount++;

        // 更新迁移状态
        if (this.state) {
          this.state.migratedCount++;
          // 将 Date 转换为 timestamp
          this.state.migratedUntil = entry.createdAt instanceof Date 
            ? entry.createdAt.getTime() 
            : entry.createdAt;
        }
      } catch (error) {
        failCount++;
        this.adaptiveInterval.recordFailure();

        // 记录失败
        if (this.state) {
          this.state.failedRecords.push({
            id: entry.id,
            error: String(error),
            timestamp: Date.now(),
          });
        }

        this.emit({
          type: 'migration:record_failed',
          timestamp: Date.now(),
          data: { recordId: entry.id, error: String(error) },
        });

        log.warn('⚠️ [Migration] 记录迁移失败', { recordId: entry.id, error: String(error) });
      }
    }

    // 记录成功，调整间隔
    if (successCount > 0) {
      const responseTime = Date.now() - startTime;
      this.adaptiveInterval.recordSuccess(responseTime / successCount);
    }

    // 保存状态
    await this.saveState();

    // 发射进度事件
    const progress = this.state!.totalRecords > 0
      ? Math.round((this.state!.migratedCount / this.state!.totalRecords) * 100)
      : 0;

    this.emit({
      type: 'migration:progress',
      timestamp: Date.now(),
      data: {
        migratedCount: this.state!.migratedCount,
        totalRecords: this.state!.totalRecords,
        progress,
        migratedUntil: this.state!.migratedUntil,
        batchSize: batch.length,
        successCount,
        failCount,
      },
    });

    log.info('📊 [Migration] 批次完成', {
      successCount,
      failCount,
      progress: `${progress}%`,
      migratedCount: this.state!.migratedCount,
    });
  }

  /**
   * 完成迁移
   */
  private async completeMigration(): Promise<void> {
    if (!this.state) return;

    this.state.status = 'completed';
    this.state.completedAt = Date.now();
    await this.saveState();

    this.emit({
      type: 'migration:complete',
      timestamp: Date.now(),
      data: {
        migratedCount: this.state.migratedCount,
        failedCount: this.state.failedRecords.length,
        duration: this.state.completedAt - (this.state.startedAt || 0),
      },
    });

    log.info('✅ [Migration] 迁移完成', {
      migratedCount: this.state.migratedCount,
      failedCount: this.state.failedRecords.length,
    });
  }

  // ========== 重试功能 ==========

  /**
   * 重试失败的记录
   * 
   * @param recordIds 可选，指定要重试的记录 ID 列表。不传则重试所有失败记录
   */
  async retryFailed(recordIds?: string[]): Promise<RetryResult> {
    if (!this.state || this.state.failedRecords.length === 0) {
      return { retried: 0, succeeded: 0, failed: 0, remainingFailed: [] };
    }

    const toRetry = recordIds
      ? this.state.failedRecords.filter(r => recordIds.includes(r.id))
      : this.state.failedRecords;

    if (toRetry.length === 0) {
      return { retried: 0, succeeded: 0, failed: 0, remainingFailed: this.state.failedRecords };
    }

    const targetColumn = MemoryStore.modelIdToVectorColumn(this.state.targetModel);
    const stillFailed: typeof toRetry = [];
    let succeeded = 0;

    for (const failed of toRetry) {
      try {
        // 获取记录内容
        const entry = await this.store.getById(failed.id);
        if (!entry) {
          stillFailed.push({ ...failed, error: 'Record not found' });
          continue;
        }

        // 重新生成向量
        const vector = await this.embeddingService.embed(entry.content);
        await this.store.updateVector(entry.id, targetColumn, vector, this.state.targetModel);

        succeeded++;

        // 从失败列表移除
        this.state.failedRecords = this.state.failedRecords.filter(r => r.id !== failed.id);
        this.state.migratedCount++;
      } catch (error) {
        stillFailed.push({ ...failed, error: String(error), timestamp: Date.now() });
      }
    }

    await this.saveState();

    return {
      retried: toRetry.length,
      succeeded,
      failed: toRetry.length - succeeded,
      remainingFailed: this.state.failedRecords,
    };
  }

  // ========== 工具方法 ==========

  /**
   * 延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
