/**
 * MicroAgent 核心类型定义
 * 
 * 零依赖模块，定义所有核心接口和类型。
 * 遵循 MCP (Model Context Protocol) 兼容的 Tool/Resource/Prompt 原语规范。
 */

// 核心接口
export * from './interfaces';

// 事件类型
export * from './events';

// 工具类型（MCP 兼容）
export * from './tool';

// 消息类型（包含 SessionKey）
export * from './message';

// Provider 类型（包含意图识别类型，排除 MemoryTypeString 以避免重复）
export type {
  ProviderType,
  GenerationConfig,
  ProviderCapabilities,
  ModelInfo,
  Provider,
  LLMProvider,
  ACPProvider,
  A2AProvider,
  MCPProvider,
  PreflightResult,
  HistoryEntry,
  PreflightPromptBuilder,
  TaskType,
  RoutingResult,
  IntentResult,
} from './provider';

// Agent 类型
export * from './agent';

// 扩展系统类型
export * from './extension';

// 配置类型
export * from './config';

// 会话类型（排除 SessionKey 以避免重复）
export type {
  SessionId,
  SessionState,
  SessionMetadata,
  SessionSnapshot,
  SessionStore,
} from './session';

// 记忆类型
export * from './memory';

// 执行上下文类型
export * from './execution-context';

// 黑板类型
export * from './blackboard';
