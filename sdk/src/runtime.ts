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

// Cache
export { KVMemoryStore } from '../../agent-service/runtime/infrastructure/cache';
export type { KVMemoryStoreConfig } from '../../agent-service/runtime/infrastructure/cache';

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
} from '../../agent-service/runtime/infrastructure/logging';

// ============ Hook System ============
export { HookSystem, hookSystem } from '../../agent-service/runtime/hook-system';
export type { Hook, HookContext, HookResult } from '../../agent-service/runtime/hook-system';

// ============ Provider Layer ============
// LLM Providers
export {
  ModelRouter,
  createModelRouter,
  OpenAICompatibleProvider,
  createOpenAICompatibleProvider,
  AnthropicProvider,
  createAnthropicProvider,
  LocalProvider,
  createLocalProvider,
} from '../../agent-service/runtime/provider/llm';
export type {
  ModelRouterConfig,
  RouteResult,
  ModelConfig,
  OpenAICompatibleConfig,
  AnthropicConfig,
  LocalProviderConfig,
  LLMProvider,
  GenerationConfig,
  ProviderCapabilities,
} from '../../agent-service/runtime/provider/llm';

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

// Memory System
export {
  MemoryManager,
  MemoryStore,
  OpenAIEmbedding,
  NoEmbedding,
  createEmbeddingService,
  MemorySearcher,
  ConversationSummarizer,
  classifyMemory,
  classifyMemoriesBatch,
} from '../../agent-service/runtime/capability/memory';
export type {
  MemoryManagerConfig,
  MemoryEntry,
  MemoryMetadata,
  Summary,
  MemoryStats,
  SearchOptions,
  MemoryFilter,
  EmbeddingService,
  SummarizerConfig,
} from '../../agent-service/runtime/capability/memory';

// Knowledge System
export {
  KnowledgeBaseManager,
  KnowledgeRetriever,
  createDocumentScanner,
  createDocumentIndexer,
  createRetriever,
  setKnowledgeBase,
} from '../../agent-service/runtime/capability/knowledge';
export type {
  KnowledgeBaseConfig,
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeSearchResult,
  RetrieverConfig,
} from '../../agent-service/runtime/capability/knowledge';

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
