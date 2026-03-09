/**
 * 嵌入模型注册表
 *
 * 管理多个嵌入模型的注册、查询和活跃状态切换。
 * 支持预定义模型和动态检测模型维度。
 */

import { getLogger } from '@logtape/logtape';
import { z } from 'zod';
import type { EmbeddingModel, EmbeddingModelRegisterOptions } from '../../../../types/embedding';
import type { EmbeddingService } from '../types';

const log = getLogger(['memory', 'embedding', 'registry']);

/** 预定义模型配置 Schema */
export const PredefinedModelSchema = z.object({
  /** 模型 ID */
  id: z.string(),
  /** 提供商 */
  provider: z.string(),
  /** 模型名称 */
  name: z.string(),
  /** 向量维度 */
  dimension: z.number().int().positive(),
});

/** 预定义模型配置 */
export type PredefinedModel = z.infer<typeof PredefinedModelSchema>;

/** 模型注册表配置 */
export interface ModelRegistryConfig {
  /** 存储路径 */
  storagePath?: string;
  /** 预定义模型列表 */
  predefinedModels?: PredefinedModel[];
  /** 默认活跃模型 ID */
  defaultModelId?: string;
}

/** 常用预定义模型 */
export const PREDEFINED_MODELS: PredefinedModel[] = [
  { id: 'openai/text-embedding-ada-002', provider: 'openai', name: 'text-embedding-ada-002', dimension: 1536 },
  { id: 'openai/text-embedding-3-small', provider: 'openai', name: 'text-embedding-3-small', dimension: 1536 },
  { id: 'openai/text-embedding-3-large', provider: 'openai', name: 'text-embedding-3-large', dimension: 3072 },
  { id: 'ollama/nomic-embed-text', provider: 'ollama', name: 'nomic-embed-text', dimension: 768 },
  { id: 'ollama/mxbai-embed-large', provider: 'ollama', name: 'mxbai-embed-large', dimension: 1024 },
  { id: 'ollama/all-minilm', provider: 'ollama', name: 'all-minilm', dimension: 384 },
];

/**
 * 嵌入模型注册表
 *
 * 职责：
 * - 管理嵌入模型注册
 * - 查询模型信息
 * - 切换活跃模型
 * - 自动检测模型维度
 */
export class ModelRegistry {
  private models: Map<string, EmbeddingModel> = new Map();
  private activeModelId: string | null = null;
  private embeddingServices: Map<string, EmbeddingService> = new Map();
  private initialized = false;

  constructor(private config: ModelRegistryConfig = {}) {}

