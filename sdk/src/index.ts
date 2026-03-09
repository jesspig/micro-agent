/**
 * MicroAgent SDK Client
 *
 * 稳定的客户端 API，适合大多数开发者使用。
 * 如需访问运行时内部实现，请使用 @micro-agent/sdk/runtime。
 *
 * 导出结构：
 * 1. SDK Client Types - 客户端类型定义
 * 2. SDK Client - 客户端实例
 * 3. API Modules - 各功能模块 API
 * 4. Transport - 传输层实现
 * 5. Client Core - 客户端核心组件
 * 6. Tool - 工具模块
 * 7. Skill - 技能模块
 * 8. Define - 定义函数
 */

// ============================================================
// SDK Client Types
// ============================================================
export type {
  // 传输配置
  TransportType,
  LogOutputType,
  LogHandler,
  IPCConfig,
  HTTPConfig,
  WebSocketConfig,
  SDKClientConfig,
  // 流式响应
  StreamChunk,
  StreamHandler,
  // 会话
  SessionKey,
  // 配置类型
  ToolConfig,
  SkillConfig,
  MemoryConfig,
  KnowledgeConfig,
  RuntimeConfig,
  // 消息类型
  PromptTemplate,
  LLMMessage,
  ToolCall,
  // 执行上下文
  ExecutionContext,
  TaskStatus,
  // 请求响应
  SDKRequest,
  SDKResponse,
  // 记忆类型
  MemoryEntry,
  MemorySearchResult,
} from './client/types';

// ============================================================
// SDK Client
// ============================================================
export { MicroAgentClient, createClient } from './api/client';

// ============================================================
// API Modules
// ============================================================

// 会话 API
export { SessionAPI } from './api/session';

// 聊天 API
export { ChatAPI, type ChatOptions } from './api/chat';

// 任务 API
export { TaskAPI, type TaskInfo } from './api/task';

// 记忆 API
export {
  MemoryAPI,
  type MemorySearchOptions,
  type SearchMode,
  type MemoryType,
  type SortOptions,
  type MemorySearchResponse,
  type MemoryStoreOptions,
  type MemoryStoreResponse,
  type MemoryDetail,
  type MemoryStats,
} from './api/memory';

// 配置 API
export { ConfigAPI } from './api/config';

// 提示词 API
export { PromptAPI } from './api/prompt';

// 嵌入模型 API
export {
  EmbeddingAPI,
  type EmbeddingModelInfo,
  type RegisterModelOptions,
  type SwitchModelOptions,
  type SwitchModelResult,
  type StartMigrationOptions,
  type MigrationInfo,
  type MigrationProgressInfo,
  type RollbackResult,
  type VectorStats,
  type ModelListResponse,
} from './api/embedding';

// ============================================================
// Transport - 传输层
// ============================================================
export { HTTPTransport } from './transport/http';
export { WebSocketTransport } from './transport/websocket';
export { IPCTransport } from './transport/ipc';

// ============================================================
// Client Core - 客户端核心
// ============================================================
export { RequestBuilder } from './client/request-builder';
export { ResponseParser } from './client/response-parser';
export { ErrorHandler, SDKError } from './client/error-handler';
export type { SDKErrorCode } from './client/error-handler';

// ============================================================
// Tool - 工具模块
// ============================================================
export { ToolBuilder, createToolBuilder } from './tool/builder';
export { BaseTool } from './tool/base';
export type { ToolBuilderOptions } from './tool/builder';

// ============================================================
// Skill - 技能模块
// ============================================================
export type {
  Skill,
  SkillSummary,
  SkillRequires,
  SkillMetadata,
  SkillInstallSpec,
} from './skill/types';

// ============================================================
// Define - 定义函数
// ============================================================
export { defineTool, defineChannel, defineSkill } from './define';
export type {
  DefineToolOptions,
  DefineChannelOptions,
  DefineSkillOptions,
} from './define';

// ============================================================
// Memory - 高级记忆功能
// ============================================================

// Manager - 记忆管理器
export {
  MemoryManager,
  createMemoryManager,
  MemoryManagerConfigSchema,
  type MemoryManagerConfig,
  type MemoryStoreAdapter,
  type MemorySearcherAdapter,
  type ClassifyFunction,
  type SummarizerAdapter,
} from './memory';

