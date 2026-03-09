/**
 * 记忆系统模块入口
 *
 * 提供记忆系统的基础能力：
 * - 存储（store）
 * - 嵌入（embedding）
 * - 检索（searcher）
 * - 工作内存（working-memory）
 *
 * 高级封装从 SDK 重导出：
 * - 记忆管理器（manager）
 * - 摘要器（summarizer）
 * - 分类器（classifiers）
 * - 评分器（scoring）
 * - 偏好处理（handlers）
 * - 遗忘机制（forgetting）
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

// ============ SDK 高级封装 - 记忆管理器 ============
export {
  MemoryManager,
  createMemoryManager,
  MemoryManagerConfigSchema,
  type MemoryManagerConfig,
  type MemoryStoreAdapter,
  type MemorySearcherAdapter,
  type ClassifyFunction,
  type SummarizerAdapter,
} from '@micro-agent/sdk';

// ============ SDK 高级封装 - 摘要器 ============
export {
  ConversationSummarizer,
  createSummarizer,
  SUMMARIZER_DEFAULT_CONFIG,
  type Summary,
  type SummaryType,
  type TodoItem,
  type TimeRange,
  type SummarizerConfig,
  type SummarizeOptions,
} from '@micro-agent/sdk';

// ============ SDK 高级封装 - 分类器 ============
export {
  MemoryClassifier,
  classifyMemory,
  getMemoryTypeDescription,
  getMemoryTypeIcon,
  ClassificationResultSchema,
  type ClassificationResult,
  type ClassifyOptions,
  PreferenceClassifier,
  detectPreference,
  detectPreferencesBatch,
  PreferenceDetectionResultSchema,
  type PreferenceType,
  type PreferenceDetectionResult,
  type BatchDetectionResult,
} from '@micro-agent/sdk';

// ============ SDK 高级封装 - 评分器 ============
export {
  ImportanceScorer,
  calculateImportance,
  getDefaultImportance,
  ImportanceScorerConfigSchema,
  type ImportanceScorerConfig,
  type ImportanceFactors,
  type ScoringWeights,
} from '@micro-agent/sdk';

// ============ SDK 高级封装 - 偏好处理 ============
export {
  PreferenceHandler,
  createPreferenceHandler,
  PreferenceHandlerConfigSchema,
  type PreferenceRecord,
  type PreferenceHandlerConfig,
  type HandleResult,
  type BatchHandleResult,
  type PreferenceStoreAdapter,
} from '@micro-agent/sdk';

// ============ SDK 高级封装 - 遗忘机制 ============
export {
  // 遗忘引擎
  ForgettingEngine,
  ForgettingEngineConfigSchema,
  createForgettingEngine,
  type ForgettingEngineConfig,
  type ForgettingCandidate,
  type ForgettingResult,
  type MemoryStoreAdapter as ForgettingMemoryStoreAdapter,
  type ProtectionManagerAdapter,
  // 遗忘调度器
  ForgettingScheduler,
  ForgettingSchedulerConfigSchema,
  createForgettingScheduler,
  type ForgettingSchedulerConfig,
  type SchedulerStatus,
  type ExecutionRecord,
  type SchedulerState,
  // 保护管理器
  ProtectionManager,
  ProtectionManagerConfigSchema,
  createProtectionManager,
  isStatusProtected,
  type ProtectionReason,
  type ProtectionRecord,
  type ProtectionManagerConfig,
  type ProtectionEvent,
  type ProtectionEventHandler,
} from '@micro-agent/sdk';