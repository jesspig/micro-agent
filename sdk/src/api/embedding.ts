/**
 * 嵌入模型 API
 *
 * 提供嵌入模型管理的完整 SDK 接口。
 */

/** 传输层接口 */
interface Transport {
  send(method: string, params: unknown): Promise<unknown>;
}

/** 模型状态 */
export type ModelStatus = 'ready' | 'migrating' | 'error';

/** 迁移状态 */
export type MigrationStatusType = 'pending' | 'running' | 'completed' | 'failed' | 'paused';

/** 嵌入模型信息 */
export interface EmbeddingModelInfo {
  /** 模型 ID */
  id: string;
  /** 提供商 */
  provider: string;
  /** 模型名称 */
  name: string;
  /** 向量维度 */
  dimension: number;
  /** 是否活跃 */
  isActive: boolean;
  /** 状态 */
  status: ModelStatus;
  /** 向量数量 */
  vectorCount: number;
  /** 创建时间 */
  createdAt: string;
}

/** 模型注册选项 */
export interface RegisterModelOptions {
  /** 提供商 */
  provider: string;
  /** 模型名称 */
  name: string;
  /** 是否设为活跃 */
  setActive?: boolean;
  /** 自定义 ID */
  id?: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** API 密钥 */
  apiKey?: string;
}

/** 模型切换选项 */
export interface SwitchModelOptions {
  /** 目标模型 ID */
  modelId: string;
  /** 是否自动迁移 */
  autoMigrate?: boolean;
}

/** 模型切换结果 */
export interface SwitchModelResult {
  /** 是否成功 */
  success: boolean;
  /** 前一个模型 ID */
  previousModelId?: string;
  /** 新模型 ID */
  newModelId: string;
  /** 是否需要迁移 */
  needsMigration: boolean;
  /** 迁移任务 ID */
  migrationId?: string;
  /** 错误信息 */
  error?: string;
}

/** 迁移启动选项 */
export interface StartMigrationOptions {
  /** 目标模型 ID */
  targetModelId: string;
  /** 批次大小 */
  batchSize?: number;
  /** 批次间隔 */
  batchInterval?: number;
  /** 错误时停止 */
  stopOnError?: boolean;
}

/** 迁移信息 */
export interface MigrationInfo {
  /** 迁移 ID */
  id: string;
  /** 源模型 ID */
  sourceModelId: string;
  /** 目标模型 ID */
  targetModelId: string;
  /** 状态 */
  status: MigrationStatusType;
  /** 总数量 */
  totalCount: number;
  /** 已处理数量 */
  processedCount: number;
  /** 创建时间 */
  createdAt: string;
  /** 开始时间 */
  startedAt?: string;
  /** 完成时间 */
  completedAt?: string;
  /** 错误信息 */
  error?: string;
}

/** 迁移进度 */
export interface MigrationProgressInfo {
  /** 迁移 ID */
  migrationId: string;
  /** 状态 */
  status: MigrationStatusType;
  /** 进度百分比 */
  progress: number;
  /** 总数量 */
  totalCount: number;
  /** 已处理数量 */
  processedCount: number;
  /** 预估剩余时间（秒） */
  estimatedTimeRemaining?: number;
  /** 错误信息 */
  error?: string;
}

/** 回滚结果 */
export interface RollbackResult {
  /** 是否成功 */
  success: boolean;
  /** 恢复数量 */
  restoredCount: number;
  /** 错误信息 */
  error?: string;
}

/** 向量统计 */
export interface VectorStats {
  /** 总向量数 */
  totalVectors: number;
  /** 各模型统计 */
  models: Array<{
    modelId: string;
    count: number;
    dimension?: number;
  }>;
}

/** 模型列表响应 */
export interface ModelListResponse {
  /** 是否成功 */
  success: boolean;
  /** 模型列表 */
  models: EmbeddingModelInfo[];
  /** 统计信息 */
  stats: {
    totalModels: number;
    availableModels: number;
    activeModelId: string | null;
    totalVectors: number;
  };
  /** 错误信息 */
  error?: string;
}

/**
 * 嵌入模型 API
 *
 * 提供嵌入模型管理的完整操作接口：
 * - 模型注册与注销
 * - 模型切换
 * - 向量迁移
 * - 迁移进度查询
 * - 回滚操作
 */
export class EmbeddingAPI {
  constructor(private transport: Transport) {}

  /**
   * 获取所有模型
   *
   * @returns 模型列表和统计信息
   */
  async getModels(): Promise<ModelListResponse> {
    const response = await this.transport.send('embedding.getModels', {});
    return response as ModelListResponse;
  }

  /**
   * 获取活跃模型
   *
   * @returns 活跃模型信息，如果没有则返回 null
   */
  async getActiveModel(): Promise<EmbeddingModelInfo | null> {
    try {
      const response = await this.transport.send('embedding.getActiveModel', {});
      const result = response as { success: boolean; model: EmbeddingModelInfo | null };
      return result.success ? result.model : null;
    } catch {
      return null;
    }
  }