// Consolidation - 自动整合
export {
  ConsolidationTrigger,
  createConsolidationTrigger,
  ConsolidationTriggerConfigSchema,
  IdleDetector,
  createIdleDetector,
  IdleDetectorConfigSchema,
  FactExtractor,
  createFactExtractor,
  ConversationSummarizer,
  createSummarizer,
  DEFAULT_CONFIG as SUMMARIZER_DEFAULT_CONFIG,
  ConsolidationExecutor,
  createConsolidationExecutor,
  ConsolidationExecutorConfigSchema,
  type ConsolidationTriggerConfig,
  type TriggerStrategy,
  type TriggerEvent,
  type TriggerCallback,
  type TriggerState,
  type IdleDetectorConfig,
  type IdleState,
  type IdleCallback,
  type FactType,
  type ExtractedFact,
  type ExtractionOptions,
  type ExtractionResult,
  type FactExtractorConfig,
  type Summary,
  type SummaryType,
  type TodoItem,
  type TimeRange,
  type SummarizerConfig,
  type SummarizeOptions,
  type ConsolidationExecutorConfig,
  type ConsolidationResult,
  type ConsolidationStats,
  type MessageProvider,
} from './memory';

// Forgetting - 遗忘曲线
export {
  ForgettingEngine,
  ForgettingEngineConfigSchema,
  createForgettingEngine,
  ForgettingScheduler,
  ForgettingSchedulerConfigSchema,
  createForgettingScheduler,
  ProtectionManager,
  ProtectionManagerConfigSchema,
  createProtectionManager,
  isStatusProtected,
  type ForgettingEngineConfig,
  type ForgettingCandidate,
  type ForgettingResult,
  type MemoryStoreAdapter as ForgettingMemoryStoreAdapter,
  type ProtectionManagerAdapter,
  type ForgettingSchedulerConfig,
  type SchedulerStatus,
  type ExecutionRecord,
  type SchedulerState,
  type ProtectionReason,
  type ProtectionRecord,
  type ProtectionManagerConfig,
  type ProtectionEvent,
  type ProtectionEventHandler,
} from './memory';

// Classifiers - AI 分类
export {
  PreferenceClassifier,
  detectPreference,
  detectPreferencesBatch,
  PreferenceDetectionResultSchema,
  MemoryClassifier,
  classifyMemory,
  getMemoryTypeDescription,
  getMemoryTypeIcon,
  ClassificationResultSchema,
  type PreferenceType,
  type PreferenceDetectionResult,
  type BatchDetectionResult,
  type ClassificationResult,
  type ClassifyOptions,
} from './memory';

// Scoring - 评分器
export {
  ImportanceScorer,
  calculateImportance,
  getDefaultImportance,
  ImportanceScorerConfigSchema,
  type ImportanceScorerConfig,
  type ImportanceFactors,
  type ScoringWeights,
} from './memory';

// Handlers - 处理器
export {
  PreferenceHandler,
  createPreferenceHandler,
  PreferenceHandlerConfigSchema,
  type PreferenceRecord,
  type PreferenceHandlerConfig,
  type HandleResult,
  type BatchHandleResult,
  type PreferenceStoreAdapter,
} from './memory';

// Metrics - 指标收集
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
} from './memory';

// Security - 安全增强
export {
  SensitiveDetector,
  getDefaultDetector,
  resetDefaultDetector,
  DetectionRuleSchema,
  DEFAULT_RULES,
  KeyManager,
  getDefaultKeyManager,
  resetDefaultKeyManager,
  KeyManagerConfigSchema,
  EncryptionService,
  getDefaultEncryptionService,
  resetDefaultEncryptionService,
  EncryptionConfigSchema,
  createSecurityContext,
  type SensitiveType,
  type DetectionRule,
  type DetectionMatch,
  type DetectionResult,
  type SensitiveDetectorConfig,
  type KeySource,
  type KeyInfo,
  type KeyManagerConfig,
  type EncryptedData,
  type EncryptionConfig,
} from './memory';

// ============================================================
// Session - 会话高级功能
// ============================================================

// TitleGenerator - 智能标题生成
export {
  TitleGenerator,
  generateSessionTitle,
  generateSessionSummary,
  type TitleGeneratorConfig,
  type TitleGenerationResult,
} from './session';

// ContextInjector - 会话上下文注入
export {
  SessionContextInjector,
  buildContextMessage,
  ContextInjectorConfigSchema,
  type ContextInjectorConfig,
  type ContextInjectionResult,
  type MessageProvider as SessionMessageProvider,
  type SessionInfoProvider,
  type SimilarSessionResult,
  type SimilarSessionSearcher,
} from './session';

// ============================================================
// Knowledge - 高级知识库功能
// ============================================================

// Types
export type {
  KnowledgeDocType,
  KnowledgeDocStatus,
  KnowledgeDocMetadata,
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeSearchResult as KnowledgeSearchResultType,
  KnowledgeBaseConfig,
  BackgroundBuildConfig,
  KnowledgeBaseStats,
  EmbeddingServiceProvider,
} from './knowledge/types';

