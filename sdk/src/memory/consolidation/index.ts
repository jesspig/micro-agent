/**
 * 整合模块导出
 *
 * 自动记忆整合功能
 */

// 触发器
export {
  ConsolidationTrigger,
  createConsolidationTrigger,
  ConsolidationTriggerConfigSchema,
  type ConsolidationTriggerConfig,
  type TriggerStrategy,
  type TriggerEvent,
  type TriggerCallback,
  type TriggerState,
} from './consolidation-trigger';

// 空闲检测器
export {
  IdleDetector,
  createIdleDetector,
  IdleDetectorConfigSchema,
  type IdleDetectorConfig,
  type IdleState,
  type IdleCallback,
} from './idle-detector';

// 事实提取器
export {
  FactExtractor,
  createFactExtractor,
  type FactType,
  type ExtractedFact,
  type ExtractionOptions,
  type ExtractionResult,
  type FactExtractorConfig,
} from './fact-extractor';

// 摘要器
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
} from './summarizer';

// 整合执行器
export {
  ConsolidationExecutor,
  createConsolidationExecutor,
  ConsolidationExecutorConfigSchema,
  type ConsolidationExecutorConfig,
  type ConsolidationResult,
  type ConsolidationStats,
  type MessageProvider,
} from './consolidation-executor';