  /**
   * 初始化注册表
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 注册预定义模型
    const models = this.config.predefinedModels ?? PREDEFINED_MODELS;
    for (const model of models) {
      await this.registerPredefined(model);
    }

    // 设置默认活跃模型
    if (this.config.defaultModelId && this.models.has(this.config.defaultModelId)) {
      this.activeModelId = this.config.defaultModelId;
    } else if (this.models.size > 0) {
      // 使用第一个注册的模型作为默认
      this.activeModelId = this.models.keys().next().value ?? null;
    }

    this.initialized = true;
    log.info('嵌入模型注册表已初始化', {
      modelCount: this.models.size,
      activeModel: this.activeModelId,
    });
  }

  /**
   * 注册预定义模型
   */
  private async registerPredefined(model: PredefinedModel): Promise<void> {
    const parsed = PredefinedModelSchema.safeParse(model);
    if (!parsed.success) {
      log.warn('无效的预定义模型配置', { model, errors: parsed.error.issues });
      return;
    }

    const now = new Date();
    const embeddingModel: EmbeddingModel = {
      id: parsed.data.id,
      provider: parsed.data.provider,
      name: parsed.data.name,
      dimension: parsed.data.dimension,
      isActive: false,
      status: 'ready',
      vectorCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.models.set(embeddingModel.id, embeddingModel);
    log.debug('预定义模型已注册', { id: embeddingModel.id, dimension: embeddingModel.dimension });
  }

  /**
   * 注册新模型
   *
   * 自动检测模型维度（如果 embeddingService 可用）
   */
  async register(
    options: EmbeddingModelRegisterOptions,
    embeddingService?: EmbeddingService
  ): Promise<EmbeddingModel> {
    // 生成模型 ID
    const id = options.id ?? `${options.provider}/${options.name}`;

    // 检查是否已存在
    if (this.models.has(id)) {
      const existing = this.models.get(id)!;
      log.debug('模型已存在，返回现有模型', { id });
      return existing;
    }

    // 检测维度
    let dimension = 0;
    if (embeddingService?.isAvailable()) {
      try {
        const testVector = await embeddingService.embed('test');
        dimension = testVector.length;
        log.info('自动检测模型维度', { id, dimension });
      } catch (error) {
        log.warn('无法自动检测模型维度', { id, error: String(error) });
      }
    }

    const now = new Date();
    const model: EmbeddingModel = {
      id,
      provider: options.provider,
      name: options.name,
      dimension,
      isActive: options.setActive ?? false,
      status: embeddingService?.isAvailable() ? 'ready' : 'error',
      vectorCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.models.set(id, model);

    // 存储嵌入服务引用
    if (embeddingService) {
      this.embeddingServices.set(id, embeddingService);
    }

    // 设置为活跃模型
    if (options.setActive) {
      this.activeModelId = id;
      // 更新所有模型的活跃状态
      for (const [modelId, m] of this.models) {
        m.isActive = modelId === id;
        m.updatedAt = now;
      }
    }

    log.info('新模型已注册', { id, dimension, isActive: model.isActive });
    return model;
  }

  /**
   * 注销模型
   */
  async unregister(modelId: string): Promise<boolean> {
    const model = this.models.get(modelId);
    if (!model) {
      log.warn('注销失败：模型不存在', { modelId });
      return false;
    }

    if (model.isActive) {
      log.warn('无法注销活跃模型', { modelId });
      return false;
    }

    this.models.delete(modelId);
    this.embeddingServices.delete(modelId);

    log.info('模型已注销', { modelId });
    return true;
  }

  /**
   * 获取模型信息
   */
  getModel(modelId: string): EmbeddingModel | undefined {
    return this.models.get(modelId);
  }

  /**
   * 获取活跃模型
   */
  getActiveModel(): EmbeddingModel | undefined {
    if (!this.activeModelId) return undefined;
    return this.models.get(this.activeModelId);
  }

  /**
   * 获取活跃模型 ID
   */
  getActiveModelId(): string | null {
    return this.activeModelId;
  }

  /**
   * 获取所有已注册模型
   */
  getAllModels(): EmbeddingModel[] {
    return Array.from(this.models.values());
  }

  /**
   * 获取可用模型列表
   */
  getAvailableModels(): EmbeddingModel[] {
    return this.getAllModels().filter(m => m.status === 'ready');
  }

  /**
   * 切换活跃模型
   *
   * @returns 切换结果，包含是否需要迁移
   */
  async switchActiveModel(modelId: string): Promise<{
    success: boolean;
    previousModelId?: string;
    needsMigration: boolean;
    error?: string;
  }> {
    const newModel = this.models.get(modelId);
    if (!newModel) {
      return { success: false, needsMigration: false, error: 'Model not found' };
    }

    if (newModel.status !== 'ready') {
      return { success: false, needsMigration: false, error: 'Model not ready' };
    }

    const previousModelId = this.activeModelId;
    const previousModel = previousModelId ? this.models.get(previousModelId) : undefined;

    // 检查是否需要迁移
    const needsMigration = previousModel !== undefined &&
      previousModel.vectorCount > 0 &&
      previousModel.dimension !== newModel.dimension;

    const now = new Date();

    // 更新活跃状态
    for (const [id, m] of this.models) {
      m.isActive = id === modelId;
      m.updatedAt = now;
    }

    this.activeModelId = modelId;

    log.info('活跃模型已切换', {
      previousModel: previousModelId,
      newModel: modelId,
      needsMigration,
    });

    return {
      success: true,
      previousModelId: previousModelId ?? undefined,
      needsMigration,
    };
  }

  /**
   * 更新模型向量计数
   */
  updateVectorCount(modelId: string, count: number): void {
    const model = this.models.get(modelId);
    if (model) {
      model.vectorCount = count;
      model.updatedAt = new Date();
    }
  }

  /**
   * 增加模型向量计数
   */
  incrementVectorCount(modelId: string, delta: number = 1): void {
    const model = this.models.get(modelId);
    if (model) {
      model.vectorCount += delta;
      model.updatedAt = new Date();
    }
  }

  /**
   * 更新模型状态
   */
  updateModelStatus(modelId: string, status: EmbeddingModel['status']): void {
    const model = this.models.get(modelId);
    if (model) {
      model.status = status;
      model.updatedAt = new Date();
      log.debug('模型状态已更新', { modelId, status });
    }
  }

  /**
   * 获取嵌入服务
   */
  getEmbeddingService(modelId?: string): EmbeddingService | undefined {
    const id = modelId ?? this.activeModelId ?? undefined;
    if (!id) return undefined;
    return this.embeddingServices.get(id);
  }

  /**
   * 设置嵌入服务
   */
  setEmbeddingService(modelId: string, service: EmbeddingService): void {
    this.embeddingServices.set(modelId, service);

    const model = this.models.get(modelId);
    if (model) {
      model.status = service.isAvailable() ? 'ready' : 'error';
      model.updatedAt = new Date();
    }
  }

  /**
   * 检测模型维度（使用提供的嵌入服务）
   */
  async detectDimension(embeddingService: EmbeddingService): Promise<number> {
    if (!embeddingService.isAvailable()) {
      throw new Error('Embedding service not available');
    }

    const testVector = await embeddingService.embed('test');
    return testVector.length;
  }

  /**
   * 获取模型统计信息
   */
  getStats(): {
    totalModels: number;
    availableModels: number;
    activeModelId: string | null;
    totalVectors: number;
  } {
    const models = this.getAllModels();
    return {
      totalModels: models.length,
      availableModels: models.filter(m => m.status === 'ready').length,
      activeModelId: this.activeModelId,
      totalVectors: models.reduce((sum, m) => sum + m.vectorCount, 0),
    };
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.models.clear();
    this.embeddingServices.clear();
    this.activeModelId = null;
    this.initialized = false;
    log.info('模型注册表已清空');
  }
}

/**
 * 创建模型注册表实例
 */
export function createModelRegistry(config?: ModelRegistryConfig): ModelRegistry {
  return new ModelRegistry(config);
}
