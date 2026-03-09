/**
 * MicroAgent SDK Runtime 模块
 * 
 * 直接 re-export agent-service 的运行时模块。
 * 仅供需要直接访问运行时内部实现的高级用户使用。
 * 
 * 大多数用户应该使用 @micro-agent/sdk/client 获取更稳定的 API。
 */

// ============ Types - 核心类型定义 ============
export * from '../../agent-service/types';

// ============ Infrastructure ============
// Container
export { ContainerImpl, container } from '../../agent-service/runtime/infrastructure/container';

// Event Bus
export { EventBus, eventBus } from '../../agent-service/runtime/infrastructure/event-bus';

// Message Bus
export { MessageBus } from '../../agent-service/runtime/infrastructure/message-bus';

// Session Store
export { SessionStore } from '../../agent-service/runtime/infrastructure/database';
export type { Session, SessionMessage, SessionMetadata, SessionStoreConfig } from '../../agent-service/runtime/infrastructure/database';

// Memory Store (原 cache 模块)
export { KVMemoryStore } from '../../agent-service/runtime/infrastructure/database';
export type { KVMemoryStoreConfig } from '../../agent-service/runtime/infrastructure/database';

// Config
export {
  loadConfig,
  getConfigStatus,
  ConfigLevel,
  parseModelConfigs,
  expandPath,
  findTemplateFile,
  createDefaultUserConfig,
} from '../../agent-service/runtime/infrastructure/config';
export type {
  Config,
  LoadConfigOptions,
  ConfigStatus,
} from '../../agent-service/runtime/infrastructure/config';

// Logging
export {
  getLogger,
  initLogging,
  closeLogging,
  isLoggingInitialized,
  getLogFilePath,
  createModuleLogger,
  subscribeToLogs,
  getTracer,
  setTracer,
  traceMethod,
  traced,
} from '../../agent-service/runtime/infrastructure/logging';
export type {
  LogLevel,
  LoggingConfig,
  TraceContext,
  LogType,
  BaseLogEntry,
  MethodCallLog,
  LLMCallLog,
  ToolCallLog,
  EventLog,
  LogEntry,
  TracerOptions,
  LogEventListener,
  MemoryOpLog,
} from '../../agent-service/runtime/infrastructure/logging';

// ============ Hook System ============
export { HookSystem, hookSystem } from '../../agent-service/runtime/hook-system';
export type { Hook, HookContext, HookResult } from '../../agent-service/runtime/hook-system';

// ============ Provider Layer ============
// LLM Providers - 从 SDK llm 模块导出（高级封装）
export {
  ModelRouter,
  createModelRouter,
  createLLMProvider,
  createProvider,
  detectVendor,
  getModelCapabilities,
  supportsThinking,
  type ModelConfig,
  type ModelRouterConfig,
  type RouteResult,
  type LLMProviderConfig,
  type Provider,
  type LLMConfig,
  type OpenAIConfig,
  type DeepSeekConfig,
  type GLMConfig,
  type KimiConfig,
  type MiniMaxConfig,
  type OllamaConfig,
  type OpenAICompatibleConfig,
} from './llm';

// Anthropic Provider - 保留在 agent-service 的独立实现
export {
  AnthropicProvider,
  createAnthropicProvider,
} from '../../agent-service/runtime/provider/llm/anthropic';
export type { AnthropicConfig } from '../../agent-service/runtime/provider/llm/anthropic';

// Embedding Providers
export {
  OpenAIEmbeddingProvider,
  createOpenAIEmbeddingProvider,
  LocalEmbeddingProvider,
  createLocalEmbeddingProvider,
} from '../../agent-service/runtime/provider/embedding';
export type {
  EmbeddingProvider,
  EmbeddingResult,
  OpenAIEmbeddingConfig,
  LocalEmbeddingConfig,
} from '../../agent-service/runtime/provider/embedding';

// Vector DB Providers
export {
  LanceDBProvider,
  createLanceDBProvider,
  LocalVectorProvider,
  createLocalVectorProvider,
} from '../../agent-service/runtime/provider/vector-db';
export type {
  VectorDBProvider,
  VectorRecord,
  SearchResult,
  LanceDBConfig,
  LocalVectorConfig,
} from '../../agent-service/runtime/provider/vector-db';

