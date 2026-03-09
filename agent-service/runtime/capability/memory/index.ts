/**
 * 记忆系统模块入口
 *
 * 提供记忆系统的基础能力：
 * - 存储（store）
 * - 嵌入（embedding）
 * - 检索（searcher）
 * - 工作内存（working-memory）
 * - 简化版管理器（simple-manager）
 *
 * ========== 模块迁移记录 (完成于 2026-03-09) ==========
 * 状态: 已完成
 * 高级封装功能已迁移至 SDK：
 * - Summarizer → sdk/src/memory/consolidation/summarizer.ts
 * - MemoryClassifier → sdk/src/memory/classifiers/memory-classifier.ts
 * - PreferenceClassifier → sdk/src/memory/classifiers/preference-classifier.ts
 * - ForgettingEngine → sdk/src/memory/forgetting/forgetting-engine.ts
 * - ForgettingScheduler → sdk/src/memory/forgetting/forgetting-scheduler.ts
 * - ImportanceScorer → sdk/src/memory/scoring/importance-scorer.ts
 * - MetricsCollector → sdk/src/memory/metrics/metrics-collector.ts
 * - ConsolidationExecutor → sdk/src/memory/consolidation/consolidation-executor.ts
 */

// ============ 基础类型 ============
export type {
  MemoryType,
  MemoryTypeString,
  MemoryEntry,
  MemorySearchResult,
  MemorySearchOptions,
  MemoryMetadata,
  MemoryStats,
  MemoryFilter,
} from '../../../types/memory';

export type {
  VectorColumnName,
  EmbedModelInfo,
  FailedRecord,
  MigrationState,
  MigrationStatus,
  MigrationResult,
  MultiEmbedConfig,
  MemoryStoreConfig,
  SearchMode,
  CleanupResult,
  EmbeddingService,
  SearchOptions,
} from './types';

// ============ 基础能力 - 存储 ============
export { MemoryStore } from './store';

// 注：MemoryVectorStore 是底层实现，通过 MemoryStore 使用

// ============ 基础能力 - 嵌入 ============
export { OpenAIEmbedding, NoEmbedding, createEmbeddingService } from './embedding-service';

export {
  ModelRegistry,
  createModelRegistry,
  PREDEFINED_MODELS,
  PredefinedModelSchema,
  type PredefinedModel,
  type ModelRegistryConfig,
  VectorAdapter,
  createVectorAdapter,
  type VectorAdapterConfig,
  type VectorStoreResult,
  type BatchStoreResult,
  MigrationService,
  createMigrationService,
  type MigrationServiceConfig,
  type MigrationEventType,
  type MigrationEventHandler,
} from './embedding';

// ============ 基础能力 - 检索 ============
export { MemorySearcher } from './search';

export { FTSSearcher } from './searcher/fts-searcher';
export { HybridSearcher } from './searcher/hybrid-searcher';
export { FallbackSearcher } from './searcher/fallback-searcher';
export { ResultSorter } from './searcher/result-sorter';
export { RRFFusion, rrfUtils } from './searcher/rrf-fusion';
export { TemporalDecayScorer, forgettingCurve } from './searcher/temporal-decay';

// ============ 基础能力 - 工作内存 ============
export {
  WorkingMemoryManager,
  createWorkingMemoryManager,
  type WorkingMemoryManagerConfig,
  type CreateGoalParams,
  type UpdateGoalParams,
  type CreateSubTaskParams,
  type UpdateSubTaskParams,
} from './working-memory-manager';

// ============ 简化版管理器 ============
export {
  SimpleMemoryManager,
  type MemoryStoreAdapter,
  type MemorySearcherAdapter,
  type SimpleMemoryManagerConfig,
} from './simple-manager';
