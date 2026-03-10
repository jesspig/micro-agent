/**
 * LangGraph 模块入口
 *
 * 提供基于 LangGraph 的 ReAct Agent 实现
 */

// 核心导出
export { ReActAgentState, type AgentState, type AgentStateUpdate } from "./state";
export { createAgentGraph, LangGraphOrchestrator } from "./graph";

// 节点导出
export {
  createBuildContextNode,
  createThinkingNode,
  createToolsNode,
  createObserveNode,
} from "./nodes";

// 边导出
export { createShouldContinueEdge, type RouteDecision } from "./edges/should-continue";

// 类型导出
export type {
  ReActState,
  ActionState,
  ReasoningStep,
  ActionRecord,
  Observation,
  ErrorRecord,
  TokenUsage,
  TokenBudget,
  ToolCall,
  ToolResult,
  LLMMessage,
  MemoryEntry,
  KnowledgeSearchResult,
  StreamCallbacks,
  StateChangeCallbacks,
  LangGraphAgentConfig,
  InboundMessage,
  ToolContext,
} from "./types";

// 计划类型导出
export type {
  ExecutionPlan,
  SubTask,
  SubTaskStatus,
  PlannerConfig,
} from "./nodes/planner-node";

// 状态辅助函数导出
export {
  hasPendingToolCalls,
  getRemainingTokens,
  isOverBudget,
  createReasoningUpdate,
  createActionUpdate,
  createObservationUpdate,
  createErrorUpdate,
  createCompletionUpdate,
} from "./state";

// 错误处理导出
export {
  ErrorType,
  ErrorHandler,
  RecoveryManager,
  createErrorHandler,
  createRecoveryManager,
  type BackoffStrategy,
  type RetryPolicy,
  type FallbackStrategy,
  type CircuitBreakerConfig,
  type ErrorHandlingStrategy,
  type ErrorContext,
  type ErrorHandlingResult,
  type Checkpoint,
} from "./error-recovery";

// 资源监控器导出
export {
  ResourceMonitor,
  type ResourceRequirement,
  type ResourceAvailability,
  type SystemMetrics,
  type LLMMetrics,
  type NetworkMetrics,
  type ResourceMonitorConfig,
  type TaskType,
} from "./resource-monitor";