// ============ Capability Layer ============
// Tool System
export { ToolRegistry, createToolRegistry } from '../../agent-service/runtime/capability/tool-system';
export type { ToolRegistryConfig } from '../../agent-service/runtime/capability/tool-system';
// Builtin Tool Provider (for dependency injection)
export {
  registerBuiltinToolProvider,
  getBuiltinToolProvider,
  hasBuiltinToolProvider,
  clearBuiltinToolProvider,
} from '../../agent-service/runtime/capability/tool-system/builtin-registry';
export type { BuiltinToolProvider } from '../../agent-service/runtime/capability/tool-system/builtin-registry';

// Skill System
export { SkillRegistry, createSkillRegistry } from '../../agent-service/runtime/capability/skill-system';
export type { SkillRegistryConfig, SkillDefinition, SkillExample, SkillMatch } from '../../agent-service/runtime/capability/skill-system';
// Builtin Skill Provider (for dependency injection)
export {
  registerBuiltinSkillProvider,
  getBuiltinSkillProvider,
  hasBuiltinSkillProvider,
  clearBuiltinSkillProvider,
} from '../../agent-service/runtime/capability/skill-system/builtin-registry';
export type { BuiltinSkillProvider } from '../../agent-service/runtime/capability/skill-system/builtin-registry';

// MCP Client
export { MCPClient, createMCPClient } from '../../agent-service/runtime/capability/mcp';
export type {
  MCPClientConfig,
  MCPToolDefinition,
  MCPToolCall,
  MCPToolResult,
  MCPToolResultContent,
} from '../../agent-service/runtime/capability/mcp';

// Memory System - 基础能力
export {
  MemoryStore,
  OpenAIEmbedding,
  NoEmbedding,
  createEmbeddingService,
  MemorySearcher,
  forgettingCurve,
} from '../../agent-service/runtime/capability/memory';
export type {
  MemoryEntry,
  MemoryMetadata,
  MemoryStats,
  SearchOptions,
  MemoryFilter,
} from '../../agent-service/runtime/capability/memory';

// Memory System - SDK 高级封装
// 注：MemoryManager、ConversationSummarizer、classifyMemory 等高级封装
// 由 SDK 层提供，详见 @micro-agent/sdk/memory 模块

// Knowledge System - 基础能力
export {
  KnowledgeRetriever,
  createDocumentScanner,
  createDocumentIndexer,
  createRetriever,
} from '../../agent-service/runtime/capability/knowledge';
export type {
  KnowledgeBaseConfig,
  BackgroundBuildConfig,
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeSearchResult,
  RetrieverConfig,
} from '../../agent-service/runtime/capability/knowledge';

// Knowledge System - SDK 高级封装
export {
  KnowledgeBaseManager,
  setKnowledgeBase,
  getKnowledgeBase,
} from './index';

// Plugin System
export {
  ExtensionRegistry,
  createExtensionRegistry,
  ExtensionDiscovery,
  createExtensionDiscovery,
  ExtensionLoader,
  createExtensionLoader,
  HotReloadManager,
  createHotReloadManager,
} from '../../agent-service/runtime/capability/plugin-system';
export type {
  RegistryConfig,
  LoaderConfig,
  LoaderState,
  HotReloadConfig,
} from '../../agent-service/runtime/capability/plugin-system';

// ============ Kernel Layer ============
export { AgentOrchestrator } from '../../agent-service/runtime/kernel/orchestrator';
export type { OrchestratorConfig, StreamCallbacks } from '../../agent-service/runtime/kernel/orchestrator';

export { AgentPlanner } from '../../agent-service/runtime/kernel/planner';
export type { PlannerConfig, PlanResult } from '../../agent-service/runtime/kernel/planner';

export { ExecutionEngine } from '../../agent-service/runtime/kernel/execution-engine';
export type { ExecutionEngineConfig, ExecutionResult } from '../../agent-service/runtime/kernel/execution-engine';

export { ContextManager } from '../../agent-service/runtime/kernel/context-manager';
export type { ContextManagerConfig, ContextState } from '../../agent-service/runtime/kernel/context-manager';

// ============ Tool Helpers ============
// 工具结果创建辅助函数（通过 export * 已导出类型，此处仅导出函数）
export {
  createSuccessResult,
  createErrorResult,
  createToolError,
} from '../../agent-service/types';

// ============ Extension Types ============
// 插件系统类型定义（来自 @micro-agent/types）
export type {
  ExtensionType,
  ExtensionDescriptor,
  ExtensionContext,
  Extension,
  LoadedExtension,
  ExtensionDiscoveryResult,
  ExtensionChangeEvent,
} from '../../agent-service/types';

export {
  EXTENSION_TYPES,
  EXTENSION_TYPE_LABELS,
  getExtensionTypeDir,
  isValidExtensionType,
} from '../../agent-service/types';
