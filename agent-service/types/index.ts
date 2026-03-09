/**
 * MicroAgent 核心类型定义
 *
 * 零依赖模块，定义所有核心接口和类型。
 * 遵循 MCP (Model Context Protocol) 兼容的 Tool/Resource/Prompt 原语规范。
 *
 * 导出结构：
 * 1. 核心接口 - interfaces
 * 2. 事件类型 - events
 * 3. 工具类型 - tool (MCP 兼容)
 * 4. 消息类型 - message
 * 5. Provider 类型 - provider
 * 6. Agent 类型 - agent
 * 7. 扩展系统类型 - extension
 * 8. 配置类型 - config
 * 9. 会话类型 - session
 * 10. 记忆类型 - memory
 * 11. 嵌入模型类型 - embedding
 * 12. 执行上下文类型 - execution-context
 * 13. 黑板类型 - blackboard
 */

// ============================================================
// 核心接口
// ============================================================
export * from './interfaces';

// ============================================================
// 事件类型
// ============================================================
export * from './events';

// ============================================================
// 工具类型（MCP 兼容）
// ============================================================
export * from './tool';

// ============================================================
// 消息类型（包含 SessionKey）
// ============================================================
export * from './message';

// ============================================================
// Provider 类型
// ============================================================
// 排除 MemoryTypeString 以避免与 memory 模块重复
export type {
  ProviderType,
  GenerationConfig,
  ProviderCapabilities,
  ProviderVendor,
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

// ============================================================
// Agent 类型
// ============================================================
export * from './agent';

// ============================================================
// 扩展系统类型
// ============================================================
export * from './extension';

// ============================================================
// 配置类型
// ============================================================
export * from './config';

// ============================================================
// 会话类型
// ============================================================
export type {
  // 基础类型
  SessionId,
  SessionKey,
  SessionState,
  SessionTag,
  // 会话上下文配置
  SessionContextConfig,
  ContextInjectionStrategy,
  RelatedSessionSummary,
  SessionContextInjection,
  // 会话元数据和快照
  SessionMetadata,
  SessionSnapshot,
  SessionStore,
  // 会话列表管理
  SessionListItem,
  SessionListFilter,
  SessionListSort,
  SessionListPagination,
  SessionListResult,
  // 会话标题生成
  SessionTitleOptions,
  SessionSummaryOptions,
  SessionTitleResult,
  SessionSummaryResult,
} from './session';

// ============================================================
// 知识库类型
// ============================================================
export type {
  KnowledgeSourceMetadata,
} from './knowledge';

// ============================================================
// 记忆类型
// ============================================================
export type {
  // 基础类型
  MemoryType,
  MemoryTypeString,
  MemoryStatus,
  // 记忆条目
  MemoryEntry,
  MemoryMetadata,
  // 记忆检索
  MemorySearchResult,
  MemorySearchOptions,
  MemoryFilter,
  // 记忆统计
  MemoryStats,
  // 记忆存储接口
  MemoryStore,
  // 记忆管理器配置
  MemoryManagerConfig,
} from './memory';

// ============================================================
// 嵌入模型类型
// ============================================================
export type {
  // 模型状态
  EmbeddingModelStatus,
  MigrationStatus,
  // 模型配置
  EmbeddingModel,
  // 嵌入向量
  EmbeddingVector,
  // 迁移任务
  EmbeddingMigration,
  MigrationConfig,
  MigrationProgress,
  // 模型切换
  ModelSwitchResult,
  EmbeddingModelRegisterOptions,
  // 向量检索
  VectorSearchOptions,
} from './embedding';

// ============================================================
// 执行上下文类型
// ============================================================
export type {
  // 配置
  ExecutionContextConfig,
  // 状态
  ExecutionContextState,
  // 执行上下文
  ExecutionContext,
  // 快照
  ExecutionContextSnapshot,
} from './execution-context';

// ============================================================
// 黑板类型
// ============================================================
export type {
  // ReAct 状态
  ReActState,
  // 推理步骤
  ReasoningStep,
  // 行动记录
  ActionState,
  ActionRecord,
  // 观察结果
  Observation,
  // 计划
  PlanStep,
  Plan,
  // 错误记录
  ErrorRecord,
  // 会话状态
  SessionState as BlackboardSessionState,
  // 黑板快照
  BlackboardSnapshot,
  // 工作记忆
  Goal,
  SubTask,
  WorkingMemory,
  // 黑板数据结构
  BlackboardData,
  // 黑板操作接口
  BlackboardOperations,
  // 黑板接口
  Blackboard,
} from './blackboard';

// ============================================================
// 偏好类型
// ============================================================
export type { PreferenceType } from './preference';
