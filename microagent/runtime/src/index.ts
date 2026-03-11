// ===== 核心类型 =====
export type {
  Message,
  MessageRole,
  ChatRequest,
  ChatResponse,
  ToolDefinition,
  ToolParameterSchema,
  ToolCall,
  UsageStats,
  SkillMeta,
  ChannelCapabilities,
  ChannelConfig,
  OutboundMessage,
  SendResult,
  InboundMessage,
  MessageHandler,
  SessionMetadata,
} from "./types.js";

// ===== 接口契约 =====
export type {
  IProvider,
  ITool,
  ISkill,
  ISkillLoader,
  IChannel,
  IMemory,
  ISession,
  IRegistry,
  EventHandler,
  IEventEmitter,
} from "./contracts.js";

// ===== 错误类型 =====
export {
  MicroAgentError,
  ProviderError,
  ToolError,
  ToolInputError,
  ChannelError,
  ConfigError,
  SessionError,
  MemoryError,
  TimeoutError,
  MaxIterationsError,
  RegistryError,
} from "./errors.js";

// ===== Bus 消息总线 =====
export { EventBus, createEventBus } from "./bus/events.js";
export type { EventMap } from "./bus/events.js";
export { AsyncQueue } from "./bus/queue.js";

// ===== Provider 抽象 =====
export type { ProviderCapabilities, ProviderConfig, ProviderStatus } from "./provider/types.js";
export type { IProviderExtended } from "./provider/contract.js";
export { BaseProvider } from "./provider/base.js";
export { ProviderRegistry } from "./provider/registry.js";

// ===== Tool 抽象 =====
export type { ToolResult, ToolPolicy, ToolGroup } from "./tool/types.js";
export type { IToolExtended, ToolFactory } from "./tool/contract.js";
export { BaseTool } from "./tool/base.js";
export { ToolRegistry, TOOL_GROUPS } from "./tool/registry.js";

// ===== Skill 抽象 =====
export type { SkillConfig, SkillContent, SkillSummary } from "./skill/types.js";
export type { ISkillExtended, ISkillLoaderExtended } from "./skill/contract.js";
export { Skill, BaseSkillLoader } from "./skill/loader.js";
export { SkillRegistry } from "./skill/registry.js";

// ===== Channel 抽象 =====
export type { ChannelType, ChannelStatus } from "./channel/types.js";
export type { IChannelExtended, MessageHandler as ChannelMessageHandler } from "./channel/contract.js";
export { BaseChannel } from "./channel/base.js";
export { ChannelManager } from "./channel/manager.js";

// ===== Memory 抽象 =====
export type { MemorySource, MemoryEntry, MemoryConfig, MemorySearchResult } from "./memory/types.js";
export type { IMemoryExtended } from "./memory/contract.js";
export { BaseMemory } from "./memory/base.js";
export { MemoryRegistry } from "./memory/registry.js";

// ===== Kernel 核心调度 =====
export type { AgentState, AgentEvent, AgentConfig, IterationResult } from "./kernel/types.js";
export { AgentLoop } from "./kernel/agent-loop.js";
export type { AgentEventHandler } from "./kernel/agent-loop.js";

// ===== Session 管理 =====
export type { SessionConfig, SessionState, SessionSnapshot } from "./session/types.js";
export { Session, SessionManager } from "./session/manager.js";
export { ContextBuilder } from "./session/context-builder.js";
export type { ContextBuildOptions } from "./session/context-builder.js";
