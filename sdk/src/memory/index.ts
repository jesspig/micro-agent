/**
 * SDK Memory 高级功能模块
 *
 * 提供记忆系统的高级功能：
 * - 记忆管理器（manager）
 * - 自动整合（consolidation）
 * - 遗忘曲线（forgetting）
 * - AI 分类（classifiers）
 * - 指标收集（metrics）
 * - 安全增强（security）
 */

// ============ Manager - 记忆管理器 ============
export {
  MemoryManager,
  createMemoryManager,
  MemoryManagerConfigSchema,
  type MemoryManagerConfig,
  type EmbeddingService,
  type MemoryStoreAdapter,
  type MemorySearcherAdapter,
  type ClassifyFunction,
  type SummarizerAdapter,
} from './manager';

// ============ Consolidation - 自动整合 ============
export {
  ConsolidationTrigger,
  createConsolidationTrigger,
  ConsolidationTriggerConfigSchema,
  type ConsolidationTriggerConfig,
  type TriggerStrategy,
  type TriggerEvent,
  type TriggerCallback,
  type TriggerState,
} from './consolidation/consolidation-trigger';

export {
  IdleDetector,
  createIdleDetector,
  IdleDetectorConfigSchema,
  type IdleDetectorConfig,
  type IdleState,
  type IdleCallback,
} from './consolidation/idle-detector';

export {
  FactExtractor,
  createFactExtractor,
  type FactType,
  type ExtractedFact,
  type ExtractionOptions,
  type ExtractionResult,
  type FactExtractorConfig,
} from './consolidation/fact-extractor';

export {
  ConversationSummarizer,
  createSummarizer,
  DEFAULT_CONFIG,
  type Summary,
  type SummaryType,
  type TodoItem,
  type TimeRange,
  type SummarizerConfig,
  type SummarizeOptions,
} from './consolidation/summarizer';

export {
  ConsolidationExecutor,
  createConsolidationExecutor,
  ConsolidationExecutorConfigSchema,
  type ConsolidationExecutorConfig,
  type ConsolidationResult,
  type ConsolidationStats,
  type MessageProvider,
} from './consolidation/consolidation-executor';

// ============ Forgetting - 遗忘曲线 ============
export {
  ForgettingEngine,
  ForgettingEngineConfigSchema,
  createForgettingEngine,
  type ForgettingEngineConfig,
  type ForgettingCandidate,
  type ForgettingResult,
  type MemoryStoreAdapter as ForgettingMemoryStoreAdapter,
  type ProtectionManagerAdapter,
} from './forgetting/forgetting-engine';

export {
  ForgettingScheduler,
  ForgettingSchedulerConfigSchema,
  createForgettingScheduler,
  type ForgettingSchedulerConfig,
  type SchedulerStatus,
  type ExecutionRecord,
  type SchedulerState,
} from './forgetting/forgetting-scheduler';

export {
  ProtectionManager,
  ProtectionManagerConfigSchema,
  createProtectionManager,
  isStatusProtected,
  type ProtectionReason,
  type ProtectionRecord,
  type ProtectionManagerConfig,
  type ProtectionEvent,
  type ProtectionEventHandler,
} from './forgetting/protection-manager';

// ============ Classifiers - AI 分类 ============
export {
  PreferenceClassifier,
  detectPreference,
  detectPreferencesBatch,
  PreferenceDetectionResultSchema,
  type PreferenceType,
  type PreferenceDetectionResult,
  type BatchDetectionResult,
} from './classifiers/preference-classifier';

export {
  MemoryClassifier,
  classifyMemory,
  getMemoryTypeDescription,
  getMemoryTypeIcon,
  ClassificationResultSchema,
  type ClassificationResult,
  type ClassifyOptions,
} from './classifiers/memory-classifier';

// ============ Scoring - 评分器 ============
export {
  ImportanceScorer,
  calculateImportance,
  getDefaultImportance,
  ImportanceScorerConfigSchema,
  type ImportanceScorerConfig,
  type ImportanceFactors,
  type ScoringWeights,
} from './scoring/importance-scorer';

// ============ Handlers - 处理器 ============
export {
  PreferenceHandler,
  createPreferenceHandler,
  PreferenceHandlerConfigSchema,
  type PreferenceRecord,
  type PreferenceHandlerConfig,
  type HandleResult,
  type BatchHandleResult,
  type PreferenceStoreAdapter,
} from './handlers/preference-handler';

// ============ Metrics - 指标收集 ============
export {
  MetricsCollector,
  getMetricsCollector,
  resetMetricsCollector,
  MEMORY_METRICS,
  type MetricType,
  type MetricLabels,
  type MetricPoint,
  type HistogramBucket,
  type HistogramStats,
  type MetricDefinition,
  type MetricsSnapshot,
  type MetricsCollectorConfig,
} from './metrics/metrics-collector';

// ============ Security - 安全增强 ============
// 敏感信息检测器
export {
  SensitiveDetector,
  getDefaultDetector,
  resetDefaultDetector,
  DetectionRuleSchema,
  DEFAULT_RULES,
} from './security/sensitive-detector';

export type {
  SensitiveType,
  DetectionRule,
  DetectionMatch,
  DetectionResult,
  SensitiveDetectorConfig,
} from './security/sensitive-detector';

// 密钥管理器
export {
  KeyManager,
  getDefaultKeyManager,
  resetDefaultKeyManager,
  KeyManagerConfigSchema,
} from './security/key-manager';

export type {
  KeySource,
  KeyInfo,
  KeyManagerConfig,
} from './security/key-manager';

// 加密服务
export {
  EncryptionService,
  getDefaultEncryptionService,
  resetDefaultEncryptionService,
  EncryptionConfigSchema,
} from './security/encryption';

export type {
  EncryptedData,
  EncryptionConfig,
} from './security/encryption';

// 安全上下文创建
export { createSecurityContext } from './security/index';
