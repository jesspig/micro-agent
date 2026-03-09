/**
 * 嵌入模块入口
 *
 * 提供嵌入模型管理、向量存储和迁移功能。
 */

// 类型导出
export type {
  EmbeddingModel,
  EmbeddingVector,
  EmbeddingMigration,
  MigrationConfig,
  MigrationProgress,
  MigrationStatus,
  ModelSwitchResult,
  EmbeddingModelRegisterOptions,
  VectorSearchOptions,
} from '../../../../types/embedding';

// 模型注册表
export {
  ModelRegistry,
  createModelRegistry,
  PREDEFINED_MODELS,
  PredefinedModelSchema,
  type PredefinedModel,
  type ModelRegistryConfig,
} from './model-registry';

// 向量适配器
export {
  VectorAdapter,
  createVectorAdapter,
  VectorAdapterConfigSchema,
  type VectorAdapterConfig,
  type VectorStoreResult,
  type BatchStoreResult,
} from './vector-adapter';

// 迁移服务
export {
  MigrationService,
  createMigrationService,
  MigrationServiceConfigSchema,
  type MigrationServiceConfig,
  type MigrationEventType,
  type MigrationEventHandler,
} from './migration-service';