export {
  KNOWLEDGE_FILE_EXTENSIONS,
  getKnowledgeDocType,
  isKnowledgeFileSupported,
} from './knowledge/types';

// Manager - 知识库管理器
export {
  KnowledgeBaseManager,
  createKnowledgeBaseManager,
  getKnowledgeBase,
  setKnowledgeBase,
} from './knowledge/manager';

// Searcher - 混合检索
export {
  KnowledgeSearcher,
  createKnowledgeSearcher,
  KnowledgeSearcherConfigSchema,
  type KnowledgeSearcherConfig,
  type SearchOptions as KnowledgeSearchOptions,
  type KnowledgeSearchResult,
  type ChunkVectorRecord,
} from './knowledge/searcher';

// Source Annotator - 来源标注
export {
  SourceAnnotator,
  createSourceAnnotator,
  type AnnotatedResult,
  type SourceAnnotatorConfig,
} from './knowledge/searcher';

// ============================================================
// LLM - LLM Provider 高级封装
// ============================================================

// Router - 模型路由器
export {
  ModelRouter,
  createModelRouter,
} from './llm';

// Factory - Provider 工厂函数
export {
  createLLMProvider,
  createProvider,
  detectVendor,
  getModelCapabilities,
  supportsThinking,
  type LLMProviderConfig,
  type Provider,
  type LLMConfig,
} from './llm';

// Types - LLM 类型定义
export type {
  ModelConfig,
  ModelRouterConfig,
  RouteResult,
  LLMProvider,
  LLMResponse,
  LLMToolDefinition,
  GenerationConfig,
  ProviderCapabilities,
  TaskType,
  OpenAIConfig,
  DeepSeekConfig,
  GLMConfig,
  KimiConfig,
  MiniMaxConfig,
  OllamaConfig,
  OpenAICompatibleConfig,
} from './llm';

// ============================================================
// Config - 配置高级功能
// ============================================================

// Types - 配置类型（注意：MemoryConfig 和 KnowledgeBaseConfig 已在上方导出，此处使用别名避免重复）
export type {
  Config,
  AgentConfig,
  ModelsConfig,
  ModelConfig as ConfigModelConfig,
  ProviderConfig,
  ProviderEntry,
  WorkspaceConfig,
  RuntimeMemoryConfig,
  ExecutorConfig,
  LoopDetectionConfig,
  CitationConfig,
  RuntimeKnowledgeBaseConfig,
} from './config';

// Schema - 配置 Schema
export {
  ConfigSchema,
  AgentConfigSchema,
  ModelsConfigSchema,
  ModelConfigSchema,
  ProviderConfigSchema,
  ChannelConfigSchema,
  WorkspaceConfigSchema,
  MemoryConfigSchema,
  ExecutorConfigSchema,
  LoopDetectionConfigSchema,
  CitationConfigSchema,
  parseModelConfigs,
  parseWorkspaces,
} from './config';

// Loader - 配置加载器
export {
  loadConfig,
  getConfigStatus,
  ConfigLevel,
  type LoadConfigOptions,
  type ConfigStatus,
} from './config';

// Merger - 配置合并器
export {
  mergeConfigs,
  getConfigDiff,
  type ConfigScope,
  type ConfigSource,
  type MergedConfigResult,
} from './config';

// Utils - 工具函数
export {
  deepMerge,
  resolveEnvVars,
  findConfigFile,
  loadConfigFile,
  buildPathChain,
  CONFIG_FILE_NAME,
} from './config';

// Defaults - 默认配置
export {
  getBuiltinDefaults,
  USER_CONFIG_DIR,
  USER_DATA_DIR,
  USER_LOGS_DIR,
  USER_KNOWLEDGE_DIR,
  USER_MEMORY_DIR,
  USER_WORKSPACE_DIR,
  USER_SESSIONS_DIR,
  USER_SKILLS_DIR,
  USER_EXTENSIONS_DIR,
  TODO_STORAGE_PATH,
  DEFAULT_EXECUTOR_CONFIG,
  DEFAULT_GENERATION_CONFIG,
  DEFAULT_MEMORY_CONFIG,
  DEFAULT_CONTEXT_BUDGET,
} from './config';

// Workspace - 工作区访问控制
export {
  validateWorkspaceAccess,
  canAccessWorkspace,
  getUserConfigPath,
  createDefaultUserConfig,
  expandPath,
} from './config';

// Template - 模板文件处理
export {
  TEMPLATE_FILE_NAMES,
  findTemplateFile,
  loadTemplateFile,
  loadAllTemplateFiles,
} from './config';