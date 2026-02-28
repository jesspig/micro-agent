/**
 * 记忆系统模块入口
 */

// Types
export type {
  MemoryEntryType,
  MemoryMetadata,
  MemoryEntry,
  Summary,
  MemoryStats,
  MemoryFilter,
  SearchOptions,
  MemoryStoreConfig,
  CleanupResult,
  EmbeddingService,
  // 多嵌入模型相关类型
  VectorColumnName,
  EmbedModelInfo,
  MigrationState,
  MigrationStatus,
  MigrationEvent,
  MigrationResult,
  RetryResult,
  FailedRecord,
  MultiEmbedConfig,
  SearchMode,
} from './types';

// Embedding
export { OpenAIEmbedding, NoEmbedding, createEmbeddingService } from './embedding';

// Store
export { MemoryStore } from './store';

// Migration
export { EmbeddingMigration, AdaptiveInterval } from './migration';
export type { AdaptiveIntervalConfig } from './migration';

// Summarizer
export { ConversationSummarizer, type SummarizerConfig } from './summarizer';