  /**
   * 注册新模型
   *
   * @param options - 注册选项
   * @returns 注册的模型信息
   */
  async registerModel(options: RegisterModelOptions): Promise<EmbeddingModelInfo> {
    const response = await this.transport.send('embedding.registerModel', options);
    const result = response as { success: boolean; model: EmbeddingModelInfo; error?: string };

    if (!result.success) {
      throw new Error(result.error ?? 'Failed to register model');
    }

    return result.model;
  }

  /**
   * 注销模型
   *
   * @param modelId - 模型 ID
   * @returns 是否成功
   */
  async unregisterModel(modelId: string): Promise<boolean> {
    try {
      const response = await this.transport.send('embedding.unregisterModel', { modelId });
      const result = response as { success: boolean };
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * 切换活跃模型
   *
   * 如果需要迁移且 autoMigrate 为 true，会自动启动迁移任务。
   *
   * @param options - 切换选项
   * @returns 切换结果
   */
  async switchModel(options: SwitchModelOptions): Promise<SwitchModelResult> {
    const response = await this.transport.send('embedding.switchModel', options);
    return response as SwitchModelResult;
  }

  /**
   * 启动迁移任务
   *
   * @param options - 迁移选项
   * @returns 迁移任务信息
   */
  async startMigration(options: StartMigrationOptions): Promise<MigrationInfo> {
    const response = await this.transport.send('embedding.startMigration', options);
    const result = response as { success: boolean; migration: MigrationInfo; error?: string };

    if (!result.success) {
      throw new Error(result.error ?? 'Failed to start migration');
    }

    return result.migration;
  }

  /**
   * 获取迁移进度
   *
   * @param migrationId - 迁移任务 ID（可选，默认获取当前活跃迁移）
   * @returns 迁移进度信息
   */
  async getMigrationProgress(migrationId?: string): Promise<MigrationProgressInfo | null> {
    try {
      const response = await this.transport.send('embedding.getMigrationProgress', { migrationId });
      const result = response as { success: boolean; progress: MigrationProgressInfo | null };
      return result.success ? result.progress : null;
    } catch {
      return null;
    }
  }

  /**
   * 获取所有迁移任务
   *
   * @returns 迁移任务列表
   */
  async getMigrations(): Promise<MigrationInfo[]> {
    try {
      const response = await this.transport.send('embedding.getMigrations', {});
      const result = response as { success: boolean; migrations: MigrationInfo[] };
      return result.success ? result.migrations : [];
    } catch {
      return [];
    }
  }

  /**
   * 暂停迁移
   *
   * @param migrationId - 迁移任务 ID
   * @returns 是否成功
   */
  async pauseMigration(migrationId: string): Promise<boolean> {
    try {
      const response = await this.transport.send('embedding.pauseMigration', { migrationId });
      const result = response as { success: boolean };
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * 恢复迁移
   *
   * @param migrationId - 迁移任务 ID
   * @returns 是否成功
   */
  async resumeMigration(migrationId: string): Promise<boolean> {
    try {
      const response = await this.transport.send('embedding.resumeMigration', { migrationId });
      const result = response as { success: boolean };
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * 回滚迁移
   *
   * 恢复到迁移前的状态，删除新模型的向量并恢复旧模型的活跃向量。
   *
   * @param migrationId - 迁移任务 ID
   * @returns 回滚结果
   */
  async rollback(migrationId: string): Promise<RollbackResult> {
    const response = await this.transport.send('embedding.rollback', { migrationId });
    return response as RollbackResult;
  }

  /**
   * 获取向量统计
   *
   * @returns 向量统计信息
   */
  async getVectorStats(): Promise<VectorStats | null> {
    try {
      const response = await this.transport.send('embedding.getVectorStats', {});
      const result = response as { success: boolean; stats: VectorStats };
      return result.success ? result.stats : null;
    } catch {
      return null;
    }
  }

  /**
   * 等待迁移完成
   *
   * 轮询迁移进度直到完成或超时。
   *
   * @param migrationId - 迁移任务 ID
   * @param timeout - 超时时间（毫秒）
   * @param interval - 轮询间隔（毫秒）
   * @returns 最终迁移状态
   */
  async waitForMigration(
    migrationId: string,
    timeout: number = 60000,
    interval: number = 1000
  ): Promise<MigrationStatusType> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const progress = await this.getMigrationProgress(migrationId);

      if (!progress) {
        return 'failed';
      }

      if (progress.status === 'completed' || progress.status === 'failed') {
        return progress.status;
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return 'failed';
  }

  /**
   * 一键切换模型并等待迁移完成
   *
   * 便捷方法，执行切换并自动等待迁移完成。
   *
   * @param modelId - 目标模型 ID
   * @param timeout - 迁移超时时间（毫秒）
   * @returns 切换和迁移结果
   */
  async switchAndWait(modelId: string, timeout: number = 60000): Promise<{
    switchResult: SwitchModelResult;
    migrationStatus?: MigrationStatusType;
  }> {
    const switchResult = await this.switchModel({ modelId, autoMigrate: true });

    if (!switchResult.success) {
      return { switchResult };
    }

    if (switchResult.migrationId) {
      const migrationStatus = await this.waitForMigration(switchResult.migrationId, timeout);
      return { switchResult, migrationStatus };
    }

    return { switchResult };
  }
}
