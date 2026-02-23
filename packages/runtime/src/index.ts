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
export { AgentExecutor, type AgentExecutorConfig, type ToolRegistryLike, type ReActPromptBuilder, type ObservationBuilder } from './executor';

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
} from './memory';

// Channel Gateway
export { ChannelGatewayImpl } from './gateway';