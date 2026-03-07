/**
 * Runtime 模块入口
 */

// Container
export { ContainerImpl, container } from './container';

// Event Bus
export { EventBus, eventBus } from './event-bus';

// Hook System
export { HookSystem, hookSystem, type Hook } from './hook-system';

// Pipeline
export { Pipeline, type Middleware } from './pipeline';

// Message Bus
export { MessageBus } from './bus';

// Executor
export { AgentExecutor, type AgentExecutorConfig, type ToolRegistryLike } from './executor';

// ReAct Agent
export { ReActAgent, type ReActAgentConfig, type ReActTool, type ReActResult } from './react';
export {
  ReActResponseSchema,
  PredefinedActions,
  parseReActResponse,
  ToolToReActAction,
  ReActActionToTool,
  type ReActResponse,
  type ReActAction,
  type PredefinedAction,
} from './react-types';

// Core Types (from providers)
export {
  type LLMMessage,
  type MessageRole,
  type MessageContent,
  type ContentPart,
  type TextContentPart,
  type ImageContentPart,
  type ResourceContentPart,
  type ProviderContentPart,
  type ImageUrlContentPart,
  type ToolCall,
  type UsageStats,
  type LLMResponse,
  type LLMToolDefinition,
  type GenerationConfig,
} from './types';

// Loop Detection
export { LoopDetector } from './loop-detection';
export type { LoopDetectionResult, LoopDetectorConfig } from './types';

// Message Manager
export { MessageHistoryManager } from './message-manager';
export type { MessageManagerConfig } from './types';

// Agent Types
export type { AgentLoopConfig, AgentLoopResult, AgentEvent } from './types';

// Memory System
export {
  // Types
  type MemoryEntryType,
  type MemoryMetadata,
  type MemoryEntry,
  type Summary,
  type MemoryStats,
  type MemoryFilter,
  type SearchOptions,
  type MemoryStoreConfig,
  type CleanupResult,
  type EmbeddingService,
  // Embedding
  OpenAIEmbedding,
  NoEmbedding,
  createEmbeddingService,
  // Store
  MemoryStore,
  // Summarizer
  ConversationSummarizer,
  type SummarizerConfig,
  // Classifier
  classifyMemory,
  classifyMemoriesBatch,
  getMemoryTypeDescription,
  getMemoryTypeIcon,
} from './memory';

// Citation System (RAG 级别溯源)
export {
  type Citation,
  type CitedResponse,
  type CitationGeneratorConfig,
} from './types';
export {
  CitationGenerator,
  createCitationGenerator,
} from './citation';

// Knowledge Base System
export {
  // Types
  type KnowledgeBaseConfig,
  type KnowledgeDocument,
  type KnowledgeDocMetadata,
  type KnowledgeDocStatus,
  type KnowledgeDocType,
  type KnowledgeChunk,
  type KnowledgeSearchResult,
  type KnowledgeBaseStats,
  type BackgroundBuildStatus,
  // Manager
  KnowledgeBaseManager,
  getKnowledgeBase,
  setKnowledgeBase,
  // Utils
  getKnowledgeDocType,
  isKnowledgeFileSupported,
  KNOWLEDGE_FILE_EXTENSIONS,
} from './knowledge';

// Channel Gateway
export { ChannelGatewayImpl } from './gateway';

// Logging System
export {
  // Types
  type LogLevel,
  type LoggingConfig,
  type TraceContext,
  type LogType,
  type BaseLogEntry,
  type MethodCallLog,
  type LLMCallLog,
  type ToolCallLog,
  type EventLog,
  type LogEntry,
  type TracerOptions,
  type LogEventListener,
  DEFAULT_LOGGING_CONFIG,
  // Config
  initLogging,
  closeLogging,
  isLoggingInitialized,
  getLogFilePath,
  createModuleLogger,
  subscribeToLogs,
  // Tracer
  Tracer,
  getTracer,
  setTracer,
  traceMethod,
  traced,
} from './logging';