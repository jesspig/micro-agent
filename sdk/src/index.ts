/**
 * MicroAgent SDK
 * 
 * 轻量级 AI Agent SDK，聚合所有运行时模块。
 */

// ============ Types - 核心类型定义 ============
export * from '../../agent-service/types';

// SDK Client Types（排除已在 agent-service/types 中定义的类型）
export type {
  ToolConfig,
  SkillConfig,
  MemoryConfig,
  KnowledgeConfig,
  RuntimeConfig,
  StreamChunk,
  SDKClientConfig,
  PromptTemplate,
  StreamHandler,
  LLMMessage,
  ToolCall,
  ExecutionContext,
  TaskStatus,
  SDKRequest,
  SDKResponse,
  TransportType,
  LogOutputType,
  LogHandler,
  IPCConfig,
  HTTPConfig,
  WebSocketConfig,
  SessionKey,
} from './client/types';
// 注意：MemoryEntry, MemorySearchResult 已在 agent-service/types/memory.ts 中定义

// ============ Runtime - 运行时引擎 ============
// Infrastructure
export { ContainerImpl, container } from '../../agent-service/runtime/infrastructure/container';
export { EventBus, eventBus } from '../../agent-service/runtime/infrastructure/event-bus';
export { MessageBus } from '../../agent-service/runtime/infrastructure/message-bus';
export { SessionStore } from '../../agent-service/runtime/infrastructure/database';
export type { Session, SessionMessage, SessionMetadata, SessionStoreConfig } from '../../agent-service/runtime/infrastructure/database';
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

// Hook System
export { HookSystem, hookSystem } from '../../agent-service/runtime/hook-system';
export type { Hook, HookContext, HookResult } from '../../agent-service/runtime/hook-system';

// Provider Layer
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

// Tool System
export { ToolRegistry, createToolRegistry } from '../../agent-service/runtime/capability/tool-system';
export type { ToolRegistryConfig } from '../../agent-service/runtime/capability/tool-system';

// ============ Skill - 技能模块 ============
export { SkillRegistry, createSkillRegistry } from '../../agent-service/runtime/capability/skill-system';
export type { SkillRegistryConfig, SkillDefinition, SkillExample, SkillMatch } from '../../agent-service/runtime/capability/skill-system';
export type { Skill, SkillSummary, SkillRequires, SkillMetadata, SkillInstallSpec } from './skill/types';

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

// Kernel Layer
export { AgentOrchestrator } from '../../agent-service/runtime/kernel/orchestrator';
export type { OrchestratorConfig, StreamCallbacks } from '../../agent-service/runtime/kernel/orchestrator';

export { AgentPlanner } from '../../agent-service/runtime/kernel/planner';
export type { PlannerConfig, PlanResult } from '../../agent-service/runtime/kernel/planner';

export { ExecutionEngine } from '../../agent-service/runtime/kernel/execution-engine';
export type { ExecutionEngineConfig, ExecutionResult } from '../../agent-service/runtime/kernel/execution-engine';

export { ContextManager } from '../../agent-service/runtime/kernel/context-manager';
export type { ContextManagerConfig, ContextState } from '../../agent-service/runtime/kernel/context-manager';

// ============ SDK Client ============
export { MicroAgentClient, createClient } from './api/client';

// API 模块
export { SessionAPI } from './api/session';
export { ChatAPI, type ChatOptions } from './api/chat';
export { TaskAPI, type TaskInfo } from './api/task';
export { MemoryAPI, type MemorySearchOptions } from './api/memory';
export { ConfigAPI } from './api/config';
export { PromptAPI } from './api/prompt';

// 传输层
export { HTTPTransport } from './transport/http';
export { WebSocketTransport } from './transport/websocket';
export { IPCTransport } from './transport/ipc';

// 客户端核心
export { RequestBuilder } from './client/request-builder';
export { ResponseParser } from './client/response-parser';
export { ErrorHandler, SDKError } from './client/error-handler';
export type { SDKErrorCode } from './client/error-handler';

// ============ Tool - 工具模块 ============
export { ToolBuilder, createToolBuilder } from './tool/builder';
export { BaseTool } from './tool/base';
export type { ToolBuilderOptions } from './tool/builder';

// ============ Define - 定义函数 ============
export { defineTool, defineChannel, defineSkill } from './define';
export type { DefineToolOptions, DefineChannelOptions, DefineSkillOptions } from './define';
